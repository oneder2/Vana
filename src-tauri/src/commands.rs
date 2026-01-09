// No Visitors - Tauri 命令定义
// 将所有 Rust 功能暴露给前端 JavaScript/TypeScript
// 每个命令都对应一个可以被前端调用的函数

use crate::git::{commit_changes, get_repository_status, git_gc, init_repository};
use crate::storage::{
    create_directory, create_file, delete_directory, delete_file, list_directory,
    read_encrypted_file, rename_file_or_directory, write_encrypted_file, FileInfo,
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
        // 返回默认配置
        return Ok(WorkspaceConfig {
            commit_scope: "workspace".to_string(),
            auto_commit_interval: 15,
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

