use super::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentHistoryEntry {
    pub id: String,
    pub created_at: String,
    pub content_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreDocumentHistoryInput {
    pub account_scope: String,
    pub document_id: String,
    pub history_id: String,
    pub content_generation: i64,
    pub expected_content_json: String,
}

/// Restore only the body. Both local edits (body) and remote applications (generation)
/// participate in the compare-and-swap, inside the same transaction as history/outbox.
pub fn restore_document_history(
    app: &AppHandle,
    input: RestoreDocumentHistoryInput,
) -> Result<DocumentRecord> {
    let connection = open_scoped_db(app, &input.account_scope)?;
    let conn = rusqlite::Transaction::new_unchecked(
        &connection,
        rusqlite::TransactionBehavior::Immediate,
    )?;
    let existing =
        get_document_from_conn(&conn, &input.document_id)?.context("文档不存在或已永久删除")?;
    anyhow::ensure!(existing.node_kind == "document", "分组不能恢复正文");
    anyhow::ensure!(existing.status == "active", "请先将文档移出归档或回收站");
    validate_content(&input.expected_content_json)?;
    anyhow::ensure!(
        existing.content_generation == input.content_generation
            && serde_json::from_str::<serde_json::Value>(&existing.content_json)?
                == serde_json::from_str::<serde_json::Value>(&input.expected_content_json)?,
        "正文在预览后发生变化，请重新打开修改记录后恢复"
    );
    prune_history(&conn)?;
    let snapshot: String = conn
        .query_row(
            "SELECT snapshot FROM document_history WHERE id=?1 AND document_id=?2",
            params![input.history_id, input.document_id],
            |row| row.get(0),
        )
        .optional()?
        .context("此版本已过期或被清理，请重新打开修改记录")?;
    validate_content(&snapshot)?;
    ensure_document_content_size(&snapshot)?;
    if serde_json::from_str::<serde_json::Value>(&snapshot)?
        == serde_json::from_str::<serde_json::Value>(&existing.content_json)?
    {
        conn.commit()?;
        return Ok(existing);
    }
    ensure_write_budget(&conn)?;
    let plain_text = history_plain_text(&serde_json::from_str(&snapshot)?);
    // Capture the current version before changing anything; read snapshot first because
    // appending it can evict the selected oldest record under the retention limit.
    append_history(&conn, &existing.id, &existing.content_json)?;
    conn.execute(
        "UPDATE documents SET content_json=?2,plain_text=?3,updated_at=?4,
         content_generation=content_generation+1 WHERE id=?1",
        params![existing.id, snapshot, plain_text, now_iso()],
    )?;
    append_history(&conn, &existing.id, &snapshot)?;
    queue_job(&conn, "document", &existing.id, "restore-history", "")?;
    ensure_total_storage_capacity(&conn, 0)?;
    let record = get_document_from_conn(&conn, &existing.id)?.context("恢复后读取失败")?;
    conn.commit()?;
    Ok(record)
}

/// Mirrors Tiptap getText's block separation; derive the index from the trusted
/// stored snapshot rather than accepting a second, potentially inconsistent body.
pub(super) fn history_plain_text(node: &serde_json::Value) -> String {
    if node["type"] == "text" {
        return node["text"].as_str().unwrap_or("").to_owned();
    }
    if node["type"] == "hardBreak" {
        return "\n".to_owned();
    }
    let Some(children) = node["content"].as_array() else {
        return String::new();
    };
    let mut text = String::new();
    for (index, child) in children.iter().enumerate() {
        if index > 0
            && matches!(
                child["type"].as_str(),
                Some(
                    "paragraph"
                        | "heading"
                        | "codeBlock"
                        | "blockquote"
                        | "bulletList"
                        | "orderedList"
                        | "listItem"
                        | "horizontalRule"
                )
            )
        {
            text.push_str("\n\n");
        }
        text.push_str(&history_plain_text(child));
    }
    text
}

/// Local observations of content versions, scoped to the active account. Not an audit log.
pub fn list_document_history(
    app: &AppHandle,
    expected_scope: &str,
    document_id: &str,
) -> Result<Vec<DocumentHistoryEntry>> {
    let conn = open_scoped_db(app, expected_scope)?;
    let document = get_document_from_conn(&conn, document_id)?.context("文档不存在")?;
    anyhow::ensure!(document.node_kind == "document", "分组没有正文修改记录");
    let mut stmt = conn.prepare(
        "SELECT id,created_at,snapshot FROM document_history WHERE document_id=?1
         ORDER BY created_at DESC,rowid DESC LIMIT 20",
    )?;
    let entries = stmt
        .query_map(params![document_id], |row| {
            Ok(DocumentHistoryEntry {
                id: row.get(0)?,
                created_at: row.get(1)?,
                content_json: row.get(2)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(entries)
}
