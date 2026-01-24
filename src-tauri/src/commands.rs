// No Visitors - Tauri 命令定义
// 将所有 Rust 功能暴露给前端 JavaScript/TypeScript
// 每个命令都对应一个可以被前端调用的函数

use crate::git::{
    abort_sync, commit_changes, continue_sync, get_commit_history, get_current_branch,
    get_repository_status, git_gc, init_repository, resolve_conflict, switch_to_branch,
    verify_repository, ConflictResolutionItem, SyncResult,
};
use crate::keychain::{store_pat_token, get_pat_token, remove_pat_token, has_pat_token};
use crate::storage::{
    copy_file_or_directory, create_directory, create_file, delete_directory, delete_file, list_directory,
    move_file_or_directory, read_encrypted_file, rename_file_or_directory, write_encrypted_file, FileInfo,
    search_files, SearchResult,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// 读取加密文件
/// 
/// 前端调用: `invoke('read_file', { path: '...' })`
#[tauri::command]
pub async fn read_file(path: String, app: AppHandle) -> Result<String, String> {
    read_encrypted_file(&path, &app)
        .await
        .map_err(|e| e.to_string())
}

/// 写入加密文件
/// 
/// 前端调用: `invoke('write_file', { path: '...', content: '...' })`
#[tauri::command]
pub async fn write_file(
    path: String,
    content: String,
    app: AppHandle,
) -> Result<(), String> {
    write_encrypted_file(&path, &content, &app)
        .await
        .map_err(|e| e.to_string())
}

/// 列出目录内容
/// 
/// 前端调用: `invoke('list_directory', { path: '...' })`
#[tauri::command]
pub async fn list_directory_command(path: String) -> Result<Vec<FileInfo>, String> {
    list_directory(&path)
        .await
        .map_err(|e| e.to_string())
}

/// 初始化 Git 仓库
/// 
/// 前端调用: `invoke('init_repository', { path: '...' })`
#[tauri::command]
pub fn init_repository_command(path: String) -> Result<(), String> {
    init_repository(PathBuf::from(path).as_path())
        .map_err(|e| e.to_string())
}

/// 提交更改
/// 
/// 前端调用: `invoke('commit_changes', { path: '...', message: '...' })`
#[tauri::command]
pub fn commit_changes_command(path: String, message: String) -> Result<String, String> {
    commit_changes(PathBuf::from(path).as_path(), &message)
        .map_err(|e| e.to_string())
}

/// 获取仓库状态
/// 
/// 前端调用: `invoke('get_repository_status', { path: '...' })`
#[tauri::command]
pub fn get_repository_status_command(path: String) -> Result<crate::git::GitStatus, String> {
    get_repository_status(PathBuf::from(path).as_path())
        .map_err(|e| e.to_string())
}

/// 执行 Git GC
/// 
/// 前端调用: `invoke('git_gc', { path: '...' })`
#[tauri::command]
pub fn git_gc_command(path: String) -> Result<(), String> {
    git_gc(PathBuf::from(path).as_path())
        .map_err(|e| e.to_string())
}

/// 验证 Git 仓库
/// 
/// 前端调用: `invoke('verify_repository', { path: '...' })`
#[tauri::command]
pub fn verify_repository_command(path: String) -> Result<crate::git::RepositoryVerification, String> {
    verify_repository(PathBuf::from(path).as_path())
        .map_err(|e| e.to_string())
}

/// 获取提交历史
/// 
/// 前端调用: `invoke('get_commit_history', { path: '...', limit: 10 })`
#[tauri::command]
pub fn get_commit_history_command(path: String, limit: Option<usize>) -> Result<Vec<crate::git::CommitInfo>, String> {
    get_commit_history(PathBuf::from(path).as_path(), limit)
        .map_err(|e| e.to_string())
}

/// 读取氛围协议配置
/// 
/// 前端调用: `invoke('read_atmosphere_config', { path: '...' })`
#[tauri::command]
pub async fn read_atmosphere_config(path: String, _app: AppHandle) -> Result<AtmosphereConfig, String> {
    // .vnode.json 文件是未加密的 JSON 文件
    let config_path = PathBuf::from(&path).join(".vnode.json");
    
    if !config_path.exists() {
        return Ok(AtmosphereConfig {
            theme: "arcane".to_string(),
        });
    }

    let content = tokio::fs::read_to_string(&config_path)
        .await
        .map_err(|e| format!("无法读取配置文件: {}", e))?;

    let config: AtmosphereConfig = serde_json::from_str(&content)
        .map_err(|e| format!("无法解析配置文件: {}", e))?;

    Ok(config)
}

/// 写入氛围协议配置
/// 
/// 前端调用: `invoke('write_atmosphere_config', { path: '...', config: {...} })`
#[tauri::command]
pub async fn write_atmosphere_config(
    path: String,
    config: AtmosphereConfig,
) -> Result<(), String> {
    let config_path = PathBuf::from(&path).join(".vnode.json");

    // 确保目录存在
    if let Some(parent) = config_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("无法创建目录: {}", e))?;
    }

    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("无法序列化配置: {}", e))?;

    tokio::fs::write(&config_path, content)
        .await
        .map_err(|e| format!("无法写入配置文件: {}", e))?;

    Ok(())
}

