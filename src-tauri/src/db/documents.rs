use super::*;

pub fn create_document(
    app: &AppHandle,
    expected_scope: &str,
    title: Option<String>,
    is_template: bool,
    node_kind: Option<String>,
    parent_id: Option<String>,
) -> Result<DocumentRecord> {
    let connection = open_scoped_db(app, expected_scope)?;
    let conn = rusqlite::Transaction::new_unchecked(
        &connection,
        rusqlite::TransactionBehavior::Immediate,
    )?;
    let now = now_iso();
    let id = Uuid::new_v4().to_string();
    let resolved_title = title.unwrap_or_else(|| "Untitled".to_string());
    let resolved_kind = node_kind.unwrap_or_else(|| "document".to_string());
    anyhow::ensure!(
        matches!(resolved_kind.as_str(), "document" | "folder"),
        "节点类型无效"
    );
    let content = if resolved_kind == "folder" {
        r#"{"type":"doc","content":[]}"#
    } else {
        DEFAULT_DOCUMENT_CONTENT.trim()
    };
    ensure_write_budget(&conn)?;
    if resolved_kind == "document" {
        ensure_document_count_capacity(&conn, 1)?;
        ensure_document_content_size(content)?;
        ensure_total_storage_capacity(
            &conn,
            estimate_document_storage_bytes(&resolved_title, content, "") as isize,
        )?;
    }
    let depth = resolve_parent_depth(&conn, parent_id.as_deref(), None)?;
    if let Some(parent) = parent_id.as_deref() {
        anyhow::ensure!(
            get_document_from_conn(&conn, parent)?
                .context("父节点不存在")?
                .status
                == "active",
            "只能在有效文件夹内新建"
        );
    }

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

    ensure_total_storage_capacity(&conn, 0)?;
    let record =
        get_document_from_conn(&conn, &id)?.ok_or_else(|| anyhow::anyhow!("文档创建后读取失败"))?;
    conn.commit()?;
    Ok(record)
}

