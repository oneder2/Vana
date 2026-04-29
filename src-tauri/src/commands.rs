use crate::db::{
    self, AppState, DocumentRecord, DocumentSummary, LegacyImportResult, SaveDocumentInput,
    SupabaseConfig, SupabaseSession, SyncDocumentRecord, SyncExport, SyncSnapshot, TagRecord,
};
use crate::keychain::{export_master_key, import_master_key};
use crate::storage::{
    copy_file_or_directory, create_directory, create_file, delete_directory, delete_file,
    list_directory, move_file_or_directory, read_encrypted_file, rename_file_or_directory,
    write_encrypted_file, FileInfo,
};
use crate::typst_export::compile_typst_source_to_pdf;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AtmosphereConfig {
    pub theme: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceConfig {
    pub commit_scope: String,
    pub auto_commit_interval: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LibraryEntry {
    pub favorite: bool,
    pub archived_at: Option<String>,
    pub last_opened_at: Option<String>,
    pub trashed_at: Option<String>,
    pub original_path: Option<String>,
    pub title_override: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LibraryMetadata {
    pub entries: std::collections::HashMap<String, LibraryEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchMatch {
    pub line: usize,
    pub column: usize,
    pub context: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub file_path: String,
    pub matches: Vec<SearchMatch>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConflictFile {
    pub path: String,
    pub ours: String,
    pub theirs: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConflict {
    pub files: Vec<SyncConflictFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictResolutionItem {
    pub path: String,
    pub choice: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub success: bool,
    pub message: String,
    pub conflict: Option<SyncConflict>,
}

#[tauri::command]
pub fn get_platform() -> Result<String, String> {
    let platform = std::env::consts::OS;
    match platform {
        "windows" => Ok("windows".to_string()),
        "linux" => Ok("linux".to_string()),
        "android" => Ok("android".to_string()),
        other => Err(format!("不支持的平台: {}", other)),
    }
}

#[tauri::command]
pub fn get_workspace_path(app: AppHandle) -> Result<String, String> {
    db::legacy_workspace_dir(&app)
        .map(|path| path.to_string_lossy().to_string())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn ensure_workspace_initialized(app: AppHandle) -> Result<(), String> {
    db::open_db(&app)
        .and_then(|_| db::legacy_workspace_dir(&app).map(|_| ()))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_app_state_command(app: AppHandle) -> Result<AppState, String> {
    db::get_app_state(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_documents_command(app: AppHandle, status: Option<String>) -> Result<Vec<DocumentSummary>, String> {
    db::list_documents(&app, status).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_document_command(app: AppHandle, id: String) -> Result<Option<DocumentRecord>, String> {
    db::get_document(&app, &id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn create_document_command(
    app: AppHandle,
    title: Option<String>,
    is_template: Option<bool>,
    node_kind: Option<String>,
    parent_id: Option<String>,
) -> Result<DocumentRecord, String> {
    db::create_document(&app, title, is_template.unwrap_or(false), node_kind, parent_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_document_command(app: AppHandle, input: SaveDocumentInput) -> Result<DocumentRecord, String> {
    db::save_document(&app, input).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn move_document_command(
    app: AppHandle,
    id: String,
    parent_id: Option<String>,
) -> Result<DocumentRecord, String> {
    db::move_document(&app, &id, parent_id.as_deref()).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_document_status_command(
    app: AppHandle,
    id: String,
    status: String,
) -> Result<DocumentRecord, String> {
    db::set_document_status(&app, &id, &status).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn toggle_favorite_command(
    app: AppHandle,
    id: String,
    favorite: bool,
) -> Result<DocumentRecord, String> {
    db::toggle_favorite(&app, &id, favorite).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_tags_command(app: AppHandle) -> Result<Vec<TagRecord>, String> {
    db::list_tags(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn upsert_tag_command(
    app: AppHandle,
    id: Option<String>,
    name: String,
    color: Option<String>,
) -> Result<TagRecord, String> {
    db::upsert_tag(&app, id, &name, color).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_supabase_config_command(app: AppHandle) -> Result<SupabaseConfig, String> {
    db::get_supabase_config(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_supabase_config_command(
    app: AppHandle,
    config: SupabaseConfig,
) -> Result<SupabaseConfig, String> {
    db::save_supabase_config(&app, config).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_supabase_session_command(app: AppHandle) -> Result<Option<SupabaseSession>, String> {
    db::get_supabase_session(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_supabase_session_command(
    app: AppHandle,
    session: SupabaseSession,
) -> Result<SupabaseSession, String> {
    db::save_supabase_session(&app, session).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn clear_supabase_session_command(app: AppHandle) -> Result<(), String> {
    db::clear_supabase_session(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn complete_onboarding_command(app: AppHandle) -> Result<(), String> {
    db::complete_onboarding(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn mark_sync_attempt_command(
    app: AppHandle,
    success: bool,
    error: Option<String>,
) -> Result<SyncSnapshot, String> {
    db::mark_sync_attempt(&app, success, error.as_deref()).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn export_sync_documents_command(app: AppHandle) -> Result<SyncExport, String> {
    db::export_sync_documents(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn apply_remote_documents_command(
    app: AppHandle,
    documents: Vec<SyncDocumentRecord>,
) -> Result<usize, String> {
    db::apply_remote_documents(&app, documents).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn finalize_sync_jobs_command(
    app: AppHandle,
    processed_job_ids: Vec<i64>,
    success: bool,
    error: Option<String>,
    pulled_cursor: Option<String>,
) -> Result<SyncSnapshot, String> {
    db::finalize_sync_jobs(
        &app,
        &processed_job_ids,
        success,
        error.as_deref(),
        pulled_cursor.as_deref(),
    )
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn import_legacy_workspace_command(app: AppHandle) -> Result<LegacyImportResult, String> {
    db::import_legacy_workspace(&app, |path| {
        let runtime = tokio::runtime::Handle::current();
        runtime.block_on(read_encrypted_file(path, &app))
    })
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn read_workspace_config() -> Result<WorkspaceConfig, String> {
    Ok(WorkspaceConfig {
        commit_scope: "workspace".to_string(),
        auto_commit_interval: 15,
    })
}

#[tauri::command]
pub fn write_workspace_config(_config: WorkspaceConfig) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn read_library_metadata() -> Result<LibraryMetadata, String> {
    Ok(LibraryMetadata::default())
}

#[tauri::command]
pub fn write_library_metadata(_metadata: LibraryMetadata) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn read_file(path: String, app: AppHandle) -> Result<String, String> {
    read_encrypted_file(&path, &app)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn write_file(path: String, content: String, app: AppHandle) -> Result<(), String> {
    write_encrypted_file(&path, &content, &app)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn list_directory_command(path: String) -> Result<Vec<FileInfo>, String> {
    list_directory(&path).await.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn create_file_command(path: String, content: String, app: AppHandle) -> Result<(), String> {
    create_file(&path, &content, &app)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn create_directory_command(path: String) -> Result<(), String> {
    create_directory(&path).await.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn delete_file_command(path: String) -> Result<(), String> {
    delete_file(&path).await.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn delete_directory_command(path: String) -> Result<(), String> {
    delete_directory(&path).await.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn rename_file_or_directory_command(old_path: String, new_path: String) -> Result<(), String> {
    rename_file_or_directory(&old_path, &new_path)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn copy_file_or_directory_command(source_path: String, dest_path: String) -> Result<(), String> {
    copy_file_or_directory(&source_path, &dest_path)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn move_file_or_directory_command(source_path: String, dest_path: String) -> Result<(), String> {
    move_file_or_directory(&source_path, &dest_path)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn search_files_command(app: AppHandle, _workspace_path: String, query: String) -> Result<Vec<SearchResult>, String> {
    let docs = db::simple_search(&app, &query).map_err(|error| error.to_string())?;
    Ok(docs
        .into_iter()
        .map(|doc| SearchResult {
            file_path: doc.title,
            matches: vec![SearchMatch {
                line: 1,
                column: 0,
                context: format!("匹配文档：{}", doc.id),
            }],
        })
        .collect())
}

#[tauri::command]
pub async fn read_atmosphere_config(path: String) -> Result<AtmosphereConfig, String> {
    let config_path = std::path::PathBuf::from(&path).join(".vnode.json");
    if !config_path.exists() {
        return Ok(AtmosphereConfig {
            theme: "arcane".to_string(),
        });
    }

    let content = tokio::fs::read_to_string(&config_path)
        .await
        .map_err(|error| format!("无法读取配置文件: {}", error))?;
    serde_json::from_str(&content).map_err(|error| format!("无法解析配置文件: {}", error))
}

#[tauri::command]
pub async fn write_atmosphere_config(path: String, config: AtmosphereConfig) -> Result<(), String> {
    let config_path = std::path::PathBuf::from(&path).join(".vnode.json");
    if let Some(parent) = config_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| format!("无法创建目录: {}", error))?;
    }
    let content = serde_json::to_string_pretty(&config).map_err(|error| error.to_string())?;
    tokio::fs::write(config_path, content)
        .await
        .map_err(|error| format!("无法写入配置文件: {}", error))
}

#[tauri::command]
pub async fn export_master_key_command(app: AppHandle) -> Result<String, String> {
    export_master_key(&app)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn import_master_key_command(app: AppHandle, key_base64: String) -> Result<(), String> {
    import_master_key(&app, &key_base64)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_commit_history_command(_path: String, _limit: Option<usize>) -> Result<Vec<serde_json::Value>, String> {
    Ok(Vec::new())
}

#[tauri::command]
pub fn begin_sync(_path: String, _remote_name: String, _branch_name: String, _pat_token: Option<String>) -> Result<SyncResult, String> {
    Ok(SyncResult {
        success: false,
        message: "Git 同步已从主线移除，请在设置页配置 Supabase".to_string(),
        conflict: None,
    })
}

#[tauri::command]
pub fn continue_sync_command(_path: String, _branch_name: String) -> Result<SyncResult, String> {
    Ok(SyncResult {
        success: false,
        message: "当前主线不再支持 Git rebase 流程".to_string(),
        conflict: None,
    })
}

#[tauri::command]
pub fn abort_sync_command(_path: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn resolve_conflict_command(_path: String, _items: Vec<ConflictResolutionItem>) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn save_export_file(filename: String, content: Vec<u8>, file_type: String) -> Result<String, String> {
    save_export_bytes(&filename, &content, &file_type)
}

#[tauri::command]
pub async fn export_pdf_with_typst(filename: String, typst_source: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let pdf_bytes = compile_typst_source_to_pdf(&typst_source)
            .map_err(|error| error.to_string())?;
        save_export_bytes(&filename, &pdf_bytes, "pdf")
    })
    .await
    .map_err(|error| format!("PDF 导出任务执行失败: {}", error))?
}

fn save_export_bytes(filename: &str, content: &[u8], file_type: &str) -> Result<String, String> {
    let docs_dir = dirs::document_dir().ok_or_else(|| "无法获取 Documents 目录".to_string())?;
    let vana_dir = docs_dir.join("vana");
    std::fs::create_dir_all(&vana_dir).map_err(|error| format!("创建 vana 目录失败: {}", error))?;

    let mut final_path = vana_dir.join(format!("{}.{}", filename, file_type));
    let mut counter = 1;
    while final_path.exists() {
        final_path = vana_dir.join(format!("{}({}).{}", filename, counter, file_type));
        counter += 1;
    }

    std::fs::write(&final_path, content).map_err(|error| format!("保存文件失败: {}", error))?;
    Ok(final_path.to_string_lossy().to_string())
}
