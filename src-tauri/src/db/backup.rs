use super::*;
use std::collections::{HashMap, HashSet};

pub const MAX_BACKUP_BYTES: usize = 64 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SpaceBackup {
    pub format: String,
    pub version: u32,
    pub created_at: String,
    pub documents: Vec<BackupDocument>,
    pub tags: Vec<BackupTag>,
    pub history: Vec<BackupHistory>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub attachments: Vec<PortableAttachment>,
}

/// Deliberate allowlist: no account identity, tokens, revisions, outbox or cursors.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BackupDocument {
    pub id: String,
    pub title: String,
    pub node_kind: String,
    pub parent_id: Option<String>,
    pub depth: i64,
    pub content_json: String,
    pub status: String,
    pub is_favorite: bool,
    pub is_template: bool,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
    pub deleted_at: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BackupTag {
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BackupHistory {
    pub document_id: String,
    pub content_json: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct BackupPreview {
    pub created_at: String,
    pub documents: usize,
    pub folders: usize,
    pub tags: usize,
    pub retained_history: usize,
    pub discarded_history: usize,
    pub titles: Vec<String>,
    pub attachments: usize,
    pub attachment_bytes: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct BackupImportResult {
    pub documents: usize,
    pub folders: usize,
    pub retained_history: usize,
    pub first_document_id: Option<String>,
    pub attachments: usize,
}

pub fn export_space_backup(app: &AppHandle, expected_scope: &str) -> Result<String> {
    let connection = open_scoped_db(app, expected_scope)?;
    let conn = connection.unchecked_transaction()?;
    validate_tree(&conn)?;
    let mut stmt = conn.prepare("SELECT id FROM documents WHERE is_purged=0 ORDER BY depth,id")?;
    let ids = stmt
        .query_map([], |r| r.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(stmt);
    let mut documents = Vec::with_capacity(ids.len());
    for id in ids {
        let d = get_document_from_conn(&conn, &id)?.context("快照中文档不存在")?;
        documents.push(BackupDocument {
            id: d.id,
            title: d.title,
            node_kind: d.node_kind,
            parent_id: d.parent_id,
            depth: d.depth,
            content_json: d.content_json,
            status: d.status,
            is_favorite: d.is_favorite,
            is_template: d.is_template,
            created_at: d.created_at,
            updated_at: d.updated_at,
            archived_at: d.archived_at,
            deleted_at: d.deleted_at,
            tags: d.tags,
        });
    }
    let tags = {
        let mut stmt = conn.prepare("SELECT name,color FROM tags ORDER BY name")?;
        let result = stmt
            .query_map([], |r| {
                Ok(BackupTag {
                    name: r.get(0)?,
                    color: r.get(1)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        result
    };
    let history = {
        let mut stmt = conn.prepare("SELECT h.document_id,h.snapshot,h.created_at FROM document_history h JOIN documents d ON d.id=h.document_id WHERE d.is_purged=0 AND d.node_kind='document' ORDER BY h.created_at,h.rowid")?;
        let result = stmt
            .query_map([], |r| {
                Ok(BackupHistory {
                    document_id: r.get(0)?,
                    content_json: r.get(1)?,
                    created_at: r.get(2)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        result
    };
    let attachments = super::attachments::portable_from_conn(&conn, None)?;
    let backup = SpaceBackup {
        format: "vana-space-backup".into(),
        version: if attachments.is_empty() { 1 } else { 2 },
        created_at: now_iso(),
        documents,
        tags,
        history,
        attachments,
    };
    let json = serde_json::to_string(&backup)?;
    anyhow::ensure!(json.len() <= MAX_BACKUP_BYTES, "备份超过 64 MiB 文件上限");
    // Validate our own output too; malformed legacy data must not become a falsely
    // reassuring backup which can never be imported.
    validate_backup(&json)?;
    conn.commit()?;
    Ok(json)
}

fn valid_time(value: &str) -> Result<()> {
    chrono::DateTime::parse_from_rfc3339(value).context("备份时间格式无效")?;
    Ok(())
}

fn insert_document(
    conn: &Connection,
    d: &BackupDocument,
    id: &str,
    parent: Option<&str>,
    updated_at: &str,
) -> Result<()> {
    let plain = super::history::history_plain_text(&serde_json::from_str(&d.content_json)?);
    conn.execute("INSERT INTO documents(id,title,node_kind,parent_id,depth,content_json,plain_text,status,is_favorite,is_template,created_at,updated_at,archived_at,deleted_at)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
        params![id,d.title,d.node_kind,parent,d.depth,d.content_json,plain,d.status,d.is_favorite,d.is_template,d.created_at,updated_at,d.archived_at,d.deleted_at])?;
    replace_document_tags(conn, id, &d.tags)?;
    Ok(())
}

fn insert_tags(conn: &Connection, tags: &[BackupTag]) -> Result<()> {
    for tag in tags {
        // Existing tags in the destination retain their color.
        conn.execute(
            "INSERT OR IGNORE INTO tags(id,name,color) VALUES (?1,?2,?3)",
            params![Uuid::new_v4().to_string(), tag.name, tag.color],
        )?;
    }
    Ok(())
}

/// Deserialize and validate in a disposable database, never the destination.
fn validate_backup(json: &str) -> Result<(SpaceBackup, BackupPreview)> {
    anyhow::ensure!(json.len() <= MAX_BACKUP_BYTES, "备份超过 64 MiB 文件上限");
    let backup: SpaceBackup = serde_json::from_str(json).context("备份文件损坏或字段不受支持")?;
    anyhow::ensure!(
        backup.format == "vana-space-backup" && matches!(backup.version, 1 | 2)
            && (backup.version != 1 || backup.attachments.is_empty()),
        "不支持的备份格式或版本"
    );
    valid_time(&backup.created_at)?;
    anyhow::ensure!(
        backup.documents.len() <= 10_000
            && backup.tags.len() <= 10_000
            && backup.history.len() <= 200_000 && backup.attachments.len() <= 1000,
        "备份记录过多"
    );
    let isolated = Connection::open_in_memory()?;
    isolated.execute_batch("PRAGMA foreign_keys=ON;")?;
    init_schema(&isolated)?;
    let mut tag_names = HashSet::new();
    for tag in &backup.tags {
        anyhow::ensure!(
            !tag.name.trim().is_empty()
                && tag.name == tag.name.trim()
                && tag.name.len() <= 512
                && tag_names.insert(&tag.name),
            "标签名称无效或重复"
        );
        if let Some(color) = &tag.color {
            anyhow::ensure!(
                color.len() == 7
                    && color.starts_with('#')
                    && color[1..].bytes().all(|b| b.is_ascii_hexdigit()),
                "标签颜色无效"
            );
        }
    }
    insert_tags(&isolated, &backup.tags)?;
    let mut ids = HashMap::new();
    for d in &backup.documents {
        Uuid::parse_str(&d.id).context("备份文档 ID 无效")?;
        anyhow::ensure!(
            ids.insert(&d.id, &d.node_kind).is_none(),
            "备份包含重复文档 ID"
        );
        anyhow::ensure!(
            matches!(d.node_kind.as_str(), "document" | "folder")
                && matches!(d.status.as_str(), "active" | "archived" | "trashed")
                && (0..=7).contains(&d.depth),
            "备份文档类型、状态或深度无效"
        );
        anyhow::ensure!(
            d.title.len() <= 16_384 && d.tags.len() <= 100,
            "标题或标签超过备份上限"
        );
        let mut unique_tags = HashSet::new();
        anyhow::ensure!(
            d.tags
                .iter()
                .all(|t| tag_names.contains(t) && unique_tags.insert(t)),
            "文档引用了不存在或重复的标签"
        );
        valid_time(&d.created_at)?;
        valid_time(&d.updated_at)?;
        if let Some(time) = &d.archived_at {
            valid_time(time)?;
        }
        if let Some(time) = &d.deleted_at {
            valid_time(time)?;
        }
        validate_content(&d.content_json)?;
        ensure_document_content_size(&d.content_json)?;
        insert_document(&isolated, d, &d.id, d.parent_id.as_deref(), &d.updated_at)?;
    }
    validate_tree(&isolated)?;
    for h in &backup.history {
        anyhow::ensure!(
            ids.get(&h.document_id).map(|kind| kind.as_str()) == Some("document"),
            "历史引用了不存在的文档或分组"
        );
        valid_time(&h.created_at)?;
        validate_content(&h.content_json)?;
        ensure_document_content_size(&h.content_json)?;
        isolated.execute(
            "INSERT INTO document_history(id,document_id,snapshot,created_at) VALUES (?1,?2,?3,?4)",
            params![
                Uuid::new_v4().to_string(),
                h.document_id,
                h.content_json,
                h.created_at
            ],
        )?;
    }
    for attachment in &backup.attachments {
        super::attachments::insert_portable(&isolated, attachment, &attachment.metadata.id, &attachment.metadata.document_id)?;
    }
    prune_history(&isolated)?;
    let retained: usize =
        isolated.query_row("SELECT COUNT(*) FROM document_history", [], |r| r.get(0))?;
    let preview = BackupPreview {
        attachments: backup.attachments.len(),
        attachment_bytes: backup.attachments.iter().map(|a| a.metadata.size_bytes).sum(),
        created_at: backup.created_at.clone(),
        documents: backup
            .documents
            .iter()
            .filter(|d| d.node_kind == "document")
            .count(),
        folders: backup
            .documents
            .iter()
            .filter(|d| d.node_kind == "folder")
            .count(),
        tags: backup.tags.len(),
        retained_history: retained,
        discarded_history: backup.history.len() - retained,
        titles: backup
            .documents
            .iter()
            .take(8)
            .map(|d| d.title.clone())
            .collect(),
    };
    // Copy back only retained histories, in original order, so import and preview
    // share the same retention contract even for a hand-edited backup.
    let mut backup = backup;
    let mut stmt = isolated.prepare(
        "SELECT document_id,snapshot,created_at FROM document_history ORDER BY created_at,rowid",
    )?;
    backup.history = stmt
        .query_map([], |r| {
            Ok(BackupHistory {
                document_id: r.get(0)?,
                content_json: r.get(1)?,
                created_at: r.get(2)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok((backup, preview))
}

pub fn preview_space_backup(
    app: &AppHandle,
    expected_scope: &str,
    json: &str,
) -> Result<BackupPreview> {
    // Account switch detection applies to preview as well as write.
    let _connection = open_scoped_db(app, expected_scope)?;
    Ok(validate_backup(json)?.1)
}

pub fn import_space_backup(
    app: &AppHandle,
    expected_scope: &str,
    json: &str,
) -> Result<BackupImportResult> {
    let (backup, preview) = validate_backup(json)?;
    let connection = open_scoped_db(app, expected_scope)?;
    let conn = rusqlite::Transaction::new_unchecked(
        &connection,
        rusqlite::TransactionBehavior::Immediate,
    )?;
    ensure_document_count_capacity(&conn, preview.documents)?;
    let mapping: HashMap<_, _> = backup
        .documents
        .iter()
        .map(|d| (d.id.as_str(), Uuid::new_v4().to_string()))
        .collect();
    insert_tags(&conn, &backup.tags)?;
    let now = now_iso();
    for d in &backup.documents {
        ensure_write_budget(&conn)?;
        let id = &mapping[d.id.as_str()];
        let parent = d.parent_id.as_ref().map(|p| mapping[p.as_str()].as_str());
        insert_document(&conn, d, id, parent, &now)?;
        queue_job(&conn, "document", id, "import-backup", "")?;
    }
    for h in &backup.history {
        conn.execute(
            "INSERT INTO document_history(id,document_id,snapshot,created_at) VALUES (?1,?2,?3,?4)",
            params![
                Uuid::new_v4().to_string(),
                mapping[h.document_id.as_str()],
                h.content_json,
                h.created_at
            ],
        )?;
    }
    for attachment in &backup.attachments {
        let destination = mapping.get(attachment.metadata.document_id.as_str()).context("备份附件引用的文档不存在")?;
        super::attachments::insert_portable(&conn, attachment, &Uuid::new_v4().to_string(), destination)?;
    }
    prune_history(&conn)?;
    validate_tree(&conn)?;
    ensure_total_storage_capacity(&conn, 0)?;
    let mut retained_history = 0usize;
    for id in mapping.values() {
        retained_history += conn.query_row(
            "SELECT COUNT(*) FROM document_history WHERE document_id=?1",
            params![id],
            |r| r.get::<_, usize>(0),
        )?;
    }
    let result = BackupImportResult {
        attachments: backup.attachments.len(),
        documents: preview.documents,
        folders: preview.folders,
        retained_history,
        first_document_id: backup
            .documents
            .iter()
            .find(|d| d.node_kind == "document")
            .map(|d| mapping[d.id.as_str()].clone()),
    };
    conn.commit()?;
    Ok(result)
}
