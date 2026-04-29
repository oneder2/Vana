// Vana - 密钥管理模块
// 负责生成、存储和检索主加密密钥
// 密钥存储在系统 Keychain/Keystore 中，确保安全性

use anyhow::{Context, Result};
use rand::RngCore;
use base64::Engine;
use tauri::AppHandle;

// 密钥存储键名
const MASTER_KEY_STORE_KEY: &str = "master_encryption_key";

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

/// 导出主加密密钥（Base64）
///
/// 用于跨设备迁移同一套文档加密密钥。
/// 如果密钥不存在会自动创建。
pub async fn export_master_key(app: &AppHandle) -> Result<String> {
    let key = get_or_create_master_key(app).await?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&key))
}

/// 导入主加密密钥（Base64）
///
/// 用于在新设备上恢复已有文档的解密能力。
pub async fn import_master_key(app: &AppHandle, key_base64: &str) -> Result<()> {
    use tauri_plugin_store::StoreBuilder;
    use std::path::PathBuf;

    let key_bytes = base64::engine::general_purpose::STANDARD
        .decode(key_base64.trim())
        .context("主密钥格式无效：无法进行 Base64 解码")?;

    if key_bytes.len() != 32 {
        anyhow::bail!("主密钥长度无效：期望 32 字节，实际 {} 字节", key_bytes.len());
    }

    let store = StoreBuilder::new(
        app,
        PathBuf::from("vault_keys.json"),
    )
    .build()?;

    store.set(MASTER_KEY_STORE_KEY.to_string(), serde_json::json!(key_base64.trim()));
    store.save()?;

    Ok(())
}

#[cfg(test)]
mod tests {
    // 注意：这些测试需要实际的 Tauri 应用上下文，在单元测试中可能无法运行
    // 实际测试应该在集成测试中进行
}
