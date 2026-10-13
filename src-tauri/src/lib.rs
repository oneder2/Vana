#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
mod android_share;
mod commands;
mod crypto;
mod credentials;
mod auth;
mod db;
mod document_content;
mod export_file;
mod keychain;
mod storage;
mod typst_export;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            commands::get_platform,
            commands::get_workspace_path,
            commands::ensure_workspace_initialized,
            commands::get_app_state_command,
            commands::list_documents_command,
            commands::get_document_command,
            commands::create_document_command,
            commands::save_document_command,
            commands::list_document_history_command,
            commands::restore_document_history_command,
            commands::export_space_backup_command,
            commands::preview_space_backup_command,
            commands::import_space_backup_command,
            commands::share_space_backup_command,
            commands::list_attachments_command,
            commands::add_attachment_command,
            commands::remove_attachment_command,
            commands::export_attachment_command,
            commands::list_document_conflicts_command,
            commands::get_document_conflict_command,
            commands::acknowledge_document_conflict_command,
            commands::move_document_command,
            commands::set_document_status_command,
            commands::toggle_favorite_command,
            commands::permanently_delete_document_command,
            commands::recover_local_documents_command,
            commands::list_tags_command,
            commands::upsert_tag_command,
            commands::get_supabase_config_command,
            commands::save_supabase_config_command,
            commands::get_supabase_session_command,
            commands::authenticate_supabase_command,
            commands::refresh_supabase_session_command,
            commands::import_supabase_session_command,
            commands::logout_supabase_command,
            commands::clear_supabase_session_command,
            commands::complete_onboarding_command,
            commands::mark_sync_attempt_command,
            commands::export_sync_documents_command,
            commands::export_document_structures_command,
            commands::export_documents_structured_command,
            commands::apply_remote_documents_command,
            commands::finalize_sync_jobs_command,
            commands::import_legacy_workspace_command,
            commands::read_workspace_config,
            commands::write_workspace_config,
            commands::read_library_metadata,
            commands::write_library_metadata,
            commands::read_file,
            commands::write_file,
            commands::list_directory_command,
            commands::create_file_command,
            commands::create_directory_command,
            commands::delete_file_command,
            commands::delete_directory_command,
            commands::rename_file_or_directory_command,
            commands::copy_file_or_directory_command,
            commands::move_file_or_directory_command,
            commands::search_files_command,
            commands::read_atmosphere_config,
            commands::write_atmosphere_config,
            commands::export_master_key_command,
            commands::import_master_key_command,
            commands::get_commit_history_command,
            commands::begin_sync,
            commands::continue_sync_command,
            commands::abort_sync_command,
            commands::resolve_conflict_command,
            commands::save_export_file,
            commands::share_export_file,
            commands::export_pdf_with_typst,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
