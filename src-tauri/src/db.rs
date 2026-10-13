use anyhow::{Context, Result};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
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
    pub account_scope: String,
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
    pub content_generation: i64,
    pub account_scope: String,
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
    #[serde(default)]
    pub conflict_copies: usize,
    pub mode: String,
    pub pending_jobs: usize,
    pub last_synced_at: Option<String>,
    pub last_pulled_at: Option<String>,
    pub auto_sync_enabled: bool,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppState {
    pub account_user_id: Option<String>,
    pub account_scope: String,
    pub recovery_available: bool,
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
    pub content_generation: i64,
    pub account_scope: String,
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
    #[serde(default)]
    pub mutation_id: String,
    #[serde(default)]
    pub revision: i64,
    #[serde(default)]
    pub is_purged: bool,
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
    pub account_scope: String,
    pub pending_job_ids: Vec<i64>,
    pub documents: Vec<SyncDocumentRecord>,
    pub last_pulled_at: Option<String>,
}

pub fn local_data_dir(app: &AppHandle) -> Result<PathBuf> {
    let base = app.path().app_data_dir().context("无法获取应用数据目录")?;
    let dir = base.join("vana-local");
    std::fs::create_dir_all(&dir)
        .with_context(|| format!("无法创建数据目录: {}", dir.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700))?;
    }
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

        CREATE TABLE IF NOT EXISTS document_conflicts (
            copy_id TEXT PRIMARY KEY,
            original_id TEXT,
            reason TEXT NOT NULL,
            created_at TEXT NOT NULL,
            resolved_at TEXT
        );
        ",
    )?;
    ensure_column(
        conn,
        "documents",
        "content_generation",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(conn, "documents", "revision", "INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(conn, "documents", "is_purged", "INTEGER NOT NULL DEFAULT 0")?;
    conn.execute_batch("CREATE TABLE IF NOT EXISTS write_events (created_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS queue_pending_entity ON sync_queue(entity_type, entity_id, processed_at);
        DELETE FROM sync_queue WHERE processed_at IS NOT NULL;
        DELETE FROM sync_queue WHERE id NOT IN (SELECT MAX(id) FROM sync_queue GROUP BY entity_type, entity_id);
        ")?;
    ensure_column(
        conn,
        "documents",
        "node_kind",
        "TEXT NOT NULL DEFAULT 'document'",
    )?;
    ensure_column(conn, "documents", "parent_id", "TEXT")?;
    ensure_column(conn, "documents", "depth", "INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(conn, "attachments", "kind", "TEXT NOT NULL DEFAULT 'file'")?;
    ensure_column(conn, "attachments", "storage_bucket", "TEXT")?;
    ensure_column(conn, "attachments", "storage_object_path", "TEXT")?;
    ensure_column(conn, "attachments", "checksum_sha256", "TEXT")?;
    ensure_column(
        conn,
        "attachments",
        "upload_state",
        "TEXT NOT NULL DEFAULT 'local-only'",
    )?;
    prune_history(conn)?;
    let mut stmt = conn.prepare("SELECT id, payload FROM sync_queue")?;
    let jobs = stmt
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    for (id, payload) in jobs {
        if Uuid::parse_str(&payload).is_err() {
            conn.execute(
                "UPDATE sync_queue SET payload=?2 WHERE id=?1",
                params![id, Uuid::new_v4().to_string()],
            )?;
        }
    }
    Ok(())
}

fn seed_if_empty(conn: &Connection) -> Result<()> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM documents", [], |row| row.get(0))?;
    if count > 0 {
        return Ok(());
    }

    let now = now_iso();
    let welcome_id = Uuid::new_v4().to_string();
    let welcome = r#"{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Welcome to Vana"}]},{"type":"paragraph","content":[{"type":"text","text":"文档先保存在当前本地空间。登录后使用独立的账号空间；访客文档可在设置中明确复制到账号。"}]}]}"#;

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
    let connection = open_db(app)?;
    let conn = connection.unchecked_transaction()?;
    let pending_jobs: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sync_queue WHERE processed_at IS NULL",
        [],
        |row| row.get(0),
    )?;

    anyhow::ensure!(
        active_scope(&conn)? == get_config_value(&conn, "space.id")?.unwrap_or_default(),
        "账号在读取状态期间已切换，请重试"
    );
    let last_synced_at = get_config_value(&conn, "sync.last_synced_at")?;
    let last_pulled_at = get_config_value(&conn, "sync.last_pulled_at")?;
    let last_error = get_config_value(&conn, "sync.last_error")?;
    let supabase = effective_supabase_config(&conn)?;
    let session = get_config_value(&conn, "supabase.session")?
        .map(|raw| serde_json::from_str::<SupabaseSession>(&raw))
        .transpose()?;
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
        account_user_id: session.as_ref().and_then(|s| s.user_id.clone()),
        account_scope: get_config_value(&conn, "space.id")?.unwrap_or_default(),
        recovery_available: local_data_dir(app)?.join("legacy-unassigned.db").exists(),
        account_mode,
        onboarding_completed,
        service_profile: service_profile.clone(),
        account_email,
        local_db_path: conn.path().unwrap_or_default().to_string(),
        legacy_workspace_path: legacy_workspace_dir(app)?.to_string_lossy().to_string(),
        supabase: supabase.clone(),
        sync: SyncSnapshot {
            conflict_copies: 0,
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
    let connection = open_db(app)?;
    let conn = connection.unchecked_transaction()?;
    let scope = get_config_value(&conn, "space.id")?.unwrap_or_default();
    let docs = if let Some(requested_status) = status {
        let mut stmt = conn.prepare(
            "
            SELECT id, title, node_kind, parent_id, depth, status, is_favorite, is_template, created_at, updated_at, archived_at, deleted_at
            FROM documents
            WHERE status = ?1 AND is_purged = 0
            ORDER BY is_favorite DESC, updated_at DESC
            ",
        )?;

        let rows = stmt.query_map(params![requested_status], |row| {
            Ok(DocumentSummary {
                account_scope: scope.clone(),
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
            WHERE is_purged = 0
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
                account_scope: scope.clone(),
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

    let mut tags_by_document: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    let mut stmt = conn.prepare(
        "SELECT document_id, name FROM document_tags JOIN tags ON tags.id = tag_id ORDER BY name",
    )?;
    for row in stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))? {
        let (id, name) = row?;
        tags_by_document.entry(id).or_default().push(name);
    }
    Ok(docs
        .into_iter()
        .map(|mut doc| {
            doc.tags = tags_by_document.remove(&doc.id).unwrap_or_default();
            doc
        })
        .collect())
}

pub fn get_document(app: &AppHandle, id: &str) -> Result<Option<DocumentRecord>> {
    let conn = open_db(app)?;
    get_document_from_conn(&conn, id)
}

fn get_document_from_conn(conn: &Connection, id: &str) -> Result<Option<DocumentRecord>> {
    let scope = get_config_value(conn, "space.id")?.unwrap_or_default();
    let record = conn
        .query_row(
            "
            SELECT id, title, node_kind, parent_id, depth, content_json, plain_text, status, is_favorite, is_template, created_at, updated_at, archived_at, deleted_at, content_generation
            FROM documents
            WHERE id = ?1 AND is_purged = 0
            ",
            params![id],
            |row| {
                Ok(DocumentRecord {
                    content_generation: row.get(14)?,
                    account_scope: scope.clone(),
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

pub fn upsert_tag(
    app: &AppHandle,
    expected_scope: &str,
    id: Option<String>,
    name: &str,
    color: Option<String>,
) -> Result<TagRecord> {
    let connection = open_scoped_db(app, expected_scope)?;
    let conn = rusqlite::Transaction::new_unchecked(
        &connection,
        rusqlite::TransactionBehavior::Immediate,
    )?;
    let resolved_id = id.unwrap_or_else(|| Uuid::new_v4().to_string());
    conn.execute(
        "
        INSERT INTO tags (id, name, color)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(name) DO UPDATE SET color = excluded.color
        ",
        params![resolved_id, name.trim(), color],
    )?;

    let record=conn.query_row("SELECT tags.id,tags.name,tags.color,COUNT(document_tags.document_id)
        FROM tags LEFT JOIN document_tags ON document_tags.tag_id=tags.id WHERE tags.name=?1 GROUP BY tags.id",params![name.trim()],|row|Ok(TagRecord {
            id:row.get(0)?,name:row.get(1)?,color:row.get(2)?,document_count:row.get::<_,i64>(3)? as usize,
        }))?;
    conn.commit()?;
    Ok(record)
}

pub fn save_supabase_config(app: &AppHandle, config: SupabaseConfig) -> Result<SupabaseConfig> {
    let control = open_control(app)?;
    control.pragma_update(None, "secure_delete", "ON")?;
    let conn = control.unchecked_transaction()?;
    let old = effective_supabase_config(&conn)?;
    if old.url.as_deref().map(canonical_project).transpose()?
        != config.url.as_deref().map(canonical_project).transpose()?
    {
        if let Some(key) = get_config_value(&conn, "supabase.credential_id")? {
            crate::credentials::remove(app, &key)?;
        }
        set_config_value(&conn, "supabase.credential_id", None)?;
        set_config_value(&conn, "supabase.session", None)?;
        set_config_value(&conn, "supabase.user_id", None)?;
        set_config_value(&conn, "supabase.email", None)?;
    }
    set_config_value(&conn, "supabase.url", config.url.as_deref())?;
    set_config_value(&conn, "supabase.anon_key", config.anon_key.as_deref())?;
    conn.commit()?;
    Ok(config)
}

pub fn get_supabase_config(app: &AppHandle) -> Result<SupabaseConfig> {
    let conn = open_control(app)?;
    effective_supabase_config(&conn)
}

pub fn complete_onboarding(app: &AppHandle) -> Result<()> {
    let control = open_control(app)?;
    let conn = control.unchecked_transaction()?;
    set_config_value(&conn, "onboarding.completed", Some("1"))?;
    conn.commit()?;
    Ok(())
}

pub fn mark_sync_attempt(
    app: &AppHandle,
    success: bool,
    error: Option<&str>,
) -> Result<SyncSnapshot> {
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
        conflict_copies: 0,
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
    expected_scope: &str,
    mut read_path: impl FnMut(&str) -> Result<String>,
) -> Result<LegacyImportResult> {
    let legacy_root = legacy_workspace_dir(app)?;
    let connection = open_scoped_db(app, expected_scope)?;
    let conn = rusqlite::Transaction::new_unchecked(
        &connection,
        rusqlite::TransactionBehavior::Immediate,
    )?;

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

        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default();
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
        } else if file_name.ends_with(".md")
            || file_name.ends_with(".json")
            || file_name.ends_with(".txt")
        {
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
            validate_content(trimmed)?;
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

    conn.commit()?;
    Ok(LegacyImportResult {
        imported_documents,
        skipped_entries,
        imported_paths,
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchMatch {
    pub line: usize,
    pub column: usize,
    pub context: String,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub document_id: String,
    pub title: String,
    pub matches: Vec<SearchMatch>,
}

/// Explicit copy only: guest/unknown-owner data never silently joins a signed-in outbox.
pub fn recover_local_documents(
    app: &AppHandle,
    expected_scope: &str,
    source: &str,
) -> Result<usize> {
    anyhow::ensure!(matches!(source, "guest" | "legacy"), "恢复来源无效");
    anyhow::ensure!(
        source != "guest" || expected_scope != "guest",
        "已在访客空间"
    );
    let destination = open_scoped_db(app, expected_scope)?;
    let conn = rusqlite::Transaction::new_unchecked(
        &destination,
        rusqlite::TransactionBehavior::Immediate,
    )?;
    let marker = format!("recovery.imported.{source}");
    anyhow::ensure!(
        get_config_value(&conn, &marker)?.is_none(),
        "此来源已导入当前空间"
    );
    let path = local_data_dir(app)?.join(if source == "guest" {
        "space-guest.db"
    } else {
        "legacy-unassigned.db"
    });
    anyhow::ensure!(path.exists(), "恢复数据库不存在");
    let original = Connection::open(path)?;
    init_schema(&original)?;
    validate_tree(&original)?;
    let mut stmt =
        original.prepare("SELECT id FROM documents WHERE is_purged=0 ORDER BY depth,id")?;
    let ids = stmt
        .query_map([], |r| r.get::<_, String>(0))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    let remap: std::collections::HashMap<_, _> = ids
        .iter()
        .map(|id| (id.clone(), Uuid::new_v4().to_string()))
        .collect();
    for id in &ids {
        let mut d = sync_record(&original, id)?;
        if validate_content(&d.content_json).is_err() {
            // Preserve malformed legacy bytes as visible text rather than silently dropping them.
            d.plain_text = d.content_json.clone();
            d.content_json=serde_json::json!({"type":"doc","content":[{"type":"codeBlock","content":[{"type":"text","text":d.plain_text}]}]}).to_string();
            d.title.push_str("（旧正文恢复）");
        }
        d.id = remap[id].clone();
        d.revision = 0;
        d.created_at = now_iso();
        d.updated_at = now_iso();
        d.parent_id = d.parent_id.and_then(|p| remap.get(&p).cloned());
        ensure_document_count_capacity(&conn, usize::from(d.node_kind == "document"))?;
        ensure_total_storage_capacity(
            &conn,
            estimate_document_storage_bytes(&d.title, &d.content_json, &d.plain_text) as isize,
        )?;
        write_remote(&conn, &d)?;
        queue_job(&conn, "document", &d.id, "recover", "")?;
    }
    validate_tree(&conn)?;
    set_config_value(&conn, &marker, Some("1"))?;
    conn.commit()?;
    Ok(ids.len())
}

pub fn simple_search(app: &AppHandle, query: &str) -> Result<Vec<SearchResult>> {
    let conn = open_db(app)?;
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Ok(vec![]);
    }
    let mut stmt=conn.prepare("SELECT id,title,plain_text FROM documents WHERE is_purged=0 AND status='active'
        AND node_kind='document' AND (instr(lower(title),lower(?1))>0 OR instr(lower(plain_text),lower(?1))>0)
        ORDER BY updated_at DESC LIMIT 100")?;
    let rows = stmt
        .query_map(params![query.trim()], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    let mut results = vec![];
    for (id, title, text) in rows {
        let mut matches = vec![];
        for (line_index, line) in text.lines().enumerate() {
            let lowered = line.to_lowercase();
            if let Some(index) = lowered.find(&needle) {
                let column = lowered[..index].chars().count();
                matches.push(SearchMatch {
                    line: line_index + 1,
                    column,
                    context: line
                        .chars()
                        .skip(column.saturating_sub(60))
                        .take(240)
                        .collect(),
                });
                if matches.len() == 3 {
                    break;
                }
            }
        }
        if matches.is_empty() {
            matches.push(SearchMatch {
                line: 0,
                column: 0,
                context: title.clone(),
            });
        }
        results.push(SearchResult {
            document_id: id,
            title,
            matches,
        });
    }
    Ok(results)
}

fn append_history(conn: &Connection, document_id: &str, snapshot: &str) -> Result<()> {
    let previous: Option<String> = conn.query_row(
        "SELECT snapshot FROM document_history WHERE document_id=?1 ORDER BY created_at DESC,rowid DESC LIMIT 1",
        params![document_id], |row| row.get(0),
    ).optional()?;
    if previous.as_deref() == Some(snapshot) {
        return Ok(());
    }
    conn.execute(
        "
        INSERT INTO document_history (id, document_id, snapshot, created_at)
        VALUES (?1, ?2, ?3, ?4)
        ",
        params![Uuid::new_v4().to_string(), document_id, snapshot, now_iso()],
    )?;
    prune_history(conn)?;
    Ok(())
}

fn prune_history(conn: &Connection) -> Result<()> {
    conn.execute("DELETE FROM document_history WHERE rowid IN (SELECT rowid FROM
        (SELECT rowid, ROW_NUMBER() OVER (PARTITION BY document_id ORDER BY created_at DESC,rowid DESC) AS position FROM document_history)
        WHERE position>20)", [])?;
    conn.execute(
        "DELETE FROM document_history WHERE created_at < ?1",
        params![(Utc::now() - chrono::Duration::days(30)).to_rfc3339()],
    )?;
    // A global byte cap prevents a large collection from multiplying the per-document allowance.
    conn.execute("DELETE FROM document_history WHERE rowid IN (SELECT rowid FROM
        (SELECT rowid, SUM(length(CAST(snapshot AS BLOB))) OVER (ORDER BY created_at DESC, rowid DESC) AS bytes
        FROM document_history) WHERE bytes > 5242880)", [])?;
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

    for tag_name in tags
        .iter()
        .map(|tag| tag.trim())
        .filter(|tag| !tag.is_empty())
    {
        let tag_id = conn
            .query_row(
                "SELECT id FROM tags WHERE name = ?1",
                params![tag_name],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        let tag_id = match tag_id {
            Some(id) => id,
            None => {
                let id = Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO tags (id, name) VALUES (?1, ?2)",
                    params![id, tag_name],
                )?;
                id
            }
        };

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

fn queue_job(
    conn: &Connection,
    entity_type: &str,
    entity_id: &str,
    action: &str,
    _payload: &str,
) -> Result<()> {
    conn.execute(
        "DELETE FROM sync_queue WHERE entity_type = ?1 AND entity_id = ?2",
        params![entity_type, entity_id],
    )?;
    conn.execute("INSERT INTO sync_queue (entity_type, entity_id, action, payload, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![entity_type, entity_id, action, Uuid::new_v4().to_string(), now_iso()])?;
    Ok(())
}

fn validate_content(content: &str) -> Result<()> {
    crate::document_content::validate(content)
}

fn estimate_document_storage_bytes(title: &str, content_json: &str, plain_text: &str) -> usize {
    title.as_bytes().len() + content_json.as_bytes().len() + plain_text.as_bytes().len()
}

fn current_document_count(conn: &Connection) -> Result<usize> {
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM documents WHERE node_kind = 'document' AND is_purged = 0",
        [],
        |row| row.get::<_, i64>(0),
    )? as usize)
}

fn current_total_storage_bytes(conn: &Connection) -> Result<usize> {
    Ok(conn.query_row("SELECT
        (SELECT COALESCE(SUM(length(CAST(title AS BLOB)) + length(CAST(content_json AS BLOB)) + length(CAST(plain_text AS BLOB))),0) FROM documents) +
        (SELECT COALESCE(SUM(length(CAST(snapshot AS BLOB))),0) FROM document_history) +
        (SELECT COALESCE(SUM(length(CAST(name AS BLOB))),0) FROM tags) +
        (SELECT COALESCE(SUM(length(CAST(payload AS BLOB))),0) FROM sync_queue) +
        (SELECT COALESCE(SUM(size_bytes),0) FROM attachments)", [], |r| r.get::<_, i64>(0))? as usize)
}

fn current_write_ops_last_5_minutes(conn: &Connection) -> Result<usize> {
    let cutoff = (Utc::now() - chrono::Duration::minutes(5)).to_rfc3339();
    Ok(conn.query_row(
        "
        SELECT COUNT(*) FROM write_events WHERE created_at >= ?1
        ",
        params![cutoff],
        |row| row.get::<_, i64>(0),
    )? as usize)
}

fn hosted_limits_apply(conn: &Connection) -> Result<bool> {
    Ok(current_service_profile(conn)? == "hosted"
        && get_config_value(conn, "supabase.session")?.is_some())
}

fn current_usage_limits(conn: &Connection) -> Result<UsageLimits> {
    Ok(UsageLimits {
        max_document_content_bytes: MAX_DOCUMENT_CONTENT_BYTES,
        max_total_storage_bytes: if hosted_limits_apply(conn)? {
            MAX_TOTAL_STORAGE_BYTES
        } else {
            0
        },
        max_document_count: if hosted_limits_apply(conn)? {
            MAX_DOCUMENT_COUNT
        } else {
            0
        },
        max_write_ops_per_5_minutes: if hosted_limits_apply(conn)? {
            MAX_WRITE_OPS_PER_5_MINUTES
        } else {
            0
        },
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
    if hosted_limits_apply(conn)? && current + additional_documents > MAX_DOCUMENT_COUNT {
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
    if hosted_limits_apply(conn)? && projected > MAX_TOTAL_STORAGE_BYTES {
        return Err(anyhow::anyhow!(
            "已达到 Hosted 模式总存储上限（{} MB）",
            MAX_TOTAL_STORAGE_BYTES / 1024 / 1024
        ));
    }
    Ok(())
}

fn ensure_write_budget(conn: &Connection) -> Result<()> {
    conn.execute(
        "DELETE FROM write_events WHERE created_at < ?1",
        params![(Utc::now() - chrono::Duration::minutes(5)).to_rfc3339()],
    )?;
    let current = current_write_ops_last_5_minutes(conn)?;
    if hosted_limits_apply(conn)? && current >= MAX_WRITE_OPS_PER_5_MINUTES {
        return Err(anyhow::anyhow!(
            "最近 5 分钟写入次数已达到上限（{}）",
            MAX_WRITE_OPS_PER_5_MINUTES
        ));
    }
    conn.execute("INSERT INTO write_events VALUES (?1)", params![now_iso()])?;
    Ok(())
}

fn has_supabase_override(conn: &Connection) -> Result<bool> {
    Ok(get_config_value(conn, "supabase.url")?.is_some()
        || get_config_value(conn, "supabase.anon_key")?.is_some())
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

        let mut visited = std::collections::HashSet::new();
        while let Some(ancestor_id) = current_parent {
            anyhow::ensure!(visited.insert(ancestor_id.clone()), "现有目录包含循环");
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
            "UPDATE documents SET depth = ?2, updated_at = ?3 WHERE id = ?1",
            params![child_id, child_depth, now_iso()],
        )?;
        queue_job(conn, "document", &child_id, "move", "")?;
        cascade_child_depths(conn, &child_id, child_depth)?;
    }

    Ok(())
}

fn apply_status_to_subtree(conn: &Connection, id: &str, status: &str, now: &str) -> Result<()> {
    anyhow::ensure!(get_document_from_conn(conn, id)?.is_some(), "文档不存在");
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

    queue_job(conn, "document", id, "status", "")?;
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

fn config_table(conn: &Connection, key: &str) -> &'static str {
    let global = key.starts_with("supabase.") || key.starts_with("onboarding.");
    let attached = conn
        .prepare("PRAGMA database_list")
        .and_then(|mut s| {
            s.query_map([], |r| r.get::<_, String>(1))
                .and_then(|rows| rows.collect::<std::result::Result<Vec<_>, _>>())
        })
        .map(|names| names.iter().any(|n| n == "control"))
        .unwrap_or(false);
    if global && attached {
        "control.app_config"
    } else {
        "app_config"
    }
}

fn get_config_value(conn: &Connection, key: &str) -> Result<Option<String>> {
    Ok(conn
        .query_row(
            &format!(
                "SELECT value FROM {} WHERE key = ?1",
                config_table(conn, key)
            ),
            params![key],
            |row| row.get(0),
        )
        .optional()?)
}

fn set_config_value(conn: &Connection, key: &str, value: Option<&str>) -> Result<()> {
    if let Some(value) = value {
        conn.execute(
            &format!(
                "INSERT INTO {} (key, value) VALUES (?1, ?2)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                config_table(conn, key)
            ),
            params![key, value],
        )?;
    } else {
        conn.execute(
            &format!("DELETE FROM {} WHERE key = ?1", config_table(conn, key)),
            params![key],
        )?;
    }
    Ok(())
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

#[path = "db/accounts.rs"]
mod accounts;
pub use accounts::open_db;
use accounts::{active_scope, canonical_project, open_control, open_scoped_db};

#[path = "db/documents.rs"]
mod documents;
#[path = "db/history.rs"]
mod history;
#[path = "db/backup.rs"]
mod backup;
#[path = "db/conflicts.rs"]
mod conflicts;
pub use conflicts::{list_document_conflicts, get_document_conflict, acknowledge_document_conflict, DocumentConflict, DocumentConflictSummary};
use conflicts::record_conflict;
pub use backup::{export_space_backup, import_space_backup, preview_space_backup, BackupImportResult, BackupPreview};
pub use documents::{
    create_document, move_document, permanently_delete_document, save_document,
    set_document_status, toggle_favorite,
};
pub use history::{list_document_history, restore_document_history, DocumentHistoryEntry, RestoreDocumentHistoryInput};

#[path = "db/sync.rs"]
mod sync;
pub use sync::{
    apply_remote_documents, export_document_structures, export_sync_documents, finalize_sync_jobs,
    ApplyRemoteResult,
};
use sync::{sync_record, validate_tree, write_remote};

#[path = "db/session.rs"]
mod session;
pub use session::{save_supabase_session, get_supabase_session, clear_supabase_session};
