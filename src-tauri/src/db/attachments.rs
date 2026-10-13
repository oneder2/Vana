//! Local binary payloads share the document database transaction. No user path
//! is stored or opened, and local attachments never enter the document outbox.
use super::*;
use base64::{engine::general_purpose::STANDARD, Engine};

pub const MAX_ATTACHMENT_BYTES: usize = 5 * 1024 * 1024;
pub const MAX_LOCAL_ATTACHMENT_BYTES: usize = 25 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AttachmentSummary {
    pub id: String,
    pub document_id: String,
    pub file_name: String,
    pub mime_type: String,
    pub size_bytes: usize,
    pub checksum_sha256: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PortableAttachment {
    pub metadata: AttachmentSummary,
    pub data_base64: String,
}

pub(super) fn decode(data: &str) -> Result<Vec<u8>> {
    anyhow::ensure!(
        data.len() <= MAX_ATTACHMENT_BYTES.div_ceil(3) * 4,
        "附件超过 5 MiB 上限"
    );
    let bytes = STANDARD.decode(data).context("附件编码损坏")?;
    anyhow::ensure!(bytes.len() <= MAX_ATTACHMENT_BYTES, "附件超过 5 MiB 上限");
    Ok(bytes)
}

fn mime_type(name: &str, bytes: &[u8]) -> Result<&'static str> {
    anyhow::ensure!(
        name == crate::export_file::sanitize_filename(name) && name.len() <= 180,
        "文件名不受支持，请重命名后重试"
    );
    let extension = name
        .rsplit_once('.')
        .map(|(_, ext)| ext.to_ascii_lowercase())
        .unwrap_or_default();
    let (mime, valid) = match extension.as_str() {
        "txt" => ("text/plain", std::str::from_utf8(bytes).is_ok()),
        "md" => ("text/markdown", std::str::from_utf8(bytes).is_ok()),
        "csv" => ("text/csv", std::str::from_utf8(bytes).is_ok()),
        "pdf" => ("application/pdf", bytes.starts_with(b"%PDF-")),
        "png" => ("image/png", bytes.starts_with(b"\x89PNG\r\n\x1a\n")),
        "jpg" | "jpeg" => ("image/jpeg", bytes.starts_with(b"\xff\xd8\xff")),
        "gif" => (
            "image/gif",
            bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        ),
        "webp" => (
            "image/webp",
            bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP"),
        ),
        "docx" => (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            bytes.starts_with(b"PK\x03\x04"),
        ),
        "zip" => (
            "application/zip",
            bytes.starts_with(b"PK\x03\x04") || bytes.starts_with(b"PK\x05\x06"),
        ),
        _ => anyhow::bail!("支持 TXT、Markdown、CSV、PDF、PNG、JPEG、GIF、WebP、DOCX 和 ZIP 附件"),
    };
    anyhow::ensure!(valid, "附件内容与文件类型不匹配，文本文件需为 UTF-8");
    Ok(mime)
}

fn require_document(conn: &Connection, id: &str, writable: bool) -> Result<()> {
    Uuid::parse_str(id).context("附件所属文档 ID 无效")?;
    let document = get_document_from_conn(conn, id)?.context("附件所属文档不存在")?;
    anyhow::ensure!(document.node_kind == "document", "分组不能添加附件");
    if writable {
        anyhow::ensure!(
            document.status == "active",
            "请先恢复或取消归档，再修改附件"
        );
    }
    Ok(())
}

pub(super) fn validate_portable(attachment: &PortableAttachment) -> Result<Vec<u8>> {
    let m = &attachment.metadata;
    Uuid::parse_str(&m.id).context("附件 ID 无效")?;
    Uuid::parse_str(&m.document_id).context("附件所属文档 ID 无效")?;
    chrono::DateTime::parse_from_rfc3339(&m.created_at).context("附件时间无效")?;
    let bytes = decode(&attachment.data_base64)?;
    anyhow::ensure!(
        bytes.len() == m.size_bytes && format!("{:x}", Sha256::digest(&bytes)) == m.checksum_sha256,
        "附件长度或 SHA-256 校验失败"
    );
    anyhow::ensure!(
        mime_type(&m.file_name, &bytes)? == m.mime_type,
        "附件类型无效"
    );
    Ok(bytes)
}

