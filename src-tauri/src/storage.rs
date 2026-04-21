// No Visitors - 文件系统操作模块
// 负责加密文件的读写操作
// 所有文件都以 .enc 扩展名存储，内容使用 AES-256-GCM 加密

use crate::crypto::{decrypt_content, encrypt_content};
use crate::keychain::get_or_create_master_key;
use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tokio::fs;

/// 读取并解密文件内容
/// 
/// # 参数
/// - `path`: 文件路径（.enc 文件）
/// - `app`: Tauri 应用句柄，用于获取密钥
/// 
/// # 返回
/// 返回解密后的文件内容
pub async fn read_encrypted_file(path: &str, app: &AppHandle) -> Result<String> {
    // 确保路径以 .enc 结尾
    let file_path = if path.ends_with(".enc") {
        PathBuf::from(path)
    } else {
        PathBuf::from(format!("{}.enc", path))
    };

    // 读取加密文件
    let ciphertext = fs::read(&file_path)
        .await
        .with_context(|| format!("无法读取文件: {}", file_path.display()))?;

    // 获取主密钥（使用异步版本，因为我们在异步上下文中）
    let master_key = get_or_create_master_key(app)
        .await
        .context("无法获取主加密密钥")?;

    // 解密内容
    decrypt_content(&ciphertext, &master_key)
        .with_context(|| format!("无法解密文件: {}", file_path.display()))
}

/// 加密并写入文件内容
/// 
/// # 参数
/// - `path`: 文件路径（会自动添加 .enc 扩展名）
/// - `content`: 要写入的明文内容
/// - `app`: Tauri 应用句柄，用于获取密钥
/// 
/// # 返回
/// 成功时返回 Ok(())
pub async fn write_encrypted_file(
    path: &str,
    content: &str,
    app: &AppHandle,
) -> Result<()> {
    // 确保路径以 .enc 结尾
    let file_path = if path.ends_with(".enc") {
        PathBuf::from(path)
    } else {
        PathBuf::from(format!("{}.enc", path))
    };

    // 获取主密钥（使用异步版本，因为我们在异步上下文中）
    let master_key = get_or_create_master_key(app)
        .await
        .context("无法获取主加密密钥")?;

    // 加密内容
    let ciphertext = encrypt_content(content, &master_key)
        .context("加密内容失败")?;

    // 确保目录存在
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent)
            .await
            .with_context(|| format!("无法创建目录: {}", parent.display()))?;
    }

    // 写入加密文件
    fs::write(&file_path, &ciphertext)
        .await
        .with_context(|| format!("无法写入文件: {}", file_path.display()))?;

    Ok(())
}

/// 列出目录中的文件和文件夹
/// 
/// # 参数
/// - `path`: 目录路径
/// 
/// # 返回
/// 返回文件信息列表
pub async fn list_directory(path: &str) -> Result<Vec<FileInfo>> {
    let dir_path = Path::new(path);

    if !dir_path.exists() {
        return Ok(Vec::new());
    }

    if !dir_path.is_dir() {
        anyhow::bail!("路径不是目录: {}", path);
    }

    let mut entries = Vec::new();
    let mut dir = fs::read_dir(dir_path)
        .await
        .with_context(|| format!("无法读取目录: {}", path))?;

    while let Some(entry) = dir.next_entry().await? {
        let path = entry.path();
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        // 跳过隐藏文件和 .git 目录
        if name.starts_with('.') {
            continue;
        }

        let metadata = entry.metadata().await?;
        let is_dir = metadata.is_dir();
        let is_file = metadata.is_file();

        entries.push(FileInfo {
            name,
            path: path.to_string_lossy().to_string(),
            is_directory: is_dir,
            is_file,
        });
    }

    // 排序：目录在前，然后按名称排序
    entries.sort_by(|a, b| {
        match (a.is_directory, b.is_directory) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.cmp(&b.name),
        }
    });

    Ok(entries)
}

/// 创建新文件
/// 
/// # 参数
/// - `path`: 文件路径（会自动添加 .enc 扩展名）
/// - `content`: 初始内容（可选）
/// - `app`: Tauri 应用句柄，用于加密
/// 
/// # 返回
/// 成功时返回 Ok(())
pub async fn create_file(
    path: &str,
    content: &str,
    app: &AppHandle,
) -> Result<()> {
    // 确保路径以 .enc 结尾
    let file_path = if path.ends_with(".enc") {
        PathBuf::from(path)
    } else {
        PathBuf::from(format!("{}.enc", path))
    };

    // 如果文件已存在，返回错误
    if file_path.exists() {
        anyhow::bail!("文件已存在: {}", file_path.display());
    }

    // 确保父目录存在
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent)
            .await
            .with_context(|| format!("无法创建目录: {}", parent.display()))?;
    }

    // 加密并写入内容
    write_encrypted_file(path, content, app).await
}

/// 创建新目录
/// 
/// # 参数
/// - `path`: 目录路径
/// 
/// # 返回
/// 成功时返回 Ok(())
pub async fn create_directory(path: &str) -> Result<()> {
    let dir_path = Path::new(path);
    
    if dir_path.exists() {
        anyhow::bail!("目录已存在: {}", path);
    }

    fs::create_dir_all(dir_path)
        .await
        .with_context(|| format!("无法创建目录: {}", path))?;

    Ok(())
}