pub fn save_document(app: &AppHandle, input: SaveDocumentInput) -> Result<DocumentRecord> {
    let connection = open_scoped_db(app, &input.account_scope)?;
    let conn = rusqlite::Transaction::new_unchecked(
        &connection,
        rusqlite::TransactionBehavior::Immediate,
    )?;
    let generation: i64 = conn
        .query_row(
            "SELECT content_generation FROM documents WHERE id=?1 AND is_purged=0",
            params![input.id],
            |r| r.get(0),
        )
        .context("文档不存在")?;
    if generation != input.content_generation {
        // A queued in-memory edit predating a pull cannot overwrite the newly applied remote version.
        validate_content(&input.content_json)?;
        ensure_document_content_size(&input.content_json)?;
        ensure_document_count_capacity(&conn, 1)?;
        let id = Uuid::new_v4().to_string();
        let now = now_iso();
        let title = format!("{}（编辑期间的同步冲突副本）", input.title);
        conn.execute("INSERT INTO documents(id,title,node_kind,depth,content_json,plain_text,status,created_at,updated_at)
            VALUES (?1,?2,'document',0,?3,?4,'active',?5,?5)",params![id,title,input.content_json,input.plain_text,now])?;
        replace_document_tags(&conn, &id, &input.tags)?;
        append_history(&conn, &id, &input.content_json)?;
        queue_job(&conn, "document", &id, "draft-conflict", "")?;
        ensure_total_storage_capacity(&conn, 0)?;
        let record = get_document_from_conn(&conn, &id)?.context("副本读取失败")?;
        conn.commit()?;
        return Ok(record);
    }
    let now = now_iso();
    ensure_write_budget(&conn)?;

    let existing_document: Option<(String, String, String, String)> = conn
        .query_row(
            "SELECT node_kind, title, content_json, plain_text FROM documents WHERE id = ?1",
            params![input.id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()?;

    anyhow::ensure!(existing_document.is_some(), "文档不存在");
    validate_content(&input.content_json)?;
    let is_document = existing_document
        .as_ref()
        .map(|(node_kind, _, _, _)| node_kind == "document")
        .unwrap_or(true);
    if is_document {
        ensure_document_content_size(&input.content_json)?;
        let old_size = existing_document
            .as_ref()
            .map(|(_, title, content, plain)| {
                estimate_document_storage_bytes(title, content, plain)
            })
            .unwrap_or(0);
        let new_size =
            estimate_document_storage_bytes(&input.title, &input.content_json, &input.plain_text);
        ensure_total_storage_capacity(&conn, new_size as isize - old_size as isize)?;
    }

    conn.execute(
        "
        UPDATE documents
        SET title = ?2, content_json = ?3, plain_text = ?4, updated_at = ?5
        WHERE id = ?1
        ",
        params![
            input.id,
            input.title,
            input.content_json,
            input.plain_text,
            now
        ],
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

    ensure_total_storage_capacity(&conn, 0)?;
    let record = get_document_from_conn(&conn, &input.id)?
        .ok_or_else(|| anyhow::anyhow!("文档保存后读取失败"))?;
    conn.commit()?;
    Ok(record)
}

pub fn move_document(
    app: &AppHandle,
    expected_scope: &str,
    id: &str,
    parent_id: Option<&str>,
) -> Result<DocumentRecord> {
    let connection = open_scoped_db(app, expected_scope)?;
    let conn = rusqlite::Transaction::new_unchecked(
        &connection,
        rusqlite::TransactionBehavior::Immediate,
    )?;
    let now = now_iso();
    ensure_write_budget(&conn)?;
    let depth = resolve_parent_depth(&conn, parent_id, Some(id))?;
    let moving = get_document_from_conn(&conn, id)?.context("节点不存在")?;
    if let Some(parent) = parent_id {
        anyhow::ensure!(
            get_document_from_conn(&conn, parent)?
                .context("父节点不存在")?
                .status
                == moving.status,
            "目标文件夹状态与移动节点不一致"
        );
    }

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
    let record =
        get_document_from_conn(&conn, id)?.ok_or_else(|| anyhow::anyhow!("移动节点后读取失败"))?;
    conn.commit()?;
    Ok(record)
}

pub fn set_document_status(
    app: &AppHandle,
    expected_scope: &str,
    id: &str,
    status: &str,
) -> Result<DocumentRecord> {
    let connection = open_scoped_db(app, expected_scope)?;
    let conn = rusqlite::Transaction::new_unchecked(
        &connection,
        rusqlite::TransactionBehavior::Immediate,
    )?;
    let now = now_iso();
    ensure_write_budget(&conn)?;
    anyhow::ensure!(
        matches!(status, "active" | "archived" | "trashed"),
        "状态无效"
    );
    let node = get_document_from_conn(&conn, id)?.context("节点不存在")?;
    if let Some(parent) = node.parent_id.as_deref() {
        let parent = get_document_from_conn(&conn, parent)?.context("父节点不存在")?;
        if parent.status != status {
            conn.execute(
                "UPDATE documents SET parent_id=NULL,depth=0 WHERE id=?1",
                params![id],
            )?;
            cascade_child_depths(&conn, id, 0)?;
        }
    }
    apply_status_to_subtree(&conn, id, status, &now)?;
    let record =
        get_document_from_conn(&conn, id)?.ok_or_else(|| anyhow::anyhow!("更新文档状态失败"))?;
    conn.commit()?;
    Ok(record)
}

pub fn toggle_favorite(
    app: &AppHandle,
    expected_scope: &str,
    id: &str,
    favorite: bool,
) -> Result<DocumentRecord> {
    let connection = open_scoped_db(app, expected_scope)?;
    let conn = rusqlite::Transaction::new_unchecked(
        &connection,
        rusqlite::TransactionBehavior::Immediate,
    )?;
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
    let record =
        get_document_from_conn(&conn, id)?.ok_or_else(|| anyhow::anyhow!("更新收藏状态失败"))?;
    conn.commit()?;
    Ok(record)
}

pub fn permanently_delete_document(app: &AppHandle, expected_scope: &str, id: &str) -> Result<()> {
    let connection = open_scoped_db(app, expected_scope)?;
    let conn = rusqlite::Transaction::new_unchecked(
        &connection,
        rusqlite::TransactionBehavior::Immediate,
    )?;
    let d = get_document_from_conn(&conn, id)?.context("文档不存在")?;
    anyhow::ensure!(d.status == "trashed", "只有回收站中的节点可永久删除");
    let mut stmt=conn.prepare("WITH RECURSIVE subtree(id) AS (SELECT ?1 UNION SELECT d.id FROM documents d JOIN subtree s ON d.parent_id=s.id) SELECT id FROM subtree")?;
    let ids = stmt
        .query_map(params![id], |r| r.get::<_, String>(0))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    drop(stmt);
    for id in ids {
        conn.execute(
            "DELETE FROM document_history WHERE document_id=?1",
            params![id],
        )?;
        conn.execute(
            "DELETE FROM document_tags WHERE document_id=?1",
            params![id],
        )?;
        conn.execute("DELETE FROM attachments WHERE document_id=?1", params![id])?;
        conn.execute("UPDATE documents SET title='',content_json='{\"type\":\"doc\",\"content\":[]}',plain_text='',parent_id=NULL,depth=0,is_purged=1,updated_at=?2 WHERE id=?1",params![id,now_iso()])?;
        queue_job(&conn, "document", &id, "purge", "")?;
    }
    conn.execute(
        "DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM document_tags)",
        [],
    )?;
    conn.commit()?;
    Ok(())
}