/// 氛围协议配置结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AtmosphereConfig {
    pub theme: String,
}

/// 工作区配置结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceConfig {
    pub commit_scope: String, // "workspace" | "directory"
    pub auto_commit_interval: u64, // 分钟数
}

/// 获取平台信息
/// 
/// 前端调用: `invoke('get_platform')`
#[tauri::command]
pub fn get_platform() -> Result<String, String> {
    let platform = std::env::consts::OS;
    match platform {
        "windows" => Ok("windows".to_string()),
        "linux" => Ok("linux".to_string()),
        "android" => Ok("android".to_string()),
        _ => Err(format!("不支持的平台: {}", platform)),
    }
}

/// 获取工作区路径
/// 
/// 前端调用: `invoke('get_workspace_path')`
#[tauri::command]
pub fn get_workspace_path(app: AppHandle) -> Result<String, String> {
    let platform = std::env::consts::OS;
    let base_path = match platform {
        "windows" => {
            std::env::var("APPDATA")
                .map(|p| PathBuf::from(p).join("No Visitors"))
                .map_err(|e| format!("无法获取 APPDATA: {}", e))?
        }
        "linux" => {
            dirs::home_dir()
                .ok_or_else(|| "无法获取用户主目录".to_string())?
                .join(".local/share/No Visitors")
        }
        "android" => {
            // Android 使用 Tauri 的 app_data_dir
            app.path()
                .app_data_dir()
                .map_err(|e| format!("无法获取应用数据目录: {}", e))?
                .join("No Visitors")
        }
        _ => return Err(format!("不支持的平台: {}", platform)),
    };
    
    let workspace_path = base_path.join("workspace");
    Ok(workspace_path.to_string_lossy().to_string())
}

/// 确保工作区已初始化
/// 
/// 前端调用: `invoke('ensure_workspace_initialized')`
#[tauri::command]
pub async fn ensure_workspace_initialized(app: AppHandle) -> Result<(), String> {
    let workspace_path = get_workspace_path(app.clone())?;
    let workspace = PathBuf::from(&workspace_path);
    
    // 创建工作区目录（如果不存在）
    if !workspace.exists() {
        tokio::fs::create_dir_all(&workspace)
            .await
            .map_err(|e| format!("无法创建工作区目录: {}", e))?;
    }
    
    // 检查并初始化 Git 仓库
    let git_dir = workspace.join(".git");
    if !git_dir.exists() {
        init_repository(workspace.as_path())
            .map_err(|e| format!("无法初始化 Git 仓库: {}", e))?;
    }
    
    // 创建 .config 目录
    let config_dir = workspace.join(".config");
    if !config_dir.exists() {
        tokio::fs::create_dir_all(&config_dir)
            .await
            .map_err(|e| format!("无法创建配置目录: {}", e))?;
    }
    
    // 创建默认配置文件（如果不存在）
    let config_file = config_dir.join("settings.json");
    if !config_file.exists() {
        let default_config = WorkspaceConfig {
            commit_scope: "workspace".to_string(),
            auto_commit_interval: 15,
        };
        let content = serde_json::to_string_pretty(&default_config)
            .map_err(|e| format!("无法序列化配置: {}", e))?;
        tokio::fs::write(&config_file, content)
            .await
            .map_err(|e| format!("无法写入配置文件: {}", e))?;
    }
    
    Ok(())
}

