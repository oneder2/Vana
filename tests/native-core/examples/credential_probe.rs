//! Run only in an isolated Secret Service session or a disposable test user.
extern crate vana_native_core_tests as tauri;
#[path = "../../../src-tauri/src/credentials.rs"]
mod credentials;
fn main() -> anyhow::Result<()> {
    let key = uuid::Uuid::new_v4().to_string();
    let app = tauri::AppHandle(std::env::temp_dir().join(format!("vana-credential-probe-{key}")));
    let secret = "vana-disposable-session-probe";
    credentials::put(&app, &key, secret)?;
    assert_eq!(credentials::get(&app, &key)?.as_deref(), Some(secret));
    credentials::remove(&app, &key)?;
    assert!(credentials::get(&app, &key)?.is_none());
    println!("PASS: native system credential write, verified read, delete and missing entry");
    Ok(())
}
