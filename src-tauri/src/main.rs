// No Visitors - Git-based Arcane Archive
// Tauri 应用入口文件
// 负责初始化 Tauri 应用并注册所有命令

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]


mod commands;
mod crypto;
mod git;
mod keychain;
mod storage;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            // 平台和工作区命令
            commands::get_platform,
            commands::get_workspace_path,
            commands::ensure_workspace_initialized,
            commands::read_workspace_config,
            commands::write_workspace_config,
            // 文件系统命令
            commands::read_file,
            commands::write_file,
            commands::list_directory_command,
            commands::create_file_command,
            commands::create_directory_command,
            commands::delete_file_command,
            commands::delete_directory_command,
            commands::rename_file_or_directory_command,
            // Git 命令
            commands::init_repository_command,
            commands::commit_changes_command,
            commands::get_repository_status_command,
            commands::git_gc_command,
            // 氛围协议命令
            commands::read_atmosphere_config,
            commands::write_atmosphere_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