/// 读取工作区配置
/// 
/// 前端调用: `invoke('read_workspace_config')`
#[tauri::command]
pub async fn read_workspace_config(app: AppHandle) -> Result<WorkspaceConfig, String> {
    let workspace_path = get_workspace_path(app)?;
    let config_file = PathBuf::from(&workspace_path).join(".config/settings.json");
    
    if !config_file.exists() {
        // 返回默认配置（根据 Sync Protocol.md，默认 10 分钟）
        return Ok(WorkspaceConfig {
            commit_scope: "workspace".to_string(),
            auto_commit_interval: 10,
        });
    }
    
    let content = tokio::fs::read_to_string(&config_file)
        .await
        .map_err(|e| format!("无法读取配置文件: {}", e))?;
    
    let config: WorkspaceConfig = serde_json::from_str(&content)
        .map_err(|e| format!("无法解析配置文件: {}", e))?;
    
    Ok(config)
}

/// 写入工作区配置
/// 
/// 前端调用: `invoke('write_workspace_config', { config: {...} })`
#[tauri::command]
pub async fn write_workspace_config(
    app: AppHandle,
    config: WorkspaceConfig,
) -> Result<(), String> {
    let workspace_path = get_workspace_path(app)?;
    let config_file = PathBuf::from(&workspace_path).join(".config/settings.json");
    
    // 确保 .config 目录存在
    if let Some(parent) = config_file.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("无法创建配置目录: {}", e))?;
    }
    
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("无法序列化配置: {}", e))?;
    
    tokio::fs::write(&config_file, content)
        .await
        .map_err(|e| format!("无法写入配置文件: {}", e))?;
    
    Ok(())
}

/// 创建新文件
/// 
/// 前端调用: `invoke('create_file', { path: '...', content: '...' })`
#[tauri::command]
pub async fn create_file_command(
    path: String,
    content: String,
    app: AppHandle,
) -> Result<(), String> {
    create_file(&path, &content, &app)
        .await
        .map_err(|e| e.to_string())
}

/// 创建新目录
/// 
/// 前端调用: `invoke('create_directory', { path: '...' })`
#[tauri::command]
pub async fn create_directory_command(path: String) -> Result<(), String> {
    create_directory(&path).await.map_err(|e| e.to_string())
}

/// 删除文件
/// 
/// 前端调用: `invoke('delete_file', { path: '...' })`
#[tauri::command]
pub async fn delete_file_command(path: String) -> Result<(), String> {
    delete_file(&path).await.map_err(|e| e.to_string())
}

/// 删除目录
/// 
/// 前端调用: `invoke('delete_directory', { path: '...' })`
#[tauri::command]
pub async fn delete_directory_command(path: String) -> Result<(), String> {
    delete_directory(&path).await.map_err(|e| e.to_string())
}

/// 删除文件并同步到 Git（原子操作）
/// 
/// 此命令会：
/// 1. 执行文件删除
/// 2. 执行 git add -A（自动处理删除）
/// 3. 执行 git commit
/// 4. 执行 git push（如果配置了远程仓库和 PAT）
/// 
/// 前端调用: `invoke('delete_file_with_git_sync', { workspacePath: '...', path: '...', remoteName: 'origin', branchName: 'main', patToken: '...' })`
#[tauri::command]
pub async fn delete_file_with_git_sync_command(
    workspace_path: String,
    path: String,
    remote_name: String,
    branch_name: String,
    pat_token: Option<String>,
    _app: AppHandle,
) -> Result<(), String> {
    use crate::git::commit_changes;
    use std::path::Path;
    
    let repo_path = Path::new(&workspace_path);
    
    // 步骤 1: 执行文件删除
    eprintln!("[delete_file_with_git_sync] 步骤 1: 执行文件删除");
    delete_file(&path)
        .await
        .map_err(|e| format!("删除失败: {}", e))?;
    
    // 步骤 2: 使用 git2-rs API 更新索引（自动处理删除）
    // 索引更新将在 commit_changes 中自动处理
    eprintln!("[delete_file_with_git_sync] 步骤 2: 使用 git2-rs API 更新索引（在 commit 中处理）");
    
    // 步骤 3: 执行 git commit（commit_changes 会自动处理索引更新）
    eprintln!("[delete_file_with_git_sync] 步骤 3: 执行 git commit");
    let commit_message = format!("delete: {}", path);
    commit_changes(repo_path, &commit_message)
        .map_err(|e| format!("git commit 失败: {}", e))?;
    
    // 步骤 4: 如果配置了远程仓库和 PAT，执行完整同步（包含 squash 和 push）
    // 重要：本地删除 + commit 成功后，应视为"删除成功"（Local-first）。
    // 同步失败不应回滚/不应让前端认为删除失败，否则会造成 UI 与文件系统状态不一致。
    // 
    // 注意：删除/重命名操作后立即同步可能导致 fast-forward 覆盖工作区。
    // 因此这里只执行 push（如果本地领先），不执行 fetch/rebase，避免覆盖刚删除/重命名的文件。
    if let Some(ref token) = pat_token {
        eprintln!("[delete_file_with_git_sync] 步骤 4: 尝试 push（不执行 fetch/rebase，避免覆盖工作区）");
        // 只 push，不 fetch/rebase，避免 fast-forward 覆盖刚删除的文件
        match crate::git::push_to_remote(repo_path, &remote_name, &branch_name, Some(token.as_str())) {
            Ok(_) => {
                eprintln!("[delete_file_with_git_sync] push 成功");
        }
            Err(e) => {
                eprintln!("[delete_file_with_git_sync] 警告：push 失败（不影响本地删除完成）: {}", e);
                eprintln!("[delete_file_with_git_sync] 建议：稍后手动同步或下次启动自动同步");
            }
        }
    }
    
    eprintln!("[delete_file_with_git_sync] 完成：删除和 Git 同步成功");
    Ok(())
}