/// 删除文件
/// 
/// # 参数
/// - `path`: 文件路径
/// 
/// # 返回
/// 成功时返回 Ok(())
pub async fn delete_file(path: &str) -> Result<()> {
    let file_path = Path::new(path);
    
    if !file_path.exists() {
        anyhow::bail!("文件不存在: {}", path);
    }

    fs::remove_file(file_path)
        .await
        .with_context(|| format!("无法删除文件: {}", path))?;

    Ok(())
}

/// 删除目录
/// 
/// # 参数
/// - `path`: 目录路径
/// 
/// # 返回
/// 成功时返回 Ok(())
pub async fn delete_directory(path: &str) -> Result<()> {
    let dir_path = Path::new(path);
    
    if !dir_path.exists() {
        anyhow::bail!("目录不存在: {}", path);
    }

    fs::remove_dir_all(dir_path)
        .await
        .with_context(|| format!("无法删除目录: {}", path))?;

    Ok(())
}

/// 重命名文件或目录
/// 
/// # 参数
/// - `old_path`: 旧路径
/// - `new_path`: 新路径
/// 
/// # 返回
/// 成功时返回 Ok(())
pub async fn rename_file_or_directory(old_path: &str, new_path: &str) -> Result<()> {
    let old = Path::new(old_path);
    let new = Path::new(new_path);
    
    if !old.exists() {
        anyhow::bail!("文件或目录不存在: {}", old_path);
    }

    if new.exists() {
        anyhow::bail!("目标路径已存在: {}", new_path);
    }

    // 确保新路径的父目录存在
    if let Some(parent) = new.parent() {
        fs::create_dir_all(parent)
            .await
            .with_context(|| format!("无法创建目录: {}", parent.display()))?;
    }

    fs::rename(old, new)
        .await
        .with_context(|| format!("无法重命名: {} -> {}", old_path, new_path))?;

    Ok(())
}

/// 复制文件或目录
/// 
/// # 参数
/// - `source_path`: 源路径
/// - `dest_path`: 目标路径
/// 
/// # 返回
/// 成功时返回 Ok(())
pub async fn copy_file_or_directory(source_path: &str, dest_path: &str) -> Result<()> {
    let source = Path::new(source_path);
    let dest = Path::new(dest_path);
    
    if !source.exists() {
        anyhow::bail!("源文件或目录不存在: {}", source_path);
    }

    if dest.exists() {
        anyhow::bail!("目标路径已存在: {}", dest_path);
    }

    // 确保目标路径的父目录存在
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)
            .await
            .with_context(|| format!("无法创建目录: {}", parent.display()))?;
    }

    if source.is_dir() {
        // 复制目录（递归）
        copy_dir_all(source, dest)
            .await
            .with_context(|| format!("无法复制目录: {} -> {}", source_path, dest_path))?;
    } else {
        // 复制文件
        fs::copy(source, dest)
            .await
            .with_context(|| format!("无法复制文件: {} -> {}", source_path, dest_path))?;
    }

    Ok(())
}

/// 递归复制目录
fn copy_dir_all<'a>(source: &'a Path, dest: &'a Path) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send + 'a>> {
    Box::pin(async move {
        fs::create_dir_all(dest)
            .await
            .with_context(|| format!("无法创建目标目录: {}", dest.display()))?;

        let mut entries = fs::read_dir(source)
            .await
            .with_context(|| format!("无法读取源目录: {}", source.display()))?;

        while let Some(entry) = entries.next_entry().await? {
            let entry_path = entry.path();
            let dest_path = dest.join(entry.file_name());

            let metadata = entry.metadata().await?;
            if metadata.is_dir() {
                copy_dir_all(&entry_path, &dest_path).await?;
            } else {
                let _bytes_copied = fs::copy(&entry_path, &dest_path)
                    .await
                    .with_context(|| format!("无法复制文件: {} -> {}", entry_path.display(), dest_path.display()))?;
            }
        }

        Ok(())
    })
}

/// 移动文件或目录
/// 
/// # 参数
/// - `source_path`: 源路径
/// - `dest_path`: 目标路径
/// 
/// # 返回
/// 成功时返回 Ok(())
pub async fn move_file_or_directory(source_path: &str, dest_path: &str) -> Result<()> {
    // 移动操作实际上就是重命名，但需要确保目标路径的父目录存在
    let source = Path::new(source_path);
    let dest = Path::new(dest_path);
    
    if !source.exists() {
        anyhow::bail!("源文件或目录不存在: {}", source_path);
    }

    // 检查目标路径是否已存在
    if dest.exists() {
        anyhow::bail!("目标路径已存在: {}", dest_path);
    }

    // 规范化源路径（解析相对路径和符号链接）
    let source_canonical = source.canonicalize()
        .with_context(|| format!("无法解析源路径: {}", source_path))?;

    // 防止将目录移动到其自身或子目录中
    // 检查目标路径的父目录是否是源路径的子目录
    if let Some(dest_parent) = dest.parent() {
        if let Ok(dest_parent_canonical) = dest_parent.canonicalize() {
            // 如果目标路径的父目录是源路径的子目录，则不允许
            if dest_parent_canonical.starts_with(&source_canonical) && dest_parent_canonical != source_canonical {
                anyhow::bail!("不能将目录移动到其自身或子目录中");
            }
        }
    }

    // 确保目标路径的父目录存在
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)
            .await
            .with_context(|| format!("无法创建目录: {}", parent.display()))?;
    }

    // 使用规范化的源路径进行移动
    fs::rename(&source_canonical, dest)
        .await
        .with_context(|| format!("无法移动: {} -> {}", source_path, dest_path))?;

    Ok(())
}

/// 文件信息结构
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub is_file: bool,
}

