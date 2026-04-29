use anyhow::{Context, Result};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const DEFAULT_DOCUMENT_CONTENT: &str =
    r#"{"type":"doc","content":[{"type":"paragraph","content":[]}]} "#;
const DEFAULT_SUPABASE_URL: Option<&str> = option_env!("VANA_PUBLIC_SUPABASE_URL");
const DEFAULT_SUPABASE_ANON_KEY: Option<&str> = option_env!("VANA_PUBLIC_SUPABASE_ANON_KEY");
const MAX_DOCUMENT_CONTENT_BYTES: usize = 512 * 1024;
const MAX_TOTAL_STORAGE_BYTES: usize = 25 * 1024 * 1024;
const MAX_DOCUMENT_COUNT: usize = 5_000;
const MAX_WRITE_OPS_PER_5_MINUTES: usize = 300;
const HOSTED_ATTACHMENTS_ENABLED: bool = false;

fn effective_supabase_config(conn: &Connection) -> Result<SupabaseConfig> {
    Ok(SupabaseConfig {
        url: get_config_value(conn, "supabase.url")?
            .or_else(|| DEFAULT_SUPABASE_URL.map(str::to_string)),
        anon_key: get_config_value(conn, "supabase.anon_key")?
            .or_else(|| DEFAULT_SUPABASE_ANON_KEY.map(str::to_string)),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentSummary {
    pub id: String,
    pub title: String,
    pub node_kind: String,
    pub parent_id: Option<String>,
    pub depth: i64,
    pub status: String,
    pub is_favorite: bool,
    pub is_template: bool,
    pub updated_at: String,
    pub created_at: String,
    pub archived_at: Option<String>,
    pub deleted_at: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentRecord {
    pub id: String,
    pub title: String,
    pub node_kind: String,
    pub parent_id: Option<String>,
    pub depth: i64,
    pub content_json: String,
    pub plain_text: String,
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
pub struct TagRecord {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub document_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupabaseConfig {
    pub url: Option<String>,
    pub anon_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupabaseSession {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<i64>,
    pub token_type: Option<String>,
    pub user_id: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncSnapshot {
    pub mode: String,
    pub pending_jobs: usize,
    pub last_synced_at: Option<String>,
    pub last_pulled_at: Option<String>,
    pub auto_sync_enabled: bool,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppState {
    pub account_mode: String,
    pub onboarding_completed: bool,
    pub service_profile: String,
    pub account_email: Option<String>,
    pub local_db_path: String,
    pub legacy_workspace_path: String,
    pub supabase: SupabaseConfig,
    pub sync: SyncSnapshot,
    pub limits: UsageLimits,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageLimits {
    pub max_document_content_bytes: usize,
    pub max_total_storage_bytes: usize,
    pub max_document_count: usize,
    pub max_write_ops_per_5_minutes: usize,
    pub attachments_enabled: bool,
    pub current_document_count: usize,
    pub current_total_storage_bytes: usize,
    pub current_write_ops_last_5_minutes: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveDocumentInput {
    pub id: String,
    pub title: String,
    pub content_json: String,
    pub plain_text: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LegacyImportResult {
    pub imported_documents: usize,
    pub skipped_entries: usize,
    pub imported_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncDocumentRecord {
    pub id: String,
    pub title: String,
    pub node_kind: String,
    pub parent_id: Option<String>,
    pub depth: i64,
    pub content_json: String,
    pub plain_text: String,
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
pub struct SyncDocumentStructure {
    pub id: String,
    pub node_kind: String,
    pub parent_id: Option<String>,
    pub depth: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncExport {
    pub pending_job_ids: Vec<i64>,
    pub documents: Vec<SyncDocumentRecord>,
    pub last_pulled_at: Option<String>,
}

pub fn local_data_dir(app: &AppHandle) -> Result<PathBuf> {
    let base = app
        .path()
        .app_data_dir()
        .context("无法获取应用数据目录")?;
    let dir = base.join("vana-local");
    std::fs::create_dir_all(&dir).with_context(|| format!("无法创建数据目录: {}", dir.display()))?;
    Ok(dir)
}

pub fn legacy_workspace_dir(app: &AppHandle) -> Result<PathBuf> {
    let platform = std::env::consts::OS;
    let base_path = match platform {
        "windows" => std::env::var("APPDATA")
            .map(|p| PathBuf::from(p).join("Vana"))
            .map_err(|e| anyhow::anyhow!("无法获取 APPDATA: {}", e))?,
        "linux" => dirs::home_dir()
            .ok_or_else(|| anyhow::anyhow!("无法获取用户主目录"))?
            .join(".local/share/Vana"),
        "android" => app
            .path()
            .app_data_dir()
            .context("无法获取 Android 应用数据目录")?
            .join("Vana"),
        other => return Err(anyhow::anyhow!("不支持的平台: {}", other)),
    };

    let workspace = base_path.join("workspace");
    std::fs::create_dir_all(&workspace)
        .with_context(|| format!("无法创建旧工作区目录: {}", workspace.display()))?;
    Ok(workspace)
}

pub fn db_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(local_data_dir(app)?.join("vana.db"))
}

pub fn open_db(app: &AppHandle) -> Result<Connection> {
    let path = db_path(app)?;
    let conn = Connection::open(&path)
        .with_context(|| format!("无法打开数据库: {}", path.display()))?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    init_schema(&conn)?;
    seed_if_empty(&conn)?;
    Ok(conn)
}

fn init_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            node_kind TEXT NOT NULL DEFAULT 'document',
            parent_id TEXT,
            depth INTEGER NOT NULL DEFAULT 0,
            content_json TEXT NOT NULL,
            plain_text TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'active',
            is_favorite INTEGER NOT NULL DEFAULT 0,
            is_template INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            archived_at TEXT,
            deleted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            color TEXT
        );

        CREATE TABLE IF NOT EXISTS document_tags (
            document_id TEXT NOT NULL,
            tag_id TEXT NOT NULL,
            PRIMARY KEY (document_id, tag_id),
            FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
            FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS document_history (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            snapshot TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS attachments (
            id TEXT PRIMARY KEY,
            document_id TEXT,
            file_name TEXT NOT NULL,
            mime_type TEXT,
            local_path TEXT,
            remote_path TEXT,
            size_bytes INTEGER,
            kind TEXT NOT NULL DEFAULT 'file',
            storage_bucket TEXT,
            storage_object_path TEXT,
            checksum_sha256 TEXT,
            upload_state TEXT NOT NULL DEFAULT 'local-only',
            created_at TEXT NOT NULL,
            FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS sync_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            action TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL,
            processed_at TEXT,
            error_message TEXT
        );

        CREATE TABLE IF NOT EXISTS app_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        ",
    )?;
    ensure_column(conn, "documents", "node_kind", "TEXT NOT NULL DEFAULT 'document'")?;
    ensure_column(conn, "documents", "parent_id", "TEXT")?;
    ensure_column(conn, "documents", "depth", "INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(conn, "attachments", "kind", "TEXT NOT NULL DEFAULT 'file'")?;
    ensure_column(conn, "attachments", "storage_bucket", "TEXT")?;
    ensure_column(conn, "attachments", "storage_object_path", "TEXT")?;
    ensure_column(conn, "attachments", "checksum_sha256", "TEXT")?;
    ensure_column(conn, "attachments", "upload_state", "TEXT NOT NULL DEFAULT 'local-only'")?;
    Ok(())
}

fn seed_if_empty(conn: &Connection) -> Result<()> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM documents", [], |row| row.get(0))?;
    if count > 0 {
        return Ok(());
    }

    let now = now_iso();
    let welcome_id = Uuid::new_v4().to_string();
    let welcome = r#"{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Welcome to Vana"}]},{"type":"paragraph","content":[{"type":"text","text":"本地优先主线默认连接可选的 Supabase Hosted 同步，同时保留访客模式。"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"首次启动可先以访客身份使用，再决定是否登录"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"文档仍然先写本地，再进入同步队列"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"高级自托管配置继续保留在设置页"}]}]}]}"#;

    conn.execute(
        "
        INSERT INTO documents (
            id, title, node_kind, parent_id, depth, content_json, plain_text, status, is_favorite, is_template, created_at, updated_at
        ) VALUES (?1, ?2, 'document', NULL, 0, ?3, ?4, 'active', 1, 0, ?5, ?5)
        ",
        params![
            welcome_id,
            "Welcome to Vana",
            welcome,
            "Welcome to Vana 本地优先主线默认连接可选的 Supabase Hosted 同步，同时保留访客模式。",
            now,
        ],
    )?;
    Ok(())
}

pub fn get_app_state(app: &AppHandle) -> Result<AppState> {
    let conn = open_db(app)?;
    let pending_jobs: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sync_queue WHERE processed_at IS NULL",
        [],
        |row| row.get(0),
    )?;

    let last_synced_at = get_config_value(&conn, "sync.last_synced_at")?;
    let last_pulled_at = get_config_value(&conn, "sync.last_pulled_at")?;
    let last_error = get_config_value(&conn, "sync.last_error")?;
    let supabase = effective_supabase_config(&conn)?;
    let session = get_supabase_session(app)?;
    let service_profile = current_service_profile(&conn)?;
    let account_mode = if session.is_some() {
        if service_profile == "self-hosted" {
            "advanced-self-hosted".to_string()
        } else {
            "authenticated".to_string()
        }
    } else {
        "guest".to_string()
    };
    let account_email = session.as_ref().and_then(|value| value.email.clone());
    let onboarding_completed = is_onboarding_completed(&conn, session.is_some())?;

    Ok(AppState {
        account_mode,
        onboarding_completed,
        service_profile: service_profile.clone(),
        account_email,
        local_db_path: db_path(app)?.to_string_lossy().to_string(),
        legacy_workspace_path: legacy_workspace_dir(app)?.to_string_lossy().to_string(),
        supabase: supabase.clone(),
        sync: SyncSnapshot {
            mode: current_sync_mode(&conn)?,
            pending_jobs: pending_jobs as usize,
            last_synced_at,
            last_pulled_at,
            auto_sync_enabled: get_auto_sync(&conn)?,
            last_error,
        },
        limits: current_usage_limits(&conn)?,
    })
}

pub fn list_documents(app: &AppHandle, status: Option<String>) -> Result<Vec<DocumentSummary>> {
    let conn = open_db(app)?;
    let docs = if let Some(requested_status) = status {
        let mut stmt = conn.prepare(
            "
            SELECT id, title, node_kind, parent_id, depth, status, is_favorite, is_template, created_at, updated_at, archived_at, deleted_at
            FROM documents
            WHERE status = ?1
            ORDER BY is_favorite DESC, updated_at DESC
            ",
        )?;

        let rows = stmt.query_map(params![requested_status], |row| {
            Ok(DocumentSummary {
                id: row.get(0)?,
                title: row.get(1)?,
                node_kind: row.get(2)?,
                parent_id: row.get(3)?,
                depth: row.get(4)?,
                status: row.get(5)?,
                is_favorite: row.get::<_, i64>(6)? != 0,
                is_template: row.get::<_, i64>(7)? != 0,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
                archived_at: row.get(10)?,
                deleted_at: row.get(11)?,
                tags: Vec::new(),
            })
        })?;

        rows.collect::<std::result::Result<Vec<_>, _>>()?
    } else {
        let mut stmt = conn.prepare(
            "
            SELECT id, title, node_kind, parent_id, depth, status, is_favorite, is_template, created_at, updated_at, archived_at, deleted_at
            FROM documents
            ORDER BY
              CASE status WHEN 'active' THEN 0 WHEN 'archived' THEN 1 ELSE 2 END,
              depth ASC,
              CASE node_kind WHEN 'folder' THEN 0 ELSE 1 END,
              is_favorite DESC,
              updated_at DESC
            ",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(DocumentSummary {
                id: row.get(0)?,
                title: row.get(1)?,
                node_kind: row.get(2)?,
                parent_id: row.get(3)?,
                depth: row.get(4)?,
                status: row.get(5)?,
                is_favorite: row.get::<_, i64>(6)? != 0,
                is_template: row.get::<_, i64>(7)? != 0,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
                archived_at: row.get(10)?,
                deleted_at: row.get(11)?,
                tags: Vec::new(),
            })
        })?;

        rows.collect::<std::result::Result<Vec<_>, _>>()?
    };

    let mut enriched = Vec::with_capacity(docs.len());
    for mut doc in docs {
        doc.tags = document_tags(&conn, &doc.id)?;
        enriched.push(doc);
    }
    Ok(enriched)
}

pub fn get_document(app: &AppHandle, id: &str) -> Result<Option<DocumentRecord>> {
    let conn = open_db(app)?;
    let record = conn
        .query_row(
            "
            SELECT id, title, node_kind, parent_id, depth, content_json, plain_text, status, is_favorite, is_template, created_at, updated_at, archived_at, deleted_at
            FROM documents
            WHERE id = ?1
            ",
            params![id],
            |row| {
                Ok(DocumentRecord {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    node_kind: row.get(2)?,
                    parent_id: row.get(3)?,
                    depth: row.get(4)?,
                    content_json: row.get(5)?,
                    plain_text: row.get(6)?,
                    status: row.get(7)?,
                    is_favorite: row.get::<_, i64>(8)? != 0,
                    is_template: row.get::<_, i64>(9)? != 0,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                    archived_at: row.get(12)?,
                    deleted_at: row.get(13)?,
                    tags: Vec::new(),
                })
            },
        )
        .optional()?;

    let Some(mut document) = record else {
        return Ok(None);
    };
    document.tags = document_tags(&conn, id)?;
    Ok(Some(document))
}

pub fn create_document(
    app: &AppHandle,
    title: Option<String>,
    is_template: bool,
    node_kind: Option<String>,
    parent_id: Option<String>,
) -> Result<DocumentRecord> {
    let conn = open_db(app)?;
    let now = now_iso();
    let id = Uuid::new_v4().to_string();
    let resolved_title = title.unwrap_or_else(|| "Untitled".to_string());
    let resolved_kind = node_kind.unwrap_or_else(|| "document".to_string());
    let content = if resolved_kind == "folder" {
        r#"{"type":"doc","content":[]}"#
    } else {
        DEFAULT_DOCUMENT_CONTENT.trim()
    };
    ensure_write_budget(&conn)?;
    if resolved_kind == "document" {
        ensure_document_count_capacity(&conn, 1)?;
        ensure_document_content_size(content)?;
        ensure_total_storage_capacity(&conn, estimate_document_storage_bytes(&resolved_title, content, "") as isize)?;
    }
    let depth = resolve_parent_depth(&conn, parent_id.as_deref(), None)?;

    conn.execute(
        "
        INSERT INTO documents (
            id, title, node_kind, parent_id, depth, content_json, plain_text, status, is_favorite, is_template, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, '', 'active', 0, ?7, ?8, ?8)
        ",
        params![
            id,
            resolved_title,
            resolved_kind,
            parent_id,
            depth,
            content,
            if is_template { 1 } else { 0 },
            now
        ],
    )?;

    queue_job(&conn, "document", &id, "create", content)?;
    append_history(&conn, &id, content)?;

    get_document(app, &id)?.ok_or_else(|| anyhow::anyhow!("文档创建后读取失败"))
}

pub fn save_document(app: &AppHandle, input: SaveDocumentInput) -> Result<DocumentRecord> {
    let conn = open_db(app)?;
    let now = now_iso();
    ensure_write_budget(&conn)?;

    let existing_document: Option<(String, String, String, String)> = conn
        .query_row(
            "SELECT node_kind, title, content_json, plain_text FROM documents WHERE id = ?1",
            params![input.id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()?;

    let is_document = existing_document
        .as_ref()
        .map(|(node_kind, _, _, _)| node_kind == "document")
        .unwrap_or(true);
    if is_document {
        ensure_document_content_size(&input.content_json)?;
        let old_size = existing_document
            .as_ref()
            .map(|(_, title, content, plain)| estimate_document_storage_bytes(title, content, plain))
            .unwrap_or(0);
        let new_size = estimate_document_storage_bytes(&input.title, &input.content_json, &input.plain_text);
        ensure_total_storage_capacity(&conn, new_size as isize - old_size as isize)?;
    }

    conn.execute(
        "
        UPDATE documents
        SET title = ?2, content_json = ?3, plain_text = ?4, updated_at = ?5
        WHERE id = ?1
        ",
        params![input.id, input.title, input.content_json, input.plain_text, now],
    )?;

    replace_document_tags(&conn, &input.id, &input.tags)?;
    queue_job(&conn, "document", &input.id, "update", &input.content_json)?;

    if existing_document
        .as_ref()
        .map(|(_, _, content, _)| content.as_str())
        != Some(input.content_json.as_str())
    {
        append_history(&conn, &input.id, &input.content_json)?;
    }

    get_document(app, &input.id)?.ok_or_else(|| anyhow::anyhow!("文档保存后读取失败"))
}

pub fn move_document(app: &AppHandle, id: &str, parent_id: Option<&str>) -> Result<DocumentRecord> {
    let conn = open_db(app)?;
    let now = now_iso();
    ensure_write_budget(&conn)?;
    let depth = resolve_parent_depth(&conn, parent_id, Some(id))?;

    conn.execute(
        "
        UPDATE documents
        SET parent_id = ?2, depth = ?3, updated_at = ?4
        WHERE id = ?1
        ",
        params![id, parent_id, depth, now],
    )?;
    queue_job(
        &conn,
        "document",
        id,
        "move",
        &serde_json::json!({ "parent_id": parent_id, "depth": depth }).to_string(),
    )?;
    cascade_child_depths(&conn, id, depth)?;
    get_document(app, id)?.ok_or_else(|| anyhow::anyhow!("移动节点后读取失败"))
}

pub fn set_document_status(app: &AppHandle, id: &str, status: &str) -> Result<DocumentRecord> {
    let conn = open_db(app)?;
    let now = now_iso();
    ensure_write_budget(&conn)?;
    apply_status_to_subtree(&conn, id, status, &now)?;
    queue_job(&conn, "document", id, "status", status)?;
    get_document(app, id)?.ok_or_else(|| anyhow::anyhow!("更新文档状态失败"))
}

pub fn toggle_favorite(app: &AppHandle, id: &str, favorite: bool) -> Result<DocumentRecord> {
    let conn = open_db(app)?;
    let now = now_iso();
    ensure_write_budget(&conn)?;
    conn.execute(
        "UPDATE documents SET is_favorite = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, if favorite { 1 } else { 0 }, now],
    )?;
    queue_job(
        &conn,
        "document",
        id,
        if favorite { "favorite" } else { "unfavorite" },
        if favorite { "true" } else { "false" },
    )?;
    get_document(app, id)?.ok_or_else(|| anyhow::anyhow!("更新收藏状态失败"))
}

pub fn list_tags(app: &AppHandle) -> Result<Vec<TagRecord>> {
    let conn = open_db(app)?;
    let mut stmt = conn.prepare(
        "
        SELECT
            tags.id,
            tags.name,
            tags.color,
            COUNT(document_tags.document_id) AS document_count
        FROM tags
        LEFT JOIN document_tags ON document_tags.tag_id = tags.id
        GROUP BY tags.id, tags.name, tags.color
        ORDER BY tags.name ASC
        ",
    )?;

    let tags = stmt
        .query_map([], |row| {
            Ok(TagRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                document_count: row.get::<_, i64>(3)? as usize,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(tags)
}

pub fn upsert_tag(app: &AppHandle, id: Option<String>, name: &str, color: Option<String>) -> Result<TagRecord> {
    let conn = open_db(app)?;
    let resolved_id = id.unwrap_or_else(|| Uuid::new_v4().to_string());
    conn.execute(
        "
        INSERT INTO tags (id, name, color)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(name) DO UPDATE SET color = excluded.color
        ",
        params![resolved_id, name.trim(), color],
    )?;

    list_tags(app)?
        .into_iter()
        .find(|tag| tag.name == name.trim())
        .ok_or_else(|| anyhow::anyhow!("标签写入后读取失败"))
}

pub fn save_supabase_config(app: &AppHandle, config: SupabaseConfig) -> Result<SupabaseConfig> {
    let conn = open_db(app)?;
    set_config_value(&conn, "supabase.url", config.url.as_deref())?;
    set_config_value(&conn, "supabase.anon_key", config.anon_key.as_deref())?;
    queue_job(
        &conn,
        "config",
        "supabase",
        "update",
        &serde_json::to_string(&config)?,
    )?;
    Ok(config)
}

pub fn get_supabase_config(app: &AppHandle) -> Result<SupabaseConfig> {
    let conn = open_db(app)?;
    effective_supabase_config(&conn)
}

pub fn save_supabase_session(app: &AppHandle, session: SupabaseSession) -> Result<SupabaseSession> {
    let conn = open_db(app)?;
    set_config_value(&conn, "supabase.session", Some(&serde_json::to_string(&session)?))?;
    set_config_value(&conn, "supabase.user_id", session.user_id.as_deref())?;
    set_config_value(&conn, "supabase.email", session.email.as_deref())?;
    set_config_value(&conn, "onboarding.completed", Some("1"))?;
    Ok(session)
}

pub fn get_supabase_session(app: &AppHandle) -> Result<Option<SupabaseSession>> {
    let conn = open_db(app)?;
    let value = get_config_value(&conn, "supabase.session")?;
    value
        .map(|raw| serde_json::from_str::<SupabaseSession>(&raw).map_err(Into::into))
        .transpose()
}

pub fn clear_supabase_session(app: &AppHandle) -> Result<()> {
    let conn = open_db(app)?;
    set_config_value(&conn, "supabase.session", None)?;
    set_config_value(&conn, "supabase.user_id", None)?;
    set_config_value(&conn, "supabase.email", None)?;
    Ok(())
}

pub fn complete_onboarding(app: &AppHandle) -> Result<()> {
    let conn = open_db(app)?;
    set_config_value(&conn, "onboarding.completed", Some("1"))?;
    Ok(())
}

pub fn mark_sync_attempt(app: &AppHandle, success: bool, error: Option<&str>) -> Result<SyncSnapshot> {
    let conn = open_db(app)?;
    let now = now_iso();
    if success {
        set_config_value(&conn, "sync.last_synced_at", Some(&now))?;
        set_config_value(&conn, "sync.last_error", None)?;
    } else {
        set_config_value(&conn, "sync.last_error", error)?;
    }

    let pending_jobs: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sync_queue WHERE processed_at IS NULL",
        [],
        |row| row.get(0),
    )?;

    Ok(SyncSnapshot {
        mode: current_sync_mode(&conn)?,
        pending_jobs: pending_jobs as usize,
        last_synced_at: get_config_value(&conn, "sync.last_synced_at")?,
        last_pulled_at: get_config_value(&conn, "sync.last_pulled_at")?,
        auto_sync_enabled: get_auto_sync(&conn)?,
        last_error: get_config_value(&conn, "sync.last_error")?,
    })
}

pub fn import_legacy_workspace(
    app: &AppHandle,
    mut read_path: impl FnMut(&str) -> Result<String>,
) -> Result<LegacyImportResult> {
    let legacy_root = legacy_workspace_dir(app)?;
    let conn = open_db(app)?;

    let mut imported_documents = 0usize;
    let mut skipped_entries = 0usize;
    let mut imported_paths = Vec::new();

    for entry in walkdir::WalkDir::new(&legacy_root)
        .into_iter()
        .filter_map(|entry| entry.ok())
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let file_name = path.file_name().and_then(|name| name.to_str()).unwrap_or_default();
        if file_name.starts_with('.') {
            continue;
        }

        let content = if file_name.ends_with(".enc") {
            match read_path(&path.to_string_lossy()) {
                Ok(content) => content,
                Err(_) => {
                    skipped_entries += 1;
                    continue;
                }
            }
        } else if file_name.ends_with(".md") || file_name.ends_with(".json") || file_name.ends_with(".txt") {
            match std::fs::read_to_string(path) {
                Ok(content) => content,
                Err(_) => {
                    skipped_entries += 1;
                    continue;
                }
            }
        } else {
            skipped_entries += 1;
            continue;
        };

        let trimmed = content.trim();
        if trimmed.is_empty() {
            skipped_entries += 1;
            continue;
        }

        let title = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or("Imported Document")
            .replace(".enc", "");

        let content_json = if trimmed.starts_with('{') {
            trimmed.to_string()
        } else {
            serde_json::json!({
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [
                            {
                                "type": "text",
                                "text": trimmed
                            }
                        ]
                    }
                ]
            })
            .to_string()
        };

        let now = now_iso();
        let id = Uuid::new_v4().to_string();
        ensure_write_budget(&conn)?;
        ensure_document_count_capacity(&conn, 1)?;
        ensure_document_content_size(&content_json)?;
        ensure_total_storage_capacity(
            &conn,
            estimate_document_storage_bytes(&title, &content_json, trimmed) as isize,
        )?;
        conn.execute(
            "
            INSERT INTO documents (
                id, title, node_kind, parent_id, depth, content_json, plain_text, status, is_favorite, is_template, created_at, updated_at
            ) VALUES (?1, ?2, 'document', NULL, 0, ?3, ?4, 'active', 0, 0, ?5, ?5)
            ",
            params![id, title, content_json, trimmed, now],
        )?;
        queue_job(&conn, "document", &id, "import", trimmed)?;
        append_history(&conn, &id, trimmed)?;

        imported_documents += 1;
        imported_paths.push(path.to_string_lossy().to_string());
    }

    Ok(LegacyImportResult {
        imported_documents,
        skipped_entries,
        imported_paths,
    })
}

pub fn simple_search(app: &AppHandle, query: &str) -> Result<Vec<DocumentSummary>> {
    let conn = open_db(app)?;
    let like = format!("%{}%", query.trim());
    let mut stmt = conn.prepare(
        "
        SELECT id, title, status, is_favorite, is_template, created_at, updated_at, archived_at, deleted_at
        , node_kind, parent_id, depth
        FROM documents
        WHERE title LIKE ?1 OR plain_text LIKE ?1
        ORDER BY updated_at DESC
        ",
    )?;
    let results = stmt
        .query_map(params![like], |row| {
            Ok(DocumentSummary {
                id: row.get(0)?,
                title: row.get(1)?,
                status: row.get(2)?,
                is_favorite: row.get::<_, i64>(3)? != 0,
                is_template: row.get::<_, i64>(4)? != 0,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                archived_at: row.get(7)?,
                deleted_at: row.get(8)?,
                node_kind: row.get(9)?,
                parent_id: row.get(10)?,
                depth: row.get(11)?,
                tags: Vec::new(),
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(results)
}

pub fn export_sync_documents(app: &AppHandle) -> Result<SyncExport> {
    let conn = open_db(app)?;
    let mut stmt = conn.prepare("SELECT id FROM sync_queue WHERE processed_at IS NULL ORDER BY id ASC")?;
    let pending_job_ids = stmt
        .query_map([], |row| row.get::<_, i64>(0))?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    let mut changed_stmt = conn.prepare(
        "
        SELECT DISTINCT entity_id
        FROM sync_queue
        WHERE processed_at IS NULL AND entity_type = 'document'
        ORDER BY entity_id ASC
        ",
    )?;
    let changed_document_ids = changed_stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    let mut documents = Vec::with_capacity(changed_document_ids.len());
    for document_id in changed_document_ids {
        if let Some(detail) = get_document(app, &document_id)? {
            documents.push(SyncDocumentRecord {
                id: detail.id,
                title: detail.title,
                node_kind: detail.node_kind,
                parent_id: detail.parent_id,
                depth: detail.depth,
                content_json: detail.content_json,
                plain_text: detail.plain_text,
                status: detail.status,
                is_favorite: detail.is_favorite,
                is_template: detail.is_template,
                created_at: detail.created_at,
                updated_at: detail.updated_at,
                archived_at: detail.archived_at,
                deleted_at: detail.deleted_at,
                tags: detail.tags,
            });
        }
    }

    Ok(SyncExport {
        pending_job_ids,
        documents,
        last_pulled_at: get_config_value(&conn, "sync.last_pulled_at")?,
    })
}

pub fn export_document_structures(app: &AppHandle) -> Result<Vec<SyncDocumentStructure>> {
    let conn = open_db(app)?;
    let mut stmt = conn.prepare(
        "
        SELECT id, node_kind, parent_id, depth
        FROM documents
        WHERE node_kind = 'folder' OR parent_id IS NOT NULL OR depth > 0
        ORDER BY depth ASC, id ASC
        ",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(SyncDocumentStructure {
            id: row.get(0)?,
            node_kind: row.get(1)?,
            parent_id: row.get(2)?,
            depth: row.get(3)?,
        })
    })?;

    Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
}

pub fn apply_remote_documents(app: &AppHandle, documents: Vec<SyncDocumentRecord>) -> Result<usize> {
    let conn = open_db(app)?;
    let mut applied = 0usize;

    for document in documents {
        let existing: Option<(String, Option<String>, i64, String)> = conn
            .query_row(
                "SELECT node_kind, parent_id, depth, updated_at FROM documents WHERE id = ?1",
                params![document.id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .optional()?;

        let structure_changed = existing
            .as_ref()
            .map(|(node_kind, parent_id, depth, _)| {
                node_kind != &document.node_kind
                    || parent_id.as_deref() != document.parent_id.as_deref()
                    || *depth != document.depth
            })
            .unwrap_or(false);

        let should_apply = match existing {
            Some((_, _, _, ref local_updated_at)) => structure_changed || document.updated_at > *local_updated_at,
            None => true,
        };

        if !should_apply {
            continue;
        }

        let remote_is_newer = existing
            .as_ref()
            .map(|(_, _, _, local_updated_at)| document.updated_at > *local_updated_at)
            .unwrap_or(true);

        if structure_changed && !remote_is_newer {
            conn.execute(
                "
                UPDATE documents
                SET node_kind = ?2, parent_id = ?3, depth = ?4
                WHERE id = ?1
                ",
                params![document.id, document.node_kind, document.parent_id, document.depth],
            )?;
            applied += 1;
            continue;
        }

        if document.node_kind == "document" {
            ensure_document_content_size(&document.content_json)?;
            let current_count = current_document_count(&conn)?;
            if existing.is_none() && current_count + 1 > MAX_DOCUMENT_COUNT {
                return Err(anyhow::anyhow!("已达到 Hosted 模式文档数量上限（{}）", MAX_DOCUMENT_COUNT));
            }

            let old_size = conn
                .query_row(
                    "SELECT title, content_json, plain_text FROM documents WHERE id = ?1",
                    params![document.id],
                    |row| {
                        Ok(estimate_document_storage_bytes(
                            &row.get::<_, String>(0)?,
                            &row.get::<_, String>(1)?,
                            &row.get::<_, String>(2)?,
                        ))
                    },
                )
                .optional()?
                .unwrap_or(0);
            let new_size =
                estimate_document_storage_bytes(&document.title, &document.content_json, &document.plain_text);
            ensure_total_storage_capacity(&conn, new_size as isize - old_size as isize)?;
        }

        conn.execute(
            "
            INSERT INTO documents (
                id, title, node_kind, parent_id, depth, content_json, plain_text, status, is_favorite, is_template, created_at, updated_at, archived_at, deleted_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                node_kind = excluded.node_kind,
                parent_id = excluded.parent_id,
                depth = excluded.depth,
                content_json = excluded.content_json,
                plain_text = excluded.plain_text,
                status = excluded.status,
                is_favorite = excluded.is_favorite,
                is_template = excluded.is_template,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at,
                archived_at = excluded.archived_at,
                deleted_at = excluded.deleted_at
            ",
            params![
                document.id,
                document.title,
                document.node_kind,
                document.parent_id,
                document.depth,
                document.content_json,
                document.plain_text,
                document.status,
                if document.is_favorite { 1 } else { 0 },
                if document.is_template { 1 } else { 0 },
                document.created_at,
                document.updated_at,
                document.archived_at,
                document.deleted_at,
            ],
        )?;
        replace_document_tags(&conn, &document.id, &document.tags)?;
        applied += 1;
    }

    Ok(applied)
}

pub fn finalize_sync_jobs(
    app: &AppHandle,
    processed_job_ids: &[i64],
    success: bool,
    error: Option<&str>,
    pulled_cursor: Option<&str>,
) -> Result<SyncSnapshot> {
    let conn = open_db(app)?;
    let now = now_iso();

    if success {
        for job_id in processed_job_ids {
            conn.execute(
                "UPDATE sync_queue SET processed_at = ?2, error_message = NULL WHERE id = ?1",
                params![job_id, now],
            )?;
        }
        set_config_value(&conn, "sync.last_synced_at", Some(&now))?;
        set_config_value(&conn, "sync.last_pulled_at", pulled_cursor.or(Some(&now)))?;
        set_config_value(&conn, "sync.last_error", None)?;
    } else {
        for job_id in processed_job_ids {
            conn.execute(
                "UPDATE sync_queue SET error_message = ?2 WHERE id = ?1",
                params![job_id, error.unwrap_or("同步失败")],
            )?;
        }
        set_config_value(&conn, "sync.last_error", error)?;
    }

    let pending_jobs: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sync_queue WHERE processed_at IS NULL",
        [],
        |row| row.get(0),
    )?;

    Ok(SyncSnapshot {
        mode: current_sync_mode(&conn)?,
        pending_jobs: pending_jobs as usize,
        last_synced_at: get_config_value(&conn, "sync.last_synced_at")?,
        last_pulled_at: get_config_value(&conn, "sync.last_pulled_at")?,
        auto_sync_enabled: get_auto_sync(&conn)?,
        last_error: get_config_value(&conn, "sync.last_error")?,
    })
}

fn append_history(conn: &Connection, document_id: &str, snapshot: &str) -> Result<()> {
    conn.execute(
        "
        INSERT INTO document_history (id, document_id, snapshot, created_at)
        VALUES (?1, ?2, ?3, ?4)
        ",
        params![Uuid::new_v4().to_string(), document_id, snapshot, now_iso()],
    )?;
    Ok(())
}

fn document_tags(conn: &Connection, document_id: &str) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "
        SELECT tags.name
        FROM tags
        INNER JOIN document_tags ON document_tags.tag_id = tags.id
        WHERE document_tags.document_id = ?1
        ORDER BY tags.name ASC
        ",
    )?;
    let tags = stmt
        .query_map(params![document_id], |row| row.get(0))?
        .collect::<std::result::Result<Vec<String>, _>>()?;
    Ok(tags)
}

fn replace_document_tags(conn: &Connection, document_id: &str, tags: &[String]) -> Result<()> {
    conn.execute(
        "DELETE FROM document_tags WHERE document_id = ?1",
        params![document_id],
    )?;

    for tag_name in tags.iter().map(|tag| tag.trim()).filter(|tag| !tag.is_empty()) {
        let tag_id = conn
            .query_row(
                "SELECT id FROM tags WHERE name = ?1",
                params![tag_name],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .unwrap_or_else(|| {
                let id = Uuid::new_v4().to_string();
                let _ = conn.execute(
                    "INSERT INTO tags (id, name) VALUES (?1, ?2)",
                    params![id, tag_name],
                );
                id
            });

        conn.execute(
            "
            INSERT OR IGNORE INTO document_tags (document_id, tag_id)
            VALUES (?1, ?2)
            ",
            params![document_id, tag_id],
        )?;
    }
    Ok(())
}

fn queue_job(conn: &Connection, entity_type: &str, entity_id: &str, action: &str, payload: &str) -> Result<()> {
    conn.execute(
        "
        INSERT INTO sync_queue (entity_type, entity_id, action, payload, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        ",
        params![entity_type, entity_id, action, payload, now_iso()],
    )?;
    Ok(())
}

fn estimate_document_storage_bytes(title: &str, content_json: &str, plain_text: &str) -> usize {
    title.as_bytes().len() + content_json.as_bytes().len() + plain_text.as_bytes().len()
}

fn current_document_count(conn: &Connection) -> Result<usize> {
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM documents WHERE node_kind = 'document'",
        [],
        |row| row.get::<_, i64>(0),
    )? as usize)
}

fn current_total_storage_bytes(conn: &Connection) -> Result<usize> {
    Ok(conn.query_row(
        "
        SELECT COALESCE(SUM(
            length(CAST(title AS BLOB)) +
            length(CAST(content_json AS BLOB)) +
            length(CAST(plain_text AS BLOB))
        ), 0)
        FROM documents
        WHERE node_kind = 'document'
        ",
        [],
        |row| row.get::<_, i64>(0),
    )? as usize)
}

fn current_write_ops_last_5_minutes(conn: &Connection) -> Result<usize> {
    let cutoff = (Utc::now() - chrono::Duration::minutes(5)).to_rfc3339();
    Ok(conn.query_row(
        "
        SELECT COUNT(*) FROM sync_queue
        WHERE created_at >= ?1 AND entity_type = 'document'
        ",
        params![cutoff],
        |row| row.get::<_, i64>(0),
    )? as usize)
}

fn current_usage_limits(conn: &Connection) -> Result<UsageLimits> {
    Ok(UsageLimits {
        max_document_content_bytes: MAX_DOCUMENT_CONTENT_BYTES,
        max_total_storage_bytes: MAX_TOTAL_STORAGE_BYTES,
        max_document_count: MAX_DOCUMENT_COUNT,
        max_write_ops_per_5_minutes: MAX_WRITE_OPS_PER_5_MINUTES,
        attachments_enabled: HOSTED_ATTACHMENTS_ENABLED,
        current_document_count: current_document_count(conn)?,
        current_total_storage_bytes: current_total_storage_bytes(conn)?,
        current_write_ops_last_5_minutes: current_write_ops_last_5_minutes(conn)?,
    })
}

fn ensure_document_content_size(content_json: &str) -> Result<()> {
    let bytes = content_json.as_bytes().len();
    if bytes > MAX_DOCUMENT_CONTENT_BYTES {
        return Err(anyhow::anyhow!(
            "单篇文档内容超过 Hosted 模式上限（{} KB）",
            MAX_DOCUMENT_CONTENT_BYTES / 1024
        ));
    }
    Ok(())
}

fn ensure_document_count_capacity(conn: &Connection, additional_documents: usize) -> Result<()> {
    let current = current_document_count(conn)?;
    if current + additional_documents > MAX_DOCUMENT_COUNT {
        return Err(anyhow::anyhow!(
            "已达到 Hosted 模式文档数量上限（{}）",
            MAX_DOCUMENT_COUNT
        ));
    }
    Ok(())
}

fn ensure_total_storage_capacity(conn: &Connection, delta_bytes: isize) -> Result<()> {
    let current = current_total_storage_bytes(conn)? as isize;
    let projected = (current + delta_bytes).max(0) as usize;
    if projected > MAX_TOTAL_STORAGE_BYTES {
        return Err(anyhow::anyhow!(
            "已达到 Hosted 模式总存储上限（{} MB）",
            MAX_TOTAL_STORAGE_BYTES / 1024 / 1024
        ));
    }
    Ok(())
}

fn ensure_write_budget(conn: &Connection) -> Result<()> {
    let current = current_write_ops_last_5_minutes(conn)?;
    if current >= MAX_WRITE_OPS_PER_5_MINUTES {
        return Err(anyhow::anyhow!(
            "最近 5 分钟写入次数已达到上限（{}）",
            MAX_WRITE_OPS_PER_5_MINUTES
        ));
    }
    Ok(())
}

fn has_supabase_override(conn: &Connection) -> Result<bool> {
    Ok(
        get_config_value(conn, "supabase.url")?.is_some()
            || get_config_value(conn, "supabase.anon_key")?.is_some(),
    )
}

fn current_service_profile(conn: &Connection) -> Result<String> {
    if has_supabase_override(conn)? {
        Ok("self-hosted".to_string())
    } else if DEFAULT_SUPABASE_URL.is_some() && DEFAULT_SUPABASE_ANON_KEY.is_some() {
        Ok("hosted".to_string())
    } else {
        Ok("unconfigured".to_string())
    }
}

fn current_sync_mode(conn: &Connection) -> Result<String> {
    match current_service_profile(conn)?.as_str() {
        "hosted" => Ok("hosted".to_string()),
        "self-hosted" => Ok("self-hosted".to_string()),
        _ => Ok("local-only".to_string()),
    }
}

fn is_onboarding_completed(conn: &Connection, has_session: bool) -> Result<bool> {
    if has_session {
        return Ok(true);
    }
    Ok(get_config_value(conn, "onboarding.completed")?
        .map(|value| value == "1")
        .unwrap_or(false))
}

fn resolve_parent_depth(
    conn: &Connection,
    parent_id: Option<&str>,
    moving_id: Option<&str>,
) -> Result<i64> {
    let Some(parent_id) = parent_id else {
        return Ok(0);
    };

    let parent: Option<(String, i64, Option<String>)> = conn
        .query_row(
            "SELECT node_kind, depth, parent_id FROM documents WHERE id = ?1",
            params![parent_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;

    let Some((parent_kind, parent_depth, mut current_parent)) = parent else {
        return Err(anyhow::anyhow!("目标父节点不存在"));
    };

    if parent_kind != "folder" {
        return Err(anyhow::anyhow!("只有文件夹节点可以包含子节点"));
    }

    if let Some(moving_id) = moving_id {
        if moving_id == parent_id {
            return Err(anyhow::anyhow!("节点不能包含自身"));
        }

        while let Some(ancestor_id) = current_parent {
            if ancestor_id == moving_id {
                return Err(anyhow::anyhow!("检测到循环包含，移动已拒绝"));
            }
            current_parent = conn
                .query_row(
                    "SELECT parent_id FROM documents WHERE id = ?1",
                    params![ancestor_id],
                    |row| row.get::<_, Option<String>>(0),
                )
                .optional()?
                .flatten();
        }
    }

    let depth = parent_depth + 1;
    if depth > 7 {
        return Err(anyhow::anyhow!("节点最大深度为 7"));
    }

    Ok(depth)
}

fn cascade_child_depths(conn: &Connection, parent_id: &str, parent_depth: i64) -> Result<()> {
    let mut stmt = conn.prepare("SELECT id FROM documents WHERE parent_id = ?1")?;
    let child_ids = stmt
        .query_map(params![parent_id], |row| row.get::<_, String>(0))?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    for child_id in child_ids {
        let child_depth = parent_depth + 1;
        if child_depth > 7 {
            return Err(anyhow::anyhow!("节点最大深度为 7"));
        }
        conn.execute(
            "UPDATE documents SET depth = ?2 WHERE id = ?1",
            params![child_id, child_depth],
        )?;
        cascade_child_depths(conn, &child_id, child_depth)?;
    }

    Ok(())
}

fn apply_status_to_subtree(conn: &Connection, id: &str, status: &str, now: &str) -> Result<()> {
    let (archived_at, deleted_at) = match status {
        "archived" => (Some(now.to_string()), None),
        "trashed" => (None, Some(now.to_string())),
        _ => (None, None),
    };

    conn.execute(
        "
        UPDATE documents
        SET status = ?2, archived_at = ?3, deleted_at = ?4, updated_at = ?5
        WHERE id = ?1
        ",
        params![id, status, archived_at, deleted_at, now],
    )?;

    let mut stmt = conn.prepare("SELECT id FROM documents WHERE parent_id = ?1")?;
    let child_ids = stmt
        .query_map(params![id], |row| row.get::<_, String>(0))?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    for child_id in child_ids {
        apply_status_to_subtree(conn, &child_id, status, now)?;
    }

    Ok(())
}

fn ensure_column(conn: &Connection, table: &str, column: &str, definition: &str) -> Result<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let exists = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<std::result::Result<Vec<_>, _>>()?
        .into_iter()
        .any(|existing| existing == column);

    if !exists {
        conn.execute(
            &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
            [],
        )?;
    }

    Ok(())
}

fn get_auto_sync(conn: &Connection) -> Result<bool> {
    Ok(get_config_value(conn, "sync.auto_sync_enabled")?
        .map(|value| value == "1")
        .unwrap_or(true))
}

fn get_config_value(conn: &Connection, key: &str) -> Result<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT value FROM app_config WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()?)
}

fn set_config_value(conn: &Connection, key: &str, value: Option<&str>) -> Result<()> {
    if let Some(value) = value {
        conn.execute(
            "
            INSERT INTO app_config (key, value)
            VALUES (?1, ?2)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            ",
            params![key, value],
        )?;
    } else {
        conn.execute("DELETE FROM app_config WHERE key = ?1", params![key])?;
    }
    Ok(())
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}