/// 删除目录并同步到 Git（原子操作）
/// 
/// 此命令会：
/// 1. 执行目录删除
/// 2. 执行 git add -A（自动处理删除）
/// 3. 执行 git commit
/// 4. 执行 git push（如果配置了远程仓库和 PAT）
/// 
/// 前端调用: `invoke('delete_directory_with_git_sync', { workspacePath: '...', path: '...', remoteName: 'origin', branchName: 'main', patToken: '...' })`
#[tauri::command]
pub async fn delete_directory_with_git_sync_command(
    workspace_path: String,
    path: String,
    remote_name: String,
    branch_name: String,
    pat_token: Option<String>,
    _app: AppHandle,
) -> Result<(), String> {
    use crate::git::commit_changes;
    use std::path::Path;
    
    let repo_path = Path::new(&workspace_path);
    
    // 步骤 1: 执行目录删除
    eprintln!("[delete_directory_with_git_sync] 步骤 1: 执行目录删除");
    delete_directory(&path)
        .await
        .map_err(|e| format!("删除失败: {}", e))?;
    
    // 步骤 2: 执行 git add -A（自动处理删除）
    // 步骤 2: 使用 git2-rs API 更新索引（自动处理删除）
    // 索引更新将在 commit_changes 中自动处理
    eprintln!("[delete_directory_with_git_sync] 步骤 2: 使用 git2-rs API 更新索引（在 commit 中处理）");
    
    // 步骤 3: 执行 git commit（commit_changes 会自动处理索引更新）
    eprintln!("[delete_directory_with_git_sync] 步骤 3: 执行 git commit");
    let commit_message = format!("delete: {}", path);
    commit_changes(repo_path, &commit_message)
        .map_err(|e| format!("git commit 失败: {}", e))?;
    
    // 步骤 4: 如果配置了远程仓库和 PAT，执行完整同步（包含 squash 和 push）
    // 重要：本地删除 + commit 成功后，应视为"删除成功"（Local-first）。
    // 同步失败不应回滚/不应让前端认为删除失败，否则会造成 UI 与文件系统状态不一致。
    //
    // 注意：删除/重命名操作后立即同步可能导致 fast-forward 覆盖工作区。
    // 因此这里只执行 push（如果本地领先），不执行 fetch/rebase，避免覆盖刚删除/重命名的文件。
    if let Some(ref token) = pat_token {
        eprintln!("[delete_directory_with_git_sync] 步骤 4: 尝试 push（不执行 fetch/rebase，避免覆盖工作区）");
        // 只 push，不 fetch/rebase，避免 fast-forward 覆盖刚删除的目录
        match crate::git::push_to_remote(repo_path, &remote_name, &branch_name, Some(token.as_str())) {
            Ok(_) => {
                eprintln!("[delete_directory_with_git_sync] push 成功");
        }
            Err(e) => {
                eprintln!("[delete_directory_with_git_sync] 警告：push 失败（不影响本地删除完成）: {}", e);
                eprintln!("[delete_directory_with_git_sync] 建议：稍后手动同步或下次启动自动同步");
            }
        }
    }
    
    eprintln!("[delete_directory_with_git_sync] 完成：删除和 Git 同步成功");
    Ok(())
}

