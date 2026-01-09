// No Visitors - 加密模块
// 使用 AES-256-GCM 进行内容加密和解密
// 实现零知识加密，确保即使文件泄露也无法解密内容

use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use anyhow::{Context, Result};

/// 加密明文内容
/// 
/// # 参数
/// - `plaintext`: 要加密的明文内容
/// - `key`: 32 字节的加密密钥
/// 
/// # 返回
/// 返回加密后的密文（包含认证标签）
pub fn encrypt_content(plaintext: &str, key: &[u8]) -> Result<Vec<u8>> {
    // 验证密钥长度（AES-256 需要 32 字节）
    if key.len() != 32 {
        anyhow::bail!("密钥长度必须为 32 字节（AES-256）");
    }

    // 从密钥字节创建密钥对象
    let key = Key::<Aes256Gcm>::from_slice(key);
    let cipher = Aes256Gcm::new(key);

    // 生成随机 nonce（每次加密都使用新的 nonce）
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);

    // 加密内容
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|e| anyhow::anyhow!("加密失败: {:?}", e))?;

    // 将 nonce 和密文组合：nonce (12 bytes) + ciphertext
    let mut result = Vec::with_capacity(12 + ciphertext.len());
    result.extend_from_slice(nonce.as_slice());
    result.extend_from_slice(&ciphertext);

    Ok(result)
}

/// 解密密文内容
/// 
/// # 参数
/// - `ciphertext`: 加密后的内容（包含 nonce 和密文）
/// - `key`: 32 字节的加密密钥
/// 
/// # 返回
/// 返回解密后的明文内容
pub fn decrypt_content(ciphertext: &[u8], key: &[u8]) -> Result<String> {
    // 验证密钥长度
    if key.len() != 32 {
        anyhow::bail!("密钥长度必须为 32 字节（AES-256）");
    }

    // 验证密文长度（至少需要 12 字节的 nonce）
    if ciphertext.len() < 12 {
        anyhow::bail!("密文格式无效：长度不足");
    }

    // 从密钥字节创建密钥对象
    let key = Key::<Aes256Gcm>::from_slice(key);
    let cipher = Aes256Gcm::new(key);

    // 提取 nonce（前 12 字节）和实际密文
    let (nonce_bytes, encrypted_data) = ciphertext.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    // 解密内容
    let plaintext_bytes = cipher
        .decrypt(nonce, encrypted_data)
        .map_err(|e| anyhow::anyhow!("解密失败：可能是密钥错误或数据损坏: {:?}", e))?;

    // 转换为字符串
    String::from_utf8(plaintext_bytes)
        .context("解密后的内容不是有效的 UTF-8 字符串")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt() {
        let key = [0u8; 32]; // 测试密钥
        let plaintext = "Hello, World! 这是测试内容。";

        // 加密
        let ciphertext = encrypt_content(plaintext, &key).unwrap();
        assert!(!ciphertext.is_empty());

        // 解密
        let decrypted = decrypt_content(&ciphertext, &key).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_different_nonce() {
        let key = [0u8; 32];
        let plaintext = "相同的明文";

        // 两次加密应该产生不同的密文（因为 nonce 不同）
        let ciphertext1 = encrypt_content(plaintext, &key).unwrap();
        let ciphertext2 = encrypt_content(plaintext, &key).unwrap();

        assert_ne!(ciphertext1, ciphertext2);

        // 但解密后应该得到相同的明文
        assert_eq!(
            decrypt_content(&ciphertext1, &key).unwrap(),
            decrypt_content(&ciphertext2, &key).unwrap()
        );
    }
}

