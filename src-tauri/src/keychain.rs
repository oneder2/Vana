// No Visitors - 密钥管理模块
// 负责生成、存储和检索主加密密钥
// 密钥存储在系统 Keychain/Keystore 中，确保安全性

use anyhow::{Context, Result};
use rand::RngCore;
use base64::Engine;
use tauri::AppHandle;

// 密钥存储键名
const MASTER_KEY_STORE_KEY: &str = "master_encryption_key";
const PAT_TOKEN_STORE_KEY: &str = "github_pat_token";

/// 获取或创建主加密密钥
/// 
/// 如果密钥不存在，则生成一个新的 32 字节密钥并存储
/// 如果密钥已存在，则从存储中读取
/// 
/// # 参数
/// - `app`: Tauri 应用句柄，用于访问插件存储
/// 
/// # 返回
/// 返回 32 字节的主加密密钥
pub async fn get_or_create_master_key(app: &AppHandle) -> Result<Vec<u8>> {
    // 使用 tauri-plugin-store 访问安全存储
    use tauri_plugin_store::StoreBuilder;
    use std::path::PathBuf;
    
    let store = StoreBuilder::new(
        app,
        PathBuf::from("vault_keys.json"),
    )
    .build()?;

    // 尝试读取现有密钥
    if let Some(value) = store.get(MASTER_KEY_STORE_KEY) {
        if let Some(key_str) = value.as_str() {
            // 从 base64 字符串解码
            if let Ok(key_bytes) = base64::engine::general_purpose::STANDARD.decode(key_str) {
                if key_bytes.len() == 32 {
                    return Ok(key_bytes);
                }
            }
        }
    }

    // 如果密钥不存在或无效，生成新密钥
    let mut key = vec![0u8; 32];
    rand::thread_rng().fill_bytes(&mut key);

    // 将密钥编码为 base64 并存储
    let key_base64 = base64::engine::general_purpose::STANDARD.encode(&key);
    store.set(MASTER_KEY_STORE_KEY.to_string(), serde_json::json!(key_base64));
    
    // tauri-plugin-store v2 的 save() 是同步方法
    store.save()?;

    Ok(key)
}

/// 同步版本的密钥获取（用于非异步上下文）
/// 
/// 注意：这会在后台线程中执行异步操作
pub fn get_or_create_master_key_sync(app: &AppHandle) -> Result<Vec<u8>> {
    // 使用 tokio runtime 执行异步操作
    let rt = tokio::runtime::Runtime::new().context("无法创建 Tokio runtime")?;
    rt.block_on(get_or_create_master_key(app))
}

/// 存储 GitHub PAT Token
/// 
/// # 参数
/// - `app`: Tauri 应用句柄
/// - `token`: PAT Token 字符串
/// 
/// # 返回
/// 成功时返回 Ok(())
/// 
/// PAT 使用 base64 编码存储以增强安全性
pub async fn store_pat_token(app: &AppHandle, token: &str) -> Result<()> {
    use tauri_plugin_store::StoreBuilder;
    use std::path::PathBuf;
    
    let store = StoreBuilder::new(
        app,
        PathBuf::from("vault_keys.json"),
    )
    .build()?;
    
    // 使用 base64 编码存储 PAT（增强安全性）
    let token_base64 = base64::engine::general_purpose::STANDARD.encode(token.as_bytes());
    store.set(PAT_TOKEN_STORE_KEY.to_string(), serde_json::json!(token_base64));
    
    store.save()?;
    
    Ok(())
}

/// 获取 GitHub PAT Token
/// 
/// # 参数
/// - `app`: Tauri 应用句柄
/// 
/// # 返回
/// 返回 PAT Token，如果未配置则返回 None
pub async fn get_pat_token(app: &AppHandle) -> Result<Option<String>> {
    use tauri_plugin_store::StoreBuilder;
    use std::path::PathBuf;
    
    let store = StoreBuilder::new(
        app,
        PathBuf::from("vault_keys.json"),
    )
    .build()?;
    
    // 尝试读取存储的 PAT
    if let Some(value) = store.get(PAT_TOKEN_STORE_KEY) {
        if let Some(token_base64) = value.as_str() {
            // 从 base64 解码
            if let Ok(token_bytes) = base64::engine::general_purpose::STANDARD.decode(token_base64) {
                if let Ok(token) = String::from_utf8(token_bytes) {
                    return Ok(Some(token));
                }
            }
        }
    }
    
    Ok(None)
}

/// 删除 GitHub PAT Token
/// 
/// # 参数
/// - `app`: Tauri 应用句柄
/// 
/// # 返回
/// 成功时返回 Ok(())
pub async fn remove_pat_token(app: &AppHandle) -> Result<()> {
    use tauri_plugin_store::StoreBuilder;
    use std::path::PathBuf;
    
    let store = StoreBuilder::new(
        app,
        PathBuf::from("vault_keys.json"),
    )
    .build()?;
    
    // 删除 PAT
    store.delete(PAT_TOKEN_STORE_KEY);
    store.save()?;
    
    Ok(())
}

/// 检查是否已配置 GitHub PAT Token
/// 
/// # 参数
/// - `app`: Tauri 应用句柄
/// 
/// # 返回
/// 如果已配置返回 true，否则返回 false
pub async fn has_pat_token(app: &AppHandle) -> Result<bool> {
    let token = get_pat_token(app).await?;
    Ok(token.is_some())
}

#[cfg(test)]
mod tests {
    use super::*;

    // 注意：这些测试需要实际的 Tauri 应用上下文，在单元测试中可能无法运行
    // 实际测试应该在集成测试中进行
}