/// 重命名文件或目录
/// 
/// 前端调用: `invoke('rename_file_or_directory', { oldPath: '...', newPath: '...' })`
#[tauri::command]
pub async fn rename_file_or_directory_command(
    old_path: String,
    new_path: String,
) -> Result<(), String> {
    rename_file_or_directory(&old_path, &new_path)
        .await
        .map_err(|e| e.to_string())
}

/// 重命名文件或目录并同步到 Git（原子操作）
/// 
/// 此命令会：
/// 1. 执行文件重命名
/// 2. 执行 git add -A（自动删除旧索引、添加新索引）
/// 3. 执行 git commit
/// 4. 执行 git push（如果配置了远程仓库和 PAT）
/// 
/// 前端调用: `invoke('rename_file_with_git_sync', { workspacePath: '...', oldPath: '...', newPath: '...', remoteName: 'origin', branchName: 'main', patToken: '...' })`
#[tauri::command]
pub async fn rename_file_with_git_sync_command(
    workspace_path: String,
    old_path: String,
    new_path: String,
    remote_name: String,
    branch_name: String,
    pat_token: Option<String>,
    _app: AppHandle,
) -> Result<(), String> {
    use crate::git::commit_changes;
    use std::path::Path;
    
    let repo_path = Path::new(&workspace_path);
    
    // 步骤 1: 执行重命名
    eprintln!("[rename_file_with_git_sync] 步骤 1: 执行文件重命名");
    rename_file_or_directory(&old_path, &new_path)
        .await
        .map_err(|e| format!("重命名失败: {}", e))?;
    
    // 步骤 2: 使用 git2-rs API 更新索引（自动处理删除旧索引、添加新索引）
    eprintln!("[rename_file_with_git_sync] 步骤 2: 使用 git2-rs API 更新索引");
    // 索引更新将在 commit_changes 中自动处理
    
    // 步骤 3: 执行 git commit
    eprintln!("[rename_file_with_git_sync] 步骤 3: 执行 git commit");
    let commit_message = format!("rename: {} -> {}", old_path, new_path);
    commit_changes(repo_path, &commit_message)
        .map_err(|e| format!("git commit 失败: {}", e))?;
    
    // 步骤 4: 如果配置了远程仓库和 PAT，执行完整同步（包含 squash 和 push）
    // 重要：本地重命名 + commit 成功后，应视为"重命名成功"（Local-first）。
    // 同步失败不应回滚/不应让前端认为重命名失败，否则会出现"文件已改名但 UI 仍认为失败 -> 下次用旧路径报不存在"。
    //
    // 注意：删除/重命名操作后立即同步可能导致 fast-forward 覆盖工作区。
    // 因此这里只执行 push（如果本地领先），不执行 fetch/rebase，避免覆盖刚删除/重命名的文件。
    if let Some(ref token) = pat_token {
        eprintln!("[rename_file_with_git_sync] 步骤 4: 尝试 push（不执行 fetch/rebase，避免覆盖工作区）");
        // 只 push，不 fetch/rebase，避免 fast-forward 覆盖刚重命名的文件
        match crate::git::push_to_remote(repo_path, &remote_name, &branch_name, Some(token.as_str())) {
            Ok(_) => {
                eprintln!("[rename_file_with_git_sync] push 成功");
        }
            Err(e) => {
                eprintln!("[rename_file_with_git_sync] 警告：push 失败（不影响本地重命名完成）: {}", e);
                eprintln!("[rename_file_with_git_sync] 建议：刷新文件列表并稍后手动同步");
            }
        }
    }
    
    eprintln!("[rename_file_with_git_sync] 完成：重命名和 Git 同步成功");
    Ok(())
}

/// 复制文件或目录
/// 
/// 前端调用: `invoke('copy_file_or_directory', { sourcePath: '...', destPath: '...' })`
#[tauri::command]
pub async fn copy_file_or_directory_command(
    source_path: String,
    dest_path: String,
) -> Result<(), String> {
    copy_file_or_directory(&source_path, &dest_path)
        .await
        .map_err(|e| e.to_string())
}

