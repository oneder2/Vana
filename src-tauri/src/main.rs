// No Visitors - Git-based Arcane Archive
// Tauri 应用入口文件
// 负责初始化 Tauri 应用并注册所有命令

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod crypto;
mod git;
mod keychain;
mod storage;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager, WindowEvent};
use chrono::Local;

// 防止窗口关闭逻辑重复执行的标志
static IS_CLOSING: AtomicBool = AtomicBool::new(false);

/// 窗口关闭时执行清仓同步（推送本地提交到远程）
async fn handle_window_close(app: AppHandle, label: &str) {
    eprintln!("[窗口关闭] 窗口 '{}' 正在关闭，开始清仓同步检查", label);
    
    // 获取工作区路径
    let workspace_path = match commands::get_workspace_path(app.clone()) {
        Ok(path) => path,
        Err(e) => {
            eprintln!("[窗口关闭] 无法获取工作区路径: {}", e);
            return;
        }
    };
    
    eprintln!("[窗口关闭] 工作区路径: {}", workspace_path);
    
    // 获取远程仓库 URL
    match commands::get_remote_url(workspace_path.clone(), "origin".to_string()) {
        Ok(Some(url)) => {
            eprintln!("[窗口关闭] 远程 URL: {}", url);
        }
        Ok(None) => {
            eprintln!("[窗口关闭] 未配置远程仓库，跳过推送");
            return;
        }
        Err(e) => {
            eprintln!("[窗口关闭] 获取远程 URL 失败: {}", e);
            return;
        }
    };
    
    // 获取 PAT Token
    let pat_token = match commands::get_pat(app.clone()).await {
        Ok(Some(token)) => {
            eprintln!("[窗口关闭] PAT Token 已配置");
            Some(token)
        }
        Ok(None) => {
            eprintln!("[窗口关闭] 未配置 PAT Token，跳过推送");
            return;
        }
        Err(e) => {
            eprintln!("[窗口关闭] 获取 PAT Token 失败: {}", e);
            return;
        }
    };
    
    // 检查是否有未提交的更改，如果有则先提交
    let repo_path = PathBuf::from(&workspace_path);
    match crate::git::get_repository_status(&repo_path) {
        Ok(status) => {
            if status.has_changes {
                eprintln!("[窗口关闭] 检测到未提交的更改，先自动提交...");
                // 使用时间戳作为提交消息
                let commit_message = format!("Auto-commit on app close: {}", Local::now().format("%Y-%m-%d %H:%M:%S"));
                match crate::git::commit_changes(&repo_path, &commit_message) {
                    Ok(commit_sha) => {
                        eprintln!("[窗口关闭] ✅ 自动提交成功: {}", commit_sha);
                    }
                    Err(e) => {
                        eprintln!("[窗口关闭] ⚠️ 自动提交失败: {}", e);
                        // 即使提交失败，也尝试推送已有的提交
                    }
                }
            } else {
                eprintln!("[窗口关闭] 工作区干净，无需提交");
            }
            
            // 无论是否有未提交的更改，都尝试推送本地提交
            eprintln!("[窗口关闭] 尝试推送本地提交到远程...");
            match crate::git::push_to_remote(&repo_path, "origin", "main", pat_token.as_deref()) {
                Ok(_) => {
                    eprintln!("[窗口关闭] ✅ 推送成功");
                }
                Err(e) => {
                    // 如果是因为已经是最新的而失败，这是正常的
                    let error_msg = e.to_string();
                    if error_msg.contains("already up to date") || error_msg.contains("Everything up-to-date") {
                        eprintln!("[窗口关闭] ℹ️ 本地已是最新，无需推送");
                    } else {
                        eprintln!("[窗口关闭] ⚠️ 推送失败（不影响应用关闭）: {}", e);
                    }
                }
            }
        }
        Err(e) => {
            eprintln!("[窗口关闭] ⚠️ 无法获取仓库状态: {}", e);
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // 检查是否已经在关闭流程中，防止重复执行
                if IS_CLOSING.load(Ordering::Acquire) {
                    eprintln!("[窗口关闭] 已在关闭流程中，直接关闭窗口");
                    // 如果已经在关闭流程中，允许直接关闭
                    return;
                }
                
                eprintln!("[窗口关闭] 检测到窗口关闭请求");
                
                // 设置关闭标志，防止重复触发
                IS_CLOSING.store(true, Ordering::Release);
                
                // 阻止立即关闭，等待同步完成
                api.prevent_close();
                
                let app_handle = window.app_handle().clone();
                let window_label = window.label().to_string();
                
                tauri::async_runtime::spawn(async move {
                    handle_window_close(app_handle.clone(), &window_label).await;
                    
                    // 同步完成后，关闭窗口
                    eprintln!("[窗口关闭] 同步完成，准备关闭窗口");
                    
                    // 使用 app.exit() 退出整个应用，避免再次触发 CloseRequested 事件
                    // 这比 window.close() 更安全，因为它直接退出应用进程
                    app_handle.exit(0);
                });
            }
        })
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
            commands::delete_file_with_git_sync_command,
            commands::delete_directory_with_git_sync_command,
            commands::rename_file_or_directory_command,
            commands::rename_file_with_git_sync_command,
            commands::copy_file_or_directory_command,
            commands::move_file_or_directory_command,
            // Git 命令
            commands::init_repository_command,
            commands::commit_changes_command,
            commands::get_repository_status_command,
            commands::git_gc_command,
            commands::verify_repository_command,
            commands::get_commit_history_command,
            // 氛围协议命令
            commands::read_atmosphere_config,
            commands::write_atmosphere_config,
            // PAT 管理命令
            commands::store_pat,
            commands::get_pat,
            commands::remove_pat,
            commands::has_pat,
            // 远程仓库命令
            commands::add_remote,
            commands::get_remote_url,
            commands::remove_remote,
            // 远程同步命令
            commands::fetch_from_remote,
            commands::push_to_remote,
            commands::sync_with_remote,
            commands::begin_sync,
            commands::continue_sync_command,
            commands::abort_sync_command,
            commands::resolve_conflict_command,
            // 分支管理命令
            commands::get_current_branch_command,
            commands::switch_to_branch_command,
            // 搜索命令
            commands::search_files_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