fn limits(conn: &Connection, document_id: &str, incoming: usize) -> Result<()> {
    let (count, bytes): (usize, usize) = conn.query_row(
        "SELECT COUNT(*),COALESCE(SUM(size_bytes),0) FROM attachments",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let per_document: usize = conn.query_row(
        "SELECT COUNT(*) FROM attachments WHERE document_id=?1",
        params![document_id],
        |r| r.get(0),
    )?;
    anyhow::ensure!(
        count < 1000 && per_document < 20,
        "附件数量达到上限（每文档 20 个，每空间 1000 个）"
    );
    anyhow::ensure!(
        bytes
            .checked_add(incoming)
            .is_some_and(|size| size <= MAX_LOCAL_ATTACHMENT_BYTES),
        "本地附件总量超过 25 MiB 上限"
    );
    ensure_total_storage_capacity(conn, incoming as isize)
}

pub(super) fn insert_portable(
    conn: &Connection,
    attachment: &PortableAttachment,
    id: &str,
    document_id: &str,
) -> Result<()> {
    insert_record(conn, attachment, id, document_id, true)
}

fn insert_record(
    conn: &Connection,
    attachment: &PortableAttachment,
    id: &str,
    document_id: &str,
    enforce_capacity: bool,
) -> Result<()> {
    require_document(conn, document_id, false)?;
    let bytes = validate_portable(attachment)?;
    let m = &attachment.metadata;
    if enforce_capacity {
        limits(conn, document_id, bytes.len())?;
    }
    conn.execute("INSERT INTO attachments(id,document_id,file_name,mime_type,size_bytes,kind,checksum_sha256,upload_state,created_at)
        VALUES (?1,?2,?3,?4,?5,'file',?6,'local-only',?7)",
        params![id,document_id,m.file_name,m.mime_type,bytes.len(),m.checksum_sha256,m.created_at])?;
    conn.execute(
        "INSERT INTO attachment_blobs(attachment_id,data) VALUES (?1,?2)",
        params![id, bytes],
    )?;
    Ok(())
}

fn summaries(conn: &Connection, document_id: Option<&str>) -> Result<Vec<AttachmentSummary>> {
    let missing: usize = conn.query_row(
        "SELECT COUNT(*) FROM attachments a LEFT JOIN attachment_blobs b ON b.attachment_id=a.id
        WHERE b.attachment_id IS NULL AND (?1 IS NULL OR a.document_id=?1)",
        params![document_id],
        |r| r.get(0),
    )?;
    anyhow::ensure!(
        missing == 0,
        "附件缺少本地内容，请保留原始文件并重新添加；备份未略过损坏附件"
    );
    let mut statement = conn.prepare("SELECT a.id,a.document_id,a.file_name,a.mime_type,a.size_bytes,a.checksum_sha256,a.created_at
        FROM attachments a JOIN attachment_blobs b ON b.attachment_id=a.id JOIN documents d ON d.id=a.document_id
        WHERE d.is_purged=0 AND (?1 IS NULL OR a.document_id=?1) ORDER BY a.created_at,a.id")?;
    let rows = statement
        .query_map(params![document_id], |row| {
            Ok(AttachmentSummary {
                id: row.get(0)?,
                document_id: row.get(1)?,
                file_name: row.get(2)?,
                mime_type: row.get(3)?,
                size_bytes: row.get(4)?,
                checksum_sha256: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

pub(super) fn portable_from_conn(
    conn: &Connection,
    document_id: Option<&str>,
) -> Result<Vec<PortableAttachment>> {
    let mut result = Vec::new();
    for metadata in summaries(conn, document_id)? {
        let data: Vec<u8> = conn.query_row(
            "SELECT data FROM attachment_blobs WHERE attachment_id=?1",
            params![metadata.id],
            |r| r.get(0),
        )?;
        let attachment = PortableAttachment {
            metadata,
            data_base64: STANDARD.encode(data),
        };
        validate_portable(&attachment)?;
        result.push(attachment);
    }
    Ok(result)
}

pub(super) fn copy_between(
    source: &Connection,
    destination: &Connection,
    source_id: &str,
    destination_id: &str,
) -> Result<()> {
    for attachment in portable_from_conn(source, Some(source_id))? {
        // A conflict may subsequently purge the source in the same transaction.
        // Callers validate final capacity before committing, rather than counting
        // both copies at the intermediate point and rejecting an equal-size move.
        insert_record(
            destination,
            &attachment,
            &Uuid::new_v4().to_string(),
            destination_id,
            false,
        )?;
    }
    Ok(())
}

pub(super) fn validate_capacity(conn: &Connection) -> Result<()> {
    let (count, bytes): (usize, usize) = conn.query_row(
        "SELECT COUNT(*),COALESCE(SUM(size_bytes),0) FROM attachments",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let largest: usize = conn.query_row("SELECT COALESCE(MAX(n),0) FROM (SELECT COUNT(*) AS n FROM attachments GROUP BY document_id)", [], |r| r.get(0))?;
    anyhow::ensure!(
        count <= 1000 && largest <= 20 && bytes <= MAX_LOCAL_ATTACHMENT_BYTES,
        "附件副本超过本地容量或数量上限，请先导出备份并整理附件"
    );
    ensure_total_storage_capacity(conn, 0)
}

fn check_scope(conn: &Connection, expected_scope: &str) -> Result<()> {
    anyhow::ensure!(
        active_scope(conn)? == expected_scope,
        "账号空间已切换，请刷新后重试"
    );
    Ok(())
}

pub fn list_attachments(
    app: &AppHandle,
    expected_scope: &str,
    document_id: &str,
) -> Result<Vec<AttachmentSummary>> {
    let connection = open_scoped_db(app, expected_scope)?;
    let conn = connection.unchecked_transaction()?;
    check_scope(&conn, expected_scope)?;
    require_document(&conn, document_id, false)?;
    summaries(&conn, Some(document_id))
}

pub fn add_attachment(
    app: &AppHandle,
    expected_scope: &str,
    document_id: &str,
    filename: &str,
    data_base64: &str,
) -> Result<AttachmentSummary> {
    let bytes = decode(data_base64)?;
    let mime = mime_type(filename, &bytes)?;
    let attachment = PortableAttachment {
        metadata: AttachmentSummary {
            id: Uuid::new_v4().to_string(),
            document_id: document_id.into(),
            file_name: filename.into(),
            mime_type: mime.into(),
            size_bytes: bytes.len(),
            checksum_sha256: format!("{:x}", Sha256::digest(bytes)),
            created_at: now_iso(),
        },
        data_base64: data_base64.into(),
    };
    let connection = open_scoped_db(app, expected_scope)?;
    let conn = rusqlite::Transaction::new_unchecked(
        &connection,
        rusqlite::TransactionBehavior::Immediate,
    )?;
    check_scope(&conn, expected_scope)?;
    require_document(&conn, document_id, true)?;
    ensure_write_budget(&conn)?;
    insert_portable(&conn, &attachment, &attachment.metadata.id, document_id)?;
    conn.commit()?;
    Ok(attachment.metadata)
}

pub fn read_attachment(
    app: &AppHandle,
    expected_scope: &str,
    document_id: &str,
    id: &str,
) -> Result<PortableAttachment> {
    let connection = open_scoped_db(app, expected_scope)?;
    let conn = connection.unchecked_transaction()?;
    check_scope(&conn, expected_scope)?;
    require_document(&conn, document_id, false)?;
    let metadata = summaries(&conn, Some(document_id))?
        .into_iter()
        .find(|m| m.id == id)
        .context("附件不存在")?;
    let bytes: Vec<u8> = conn.query_row(
        "SELECT data FROM attachment_blobs WHERE attachment_id=?1",
        params![id],
        |r| r.get(0),
    )?;
    let attachment = PortableAttachment {
        metadata,
        data_base64: STANDARD.encode(bytes),
    };
    validate_portable(&attachment)?;
    Ok(attachment)
}

pub fn remove_attachment(
    app: &AppHandle,
    expected_scope: &str,
    document_id: &str,
    id: &str,
) -> Result<()> {
    let connection = open_scoped_db(app, expected_scope)?;
    let conn = rusqlite::Transaction::new_unchecked(
        &connection,
        rusqlite::TransactionBehavior::Immediate,
    )?;
    check_scope(&conn, expected_scope)?;
    require_document(&conn, document_id, true)?;
    ensure_write_budget(&conn)?;
    anyhow::ensure!(
        conn.execute(
            "DELETE FROM attachments WHERE id=?1 AND document_id=?2",
            params![id, document_id]
        )? == 1,
        "附件不存在"
    );
    conn.commit()?;
    Ok(())
}