/// 移动文件或目录
/// 
/// 前端调用: `invoke('move_file_or_directory', { sourcePath: '...', destPath: '...' })`
#[tauri::command]
pub async fn move_file_or_directory_command(
    source_path: String,
    dest_path: String,
) -> Result<(), String> {
    move_file_or_directory(&source_path, &dest_path)
        .await
        .map_err(|e| e.to_string())
}

/// 存储 GitHub PAT Token
/// 
/// 前端调用: `invoke('store_pat', { token: '...' })`
#[tauri::command]
pub async fn store_pat(app: AppHandle, token: String) -> Result<(), String> {
    store_pat_token(&app, &token)
        .await
        .map_err(|e| e.to_string())
}

/// 获取 GitHub PAT Token
/// 
/// 前端调用: `invoke('get_pat')`
#[tauri::command]
pub async fn get_pat(app: AppHandle) -> Result<Option<String>, String> {
    get_pat_token(&app)
        .await
        .map_err(|e| e.to_string())
}

/// 删除 GitHub PAT Token
/// 
/// 前端调用: `invoke('remove_pat')`
#[tauri::command]
pub async fn remove_pat(app: AppHandle) -> Result<(), String> {
    remove_pat_token(&app)
        .await
        .map_err(|e| e.to_string())
}

/// 检查是否已配置 GitHub PAT Token
/// 
/// 前端调用: `invoke('has_pat')`
#[tauri::command]
pub async fn has_pat(app: AppHandle) -> Result<bool, String> {
    has_pat_token(&app)
        .await
        .map_err(|e| e.to_string())
}

/// 添加远程仓库
/// 
/// 前端调用: `invoke('add_remote', { path: '...', name: 'origin', url: '...' })`
#[tauri::command]
pub fn add_remote(path: String, name: String, url: String) -> Result<(), String> {
    crate::git::add_remote(PathBuf::from(path).as_path(), &name, &url)
        .map_err(|e| e.to_string())
}

/// 获取远程仓库URL
/// 
/// 前端调用: `invoke('get_remote_url', { path: '...', name: 'origin' })`
#[tauri::command]
pub fn get_remote_url(path: String, name: String) -> Result<Option<String>, String> {
    crate::git::get_remote_url(PathBuf::from(path).as_path(), &name)
        .map_err(|e| e.to_string())
}

/// 删除远程仓库配置
/// 
/// 前端调用: `invoke('remove_remote', { path: '...', name: 'origin' })`
#[tauri::command]
pub fn remove_remote(path: String, name: String) -> Result<(), String> {
    crate::git::remove_remote(PathBuf::from(path).as_path(), &name)
        .map_err(|e| e.to_string())
}

/// 从远程仓库获取更新（fetch）
/// 
/// 前端调用: `invoke('fetch_from_remote', { path: '...', remoteName: 'origin', patToken: '...' })`
#[tauri::command]
pub fn fetch_from_remote(path: String, remote_name: String, pat_token: Option<String>) -> Result<(), String> {
    crate::git::fetch_from_remote(
        PathBuf::from(path).as_path(),
        &remote_name,
        pat_token.as_deref(),
    )
    .map_err(|e| e.to_string())
}

/// 推送本地提交到远程仓库（push）
/// 
/// 前端调用: `invoke('push_to_remote', { path: '...', remoteName: 'origin', branchName: 'main', patToken: '...' })`
#[tauri::command]
pub fn push_to_remote(
    path: String,
    remote_name: String,
    branch_name: String,
    pat_token: Option<String>,
) -> Result<(), String> {
    crate::git::push_to_remote(
        PathBuf::from(path).as_path(),
        &remote_name,
        &branch_name,
        pat_token.as_deref(),
    )
    .map_err(|e| e.to_string())
}

/// 同步远程仓库（fetch + rebase/push）
/// 
/// 前端调用: `invoke('sync_with_remote', { path: '...', remoteName: 'origin', branchName: 'main', patToken: '...' })`
#[tauri::command]
pub fn sync_with_remote(
    path: String,
    remote_name: String,
    branch_name: String,
    pat_token: Option<String>,
) -> Result<SyncResult, String> {
    eprintln!("[sync_with_remote] 开始同步: path={}, remote={}, branch={}", path, remote_name, branch_name);
    crate::git::sync_with_remote(
        PathBuf::from(path).as_path(),
        &remote_name,
        &branch_name,
        pat_token.as_deref(),
    )
    .map_err(|e| {
        eprintln!("[sync_with_remote] 同步失败: {}", e);
        e.to_string()
    })
}

