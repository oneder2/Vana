use super::*;

pub fn export_sync_documents(app: &AppHandle, expected_scope: &str) -> Result<SyncExport> {
    let connection = open_scoped_db(app, expected_scope)?;
    let conn = connection.unchecked_transaction()?;
    let mut stmt =
        conn.prepare("SELECT id FROM sync_queue WHERE processed_at IS NULL ORDER BY id ASC")?;
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
        if let Some(detail) = get_document_from_conn(&conn, &document_id)? {
            documents.push(SyncDocumentRecord {
                mutation_id: conn.query_row("SELECT payload FROM sync_queue WHERE entity_id=?1 AND processed_at IS NULL ORDER BY id DESC LIMIT 1", params![detail.id], |r| r.get(0))?,
                revision: conn.query_row("SELECT revision FROM documents WHERE id = ?1", params![detail.id], |r| r.get(0))?,
                is_purged: false,
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

    let mut stmt = conn.prepare(
        "SELECT id,revision FROM documents WHERE is_purged=1 AND id IN
        (SELECT entity_id FROM sync_queue WHERE processed_at IS NULL)",
    )?;
    for row in stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))? {
        let (id, revision) = row?;
        documents.push(SyncDocumentRecord {
            mutation_id: conn.query_row(
                "SELECT payload FROM sync_queue WHERE entity_id=?1 ORDER BY id DESC LIMIT 1",
                params![id],
                |r| r.get(0),
            )?,
            revision,
            is_purged: true,
            id,
            title: String::new(),
            node_kind: "document".into(),
            parent_id: None,
            depth: 0,
            content_json: r#"{"type":"doc","content":[]}"#.into(),
            plain_text: String::new(),
            status: "trashed".into(),
            is_favorite: false,
            is_template: false,
            created_at: now_iso(),
            updated_at: now_iso(),
            archived_at: None,
            deleted_at: Some(now_iso()),
            tags: vec![],
        });
    }
    Ok(SyncExport {
        account_scope: get_config_value(&conn, "space.id")?.unwrap_or_default(),
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

#[derive(Debug, Serialize, Deserialize)]
pub struct ApplyRemoteResult {
    pub applied: usize,
    pub conflict_copies: usize,
}

pub(super) fn sync_record(conn: &Connection, id: &str) -> Result<SyncDocumentRecord> {
    let d = get_document_from_conn(conn, id)?.context("文档不存在")?;
    Ok(SyncDocumentRecord {
        revision: conn.query_row(
            "SELECT revision FROM documents WHERE id=?1",
            params![id],
            |r| r.get(0),
        )?,
        mutation_id: String::new(),
        is_purged: false,
        id: d.id,
        title: d.title,
        node_kind: d.node_kind,
        parent_id: d.parent_id,
        depth: d.depth,
        content_json: d.content_json,
        plain_text: d.plain_text,
        status: d.status,
        is_favorite: d.is_favorite,
        is_template: d.is_template,
        created_at: d.created_at,
        updated_at: d.updated_at,
        archived_at: d.archived_at,
        deleted_at: d.deleted_at,
        tags: d.tags,
    })
}

pub(super) fn write_remote(conn: &Connection, d: &SyncDocumentRecord) -> Result<()> {
    Uuid::parse_str(&d.id)?;
    anyhow::ensure!(
        matches!(d.node_kind.as_str(), "document" | "folder")
            && matches!(d.status.as_str(), "active" | "archived" | "trashed")
            && (0..=7).contains(&d.depth)
            && d.revision >= 0,
        "远端文档字段无效"
    );
    validate_content(&d.content_json)?;
    ensure_document_content_size(&d.content_json)?;
    if !d.is_purged && d.node_kind == "document" {
        let previous: Option<String> = conn
            .query_row(
                "SELECT content_json FROM documents WHERE id=?1 AND is_purged=0",
                params![d.id],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(previous) = previous.as_deref() {
            if previous != d.content_json {
                append_history(conn, &d.id, previous)?;
            }
        }
    }
    conn.execute("INSERT INTO documents(id,title,node_kind,parent_id,depth,content_json,plain_text,status,
        is_favorite,is_template,created_at,updated_at,archived_at,deleted_at,revision,is_purged)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title,node_kind=excluded.node_kind,parent_id=excluded.parent_id,
        depth=excluded.depth,content_json=excluded.content_json,plain_text=excluded.plain_text,status=excluded.status,
        is_favorite=excluded.is_favorite,is_template=excluded.is_template,updated_at=excluded.updated_at,
        archived_at=excluded.archived_at,deleted_at=excluded.deleted_at,revision=excluded.revision,is_purged=excluded.is_purged,content_generation=documents.content_generation+1",
        params![d.id,d.title,d.node_kind,d.parent_id,d.depth,d.content_json,d.plain_text,d.status,
            d.is_favorite,d.is_template,d.created_at,d.updated_at,d.archived_at,d.deleted_at,d.revision,d.is_purged])?;
    replace_document_tags(conn, &d.id, &d.tags)?;
    if !d.is_purged && d.node_kind == "document" {
        append_history(conn, &d.id, &d.content_json)?;
    }
    if d.is_purged {
        conn.execute(
            "DELETE FROM document_history WHERE document_id=?1",
            params![d.id],
        )?;
        conn.execute(
            "DELETE FROM document_tags WHERE document_id=?1",
            params![d.id],
        )?;
    }
    Ok(())
}

pub(super) fn validate_tree(conn: &Connection) -> Result<()> {
    let invalid: i64 = conn.query_row("SELECT COUNT(*) FROM documents d LEFT JOIN documents p ON p.id=d.parent_id
        WHERE d.is_purged=0 AND ((d.parent_id IS NULL AND d.depth<>0) OR (d.parent_id IS NOT NULL AND
          (p.id IS NULL OR p.is_purged=1 OR p.node_kind<>'folder' OR d.depth<>p.depth+1 OR d.status<>p.status)))", [], |r| r.get(0))?;
    anyhow::ensure!(
        invalid == 0,
        "目录树包含孤儿、循环、深度或状态不一致；同步已回滚"
    );
    Ok(())
}

pub fn apply_remote_documents(
    app: &AppHandle,
    expected_scope: &str,
    documents: Vec<SyncDocumentRecord>,
) -> Result<ApplyRemoteResult> {
    let connection = open_scoped_db(app, expected_scope)?;
    let conn = rusqlite::Transaction::new_unchecked(
        &connection,
        rusqlite::TransactionBehavior::Immediate,
    )?;
    let remote: std::collections::HashMap<_, _> =
        documents.iter().map(|d| (d.id.clone(), d)).collect();
    anyhow::ensure!(remote.len() == documents.len(), "远端包含重复 ID");
    let mut stmt = conn.prepare("SELECT id,parent_id,revision,is_purged FROM documents")?;
    let mut local = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, bool>(3)?,
            ))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    drop(stmt);
    // A response can be lost after a successful push. Match the persisted mutation UUID before making conflict copies.
    for d in &documents {
        if !d.mutation_id.is_empty() {
            let matching:bool=conn.query_row("SELECT EXISTS(SELECT 1 FROM sync_queue WHERE entity_type='document' AND entity_id=?1 AND payload=?2)",params![d.id,d.mutation_id],|r|r.get(0))?;
            if matching {
                conn.execute(
                    "UPDATE documents SET revision=MAX(revision,?2) WHERE id=?1",
                    params![d.id, d.revision],
                )?;
                conn.execute("DELETE FROM sync_queue WHERE entity_type='document' AND entity_id=?1 AND payload=?2",params![d.id,d.mutation_id])?;
                if let Some((_, _, revision, _)) =
                    local.iter_mut().find(|(id, _, _, _)| id == &d.id)
                {
                    *revision = (*revision).max(d.revision);
                }
            }
        }
    }
    let parents: std::collections::HashMap<_, _> = local
        .iter()
        .map(|(id, p, _, _)| (id.clone(), p.clone()))
        .collect();
    let root_of = |id: &str| -> Result<String> {
        let mut root = id.to_string();
        let mut seen = std::collections::HashSet::new();
        while let Some(Some(parent)) = parents.get(&root) {
            anyhow::ensure!(seen.insert(root.clone()), "本地目录循环");
            root = parent.clone();
        }
        Ok(root)
    };
    let mut stmt = conn.prepare(
        "SELECT entity_id FROM sync_queue WHERE entity_type='document' AND processed_at IS NULL",
    )?;
    let pending = stmt
        .query_map([], |r| r.get::<_, String>(0))?
        .collect::<std::result::Result<std::collections::HashSet<_>, _>>()?;
    drop(stmt);
    let dirty_roots = pending
        .iter()
        .map(|id| root_of(id))
        .collect::<Result<std::collections::HashSet<_>>>()?;
    let mut conflicted_roots = std::collections::HashSet::new();
    for (id, _, revision, purged) in &local {
        let root = root_of(id)?;
        if !*purged
            && dirty_roots.contains(&root)
            && remote
                .get(id)
                .map(|d| d.revision > *revision)
                .unwrap_or(false)
        {
            conflicted_roots.insert(root);
        }
    }
    let mut purge_conflicts = 0;
    for (id, _, revision, purged) in &local {
        if *purged && pending.contains(id) {
            if let Some(remote_doc) = remote.get(id) {
                if remote_doc.revision > *revision {
                    if remote_doc.is_purged {
                        // Another device already completed the same permanent deletion.
                        conn.execute(
                            "DELETE FROM sync_queue WHERE entity_type='document' AND entity_id=?1",
                            params![id],
                        )?;
                    }
                    if !remote_doc.is_purged {
                        let mut copy = (*remote_doc).clone();
                        copy.id = Uuid::new_v4().to_string();
                        copy.revision = 0;
                        copy.parent_id = None;
                        copy.depth = 0;
                        copy.title.push_str("（删除期间的云端修改副本）");
                        purge_conflicts += 1;
                        copy.node_kind = "document".into();
                        copy.status = "active".into();
                        copy.archived_at = None;
                        copy.deleted_at = None;
                        write_remote(&conn, &copy)?;
                        queue_job(&conn, "document", &copy.id, "conflict-copy", "")?;
                        record_conflict(&conn, &copy.id, id, "cloud-edit-during-delete")?;
                    }
                    conn.execute(
                        "UPDATE documents SET revision=?2 WHERE id=?1",
                        params![id, remote_doc.revision],
                    )?;
                }
            }
        }
    }
    // Copy the complete affected trees so content AND unsynced structural intent survive conflicts.
    let copy_ids = local
        .iter()
        .filter_map(|(id, _, _, purged)| match root_of(id) {
            Ok(root) if !*purged && conflicted_roots.contains(&root) => Some(id.clone()),
            _ => None,
        })
        .collect::<Vec<_>>();
    let remap: std::collections::HashMap<_, _> = copy_ids
        .iter()
        .map(|id| (id.clone(), Uuid::new_v4().to_string()))
        .collect();
    for id in &copy_ids {
        let mut copy = sync_record(&conn, id)?;
        copy.id = remap[id].clone();
        copy.revision = 0;
        copy.created_at = now_iso();
        copy.updated_at = now_iso();
        if copy.parent_id.is_none() {
            copy.title.push_str("（同步冲突副本）");
        }
        copy.parent_id = copy.parent_id.and_then(|p| remap.get(&p).cloned());
        write_remote(&conn, &copy)?;
        queue_job(&conn, "document", &copy.id, "conflict-copy", "")?;
        record_conflict(&conn, &copy.id, id, "concurrent-tree-change")?;
        conn.execute("DELETE FROM sync_queue WHERE entity_id=?1", params![id])?;
        if !remote.contains_key(id) {
            conn.execute("DELETE FROM documents WHERE id=?1", params![id])?;
        }
    }
    let mut applied = 0;
    for d in &documents {
        let is_pending = pending.contains(&d.id) && !remap.contains_key(&d.id);
        if is_pending {
            continue;
        }
        let revision: Option<i64> = conn
            .query_row(
                "SELECT revision FROM documents WHERE id=?1",
                params![d.id],
                |r| r.get(0),
            )
            .optional()?;
        if remap.contains_key(&d.id) || revision.map(|v| d.revision > v).unwrap_or(true) {
            write_remote(&conn, d)?;
            applied += 1;
        }
    }
    validate_tree(&conn)?;
    conn.commit()?;
    Ok(ApplyRemoteResult {
        applied,
        conflict_copies: conflicted_roots.len() + purge_conflicts,
    })
}

pub fn finalize_sync_jobs(
    app: &AppHandle,
    expected_scope: &str,
    processed_job_ids: &[i64],
    acknowledgements: &[SyncDocumentRecord],
    success: bool,
    error: Option<&str>,
    pulled_cursor: Option<&str>,
) -> Result<SyncSnapshot> {
    let connection = open_scoped_db(app, expected_scope)?;
    let conn = rusqlite::Transaction::new_unchecked(
        &connection,
        rusqlite::TransactionBehavior::Immediate,
    )?;
    let now = now_iso();

    if success {
        for d in acknowledgements {
            conn.execute(
                "UPDATE documents SET revision=MAX(revision,?2) WHERE id=?1",
                params![d.id, d.revision],
            )?;
        }
        for job_id in processed_job_ids {
            conn.execute("DELETE FROM sync_queue WHERE id = ?1", params![job_id])?;
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

    let snapshot = SyncSnapshot {
        conflict_copies: 0,
        mode: current_sync_mode(&conn)?,
        pending_jobs: pending_jobs as usize,
        last_synced_at: get_config_value(&conn, "sync.last_synced_at")?,
        last_pulled_at: get_config_value(&conn, "sync.last_pulled_at")?,
        auto_sync_enabled: get_auto_sync(&conn)?,
        last_error: get_config_value(&conn, "sync.last_error")?,
    };
    conn.commit()?;
    Ok(snapshot)
}
