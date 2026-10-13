//! Session secrets only. Never use the legacy vault_keys.json file or plaintext fallback.
use anyhow::Result;
#[cfg(not(target_os = "android"))]
use anyhow::Context;
use tauri::AppHandle;

#[cfg(not(target_os = "android"))]
fn entry(key: &str) -> Result<keyring::Entry> {
    uuid::Uuid::parse_str(key).context("会话凭据标识无效")?;
    keyring::Entry::new("com.vana.no-visitors.auth", key).context("系统凭据库不可用")
}

pub fn put(app: &AppHandle, key: &str, value: &str) -> Result<()> {
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        entry(key)?
            .set_password(value)
            .context("无法写入系统凭据库；登录未保存，不会降级为明文")?;
    }
    #[cfg(target_os = "android")]
    {
        android_access(app, "write", key, value)?;
    }
    anyhow::ensure!(
        get(app, key)?.as_deref() == Some(value),
        "系统凭据写入回读验证失败"
    );
    Ok(())
}

pub fn get(app: &AppHandle, key: &str) -> Result<Option<String>> {
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        match entry(key)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(error).context("系统凭据库不可用，请解锁凭据库或重新登录"),
        }
    }
    #[cfg(target_os = "android")]
    {
        android_access(app, "read", key, "")
    }
}

pub fn remove(app: &AppHandle, key: &str) -> Result<()> {
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        match entry(key)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error).context("无法清除系统会话凭据"),
        }
    }
    #[cfg(target_os = "android")]
    {
        android_access(app, "delete", key, "").map(|_| ())
    }
}

#[cfg(target_os = "android")]
fn android_access(
    _app: &AppHandle,
    operation: &str,
    key: &str,
    value: &str,
) -> Result<Option<String>> {
    use jni::objects::{JClass, JObject, JString, JValue};
    uuid::Uuid::parse_str(key)?;
    let context = ndk_context::android_context();
    let vm = unsafe { jni::JavaVM::from_raw(context.vm().cast()) }?;
    let mut env = vm.attach_current_thread()?;
    let android = unsafe { JObject::from_raw(context.context().cast()) };
    let loader = env
        .call_method(&android, "getClassLoader", "()Ljava/lang/ClassLoader;", &[])?
        .l()?;
    let name = JObject::from(env.new_string("com.vana.no_visitors.AndroidSessionSecrets")?);
    let class = JClass::from(
        env.call_method(
            &loader,
            "loadClass",
            "(Ljava/lang/String;)Ljava/lang/Class;",
            &[JValue::Object(&name)],
        )?
        .l()?,
    );
    let op = JObject::from(env.new_string(operation)?);
    let key = JObject::from(env.new_string(key)?);
    let value = JObject::from(env.new_string(value)?);
    let result = env.call_static_method(&class, "access", "(Landroid/content/Context;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;",
        &[JValue::Object(&android), JValue::Object(&op), JValue::Object(&key), JValue::Object(&value)]);
    if result.is_err() {
        if env.exception_check().unwrap_or(false) {
            let _ = env.exception_clear();
        }
        anyhow::bail!("Android Keystore 无法读写会话；请重新登录，不会降级为明文");
    }
    let object = result?.l()?;
    if object.is_null() {
        return Ok(None);
    }
    let value = env
        .get_string(&JString::from(object))?
        .to_string_lossy()
        .into_owned();
    Ok(Some(value))
}