/// 启动同步（fetch + fast-forward/rebase），如遇冲突返回结构化冲突信息
/// 
/// 前端调用: `invoke('begin_sync', { path: '...', remoteName: 'origin', branchName: 'main', patToken: '...' })`
#[tauri::command]
pub fn begin_sync(
    path: String,
    remote_name: String,
    branch_name: String,
    pat_token: Option<String>,
) -> Result<SyncResult, String> {
    crate::git::sync_with_remote(
        PathBuf::from(path).as_path(),
        &remote_name,
        &branch_name,
        pat_token.as_deref(),
    )
    .map_err(|e| e.to_string())
}

/// 继续同步（继续进行中的 rebase）
///
/// 前端调用: `invoke('continue_sync', { path: '...', branchName: 'main' })`
#[tauri::command]
pub fn continue_sync_command(path: String, branch_name: String) -> Result<SyncResult, String> {
    continue_sync(PathBuf::from(path).as_path(), &branch_name).map_err(|e| e.to_string())
}

/// 放弃同步（abort 当前 rebase）
///
/// 前端调用: `invoke('abort_sync', { path: '...' })`
#[tauri::command]
pub fn abort_sync_command(path: String) -> Result<(), String> {
    abort_sync(PathBuf::from(path).as_path()).map_err(|e| e.to_string())
}

/// 解决冲突（写入工作区 + stage），随后应调用 `continue_sync`
///
/// 前端调用: `invoke('resolve_conflict', { path: '...', items: [{ path: 'a.md', choice: 'CopyBoth' }] })`
#[tauri::command]
pub fn resolve_conflict_command(path: String, items: Vec<ConflictResolutionItem>) -> Result<(), String> {
    resolve_conflict(PathBuf::from(path).as_path(), items).map_err(|e| e.to_string())
}

/// 获取当前分支名
/// 
/// 前端调用: `invoke('get_current_branch', { path: '...' })`
#[tauri::command]
pub fn get_current_branch_command(path: String) -> Result<String, String> {
    get_current_branch(PathBuf::from(path).as_path())
        .map_err(|e| e.to_string())
}

/// 切换到指定分支
/// 
/// 前端调用: `invoke('switch_to_branch', { path: '...', branch: 'main' })`
#[tauri::command]
pub fn switch_to_branch_command(path: String, branch: String) -> Result<(), String> {
    switch_to_branch(PathBuf::from(path).as_path(), &branch)
        .map_err(|e| e.to_string())
}

/// 搜索文档内容
///
/// 前端调用: `invoke('search_files', { workspacePath: '...', query: '...' })`
#[tauri::command]
pub async fn search_files_command(
    workspace_path: String,
    query: String,
    app: AppHandle,
) -> Result<Vec<SearchResult>, String> {
    search_files(&workspace_path, &query, &app)
        .await
        .map_err(|e| e.to_string())
}

/// 保存导出文件到 Documents/vana 目录
///
/// 前端调用: `invoke('save_export_file', { filename: '...', content: [...], fileType: 'pdf' | 'docx' })`
#[tauri::command]
pub async fn save_export_file(
    filename: String,
    content: Vec<u8>,
    file_type: String,
) -> Result<String, String> {
    use std::fs;

    // 获取 Documents 目录
    let docs_dir = dirs::document_dir()
        .ok_or_else(|| "无法获取 Documents 目录".to_string())?;

    // 创建 vana 子目录
    let vana_dir = docs_dir.join("vana");
    fs::create_dir_all(&vana_dir)
        .map_err(|e| format!("创建 vana 目录失败: {}", e))?;

    // 处理文件名冲突（自动递增）
    let mut final_path = vana_dir.join(format!("{}.{}", filename, file_type));
    let mut counter = 1;
    while final_path.exists() {
        final_path = vana_dir.join(format!("{}({}).{}", filename, counter, file_type));
        counter += 1;
    }

    // 保存文件
    fs::write(&final_path, content)
        .map_err(|e| format!("保存文件失败: {}", e))?;

    // 返回保存的文件路径
    Ok(final_path.to_string_lossy().to_string())
}

