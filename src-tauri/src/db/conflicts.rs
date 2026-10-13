use super::*;

#[derive(Debug, Clone, Serialize)]
pub struct DocumentConflict {
    pub copy: DocumentRecord,
    pub original: Option<DocumentRecord>,
    pub reason: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DocumentConflictSummary {
    pub copy_id: String,
    pub title: String,
    pub reason: String,
    pub created_at: String,
}

pub(super) fn record_conflict(
    conn: &Connection,
    copy_id: &str,
    original_id: &str,
    reason: &str,
) -> Result<()> {
    conn.execute("INSERT INTO document_conflicts(copy_id,original_id,reason,created_at) VALUES (?1,?2,?3,?4)", params![copy_id, original_id, reason, now_iso()])?;
    Ok(())
}

pub fn list_document_conflicts(
    app: &AppHandle,
    expected_scope: &str,
) -> Result<Vec<DocumentConflictSummary>> {
    let connection = open_scoped_db(app, expected_scope)?;
    let conn = connection.unchecked_transaction()?;
    // Include older/synced copies whose relationship wasn't recorded locally. A
    // title marker is only a discovery hint, never proof of an original document.
    let mut stmt = conn.prepare("SELECT d.id,d.title,COALESCE(c.reason,'name-marker'),COALESCE(c.created_at,d.created_at)
        FROM documents d LEFT JOIN document_conflicts c ON c.copy_id=d.id
        WHERE d.is_purged=0 AND (c.copy_id IS NOT NULL AND c.resolved_at IS NULL OR c.copy_id IS NULL AND
          (d.title LIKE '%（同步冲突副本）' OR d.title LIKE '%（编辑期间的同步冲突副本）' OR d.title LIKE '%（删除期间的云端修改副本）'))
        ORDER BY COALESCE(c.created_at,d.created_at) DESC,d.id LIMIT 500")?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(stmt);
    let mut conflicts = Vec::new();
    for (copy_id, title, reason, created_at) in rows {
        conflicts.push(DocumentConflictSummary {
            copy_id,
            title,
            reason,
            created_at,
        });
    }
    Ok(conflicts)
}

pub fn get_document_conflict(
    app: &AppHandle,
    expected_scope: &str,
    copy_id: &str,
) -> Result<DocumentConflict> {
    let connection = open_scoped_db(app, expected_scope)?;
    let conn = connection.unchecked_transaction()?;
    let copy = get_document_from_conn(&conn, copy_id)?.context("副本不存在或已删除")?;
    let record: Option<(Option<String>, String, String)> = conn.query_row(
        "SELECT original_id,reason,created_at FROM document_conflicts WHERE copy_id=?1 AND resolved_at IS NULL",
        params![copy_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    ).optional()?;
    let (original_id, reason, created_at) = match record {
        Some(record) => record,
        None => {
            anyhow::ensure!(
                [
                    "（同步冲突副本）",
                    "（编辑期间的同步冲突副本）",
                    "（删除期间的云端修改副本）"
                ]
                .iter()
                .any(|marker| copy.title.ends_with(marker)),
                "此文档没有冲突记录"
            );
            (None, "name-marker".into(), copy.created_at.clone())
        }
    };
    let original = original_id
        .map(|id| get_document_from_conn(&conn, &id))
        .transpose()?
        .flatten();
    Ok(DocumentConflict {
        copy,
        original,
        reason,
        created_at,
    })
}

pub fn acknowledge_document_conflict(
    app: &AppHandle,
    expected_scope: &str,
    copy_id: &str,
) -> Result<()> {
    let connection = open_scoped_db(app, expected_scope)?;
    let conn = rusqlite::Transaction::new_unchecked(
        &connection,
        rusqlite::TransactionBehavior::Immediate,
    )?;
    let copy = get_document_from_conn(&conn, copy_id)?.context("冲突副本不存在或已删除")?;
    let tracked: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM document_conflicts WHERE copy_id=?1)",
        params![copy_id],
        |r| r.get(0),
    )?;
    anyhow::ensure!(
        tracked
            || [
                "（同步冲突副本）",
                "（编辑期间的同步冲突副本）",
                "（删除期间的云端修改副本）"
            ]
            .iter()
            .any(|marker| copy.title.ends_with(marker)),
        "此文档不是已识别的冲突副本"
    );
    conn.execute("INSERT INTO document_conflicts(copy_id,reason,created_at,resolved_at) VALUES (?1,'name-marker',?2,?2)
        ON CONFLICT(copy_id) DO UPDATE SET resolved_at=excluded.resolved_at", params![copy_id,now_iso()])?;
    conn.commit()?;
    Ok(())
}
