use super::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentHistoryEntry {
    pub id: String,
    pub created_at: String,
    pub content_json: String,
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
