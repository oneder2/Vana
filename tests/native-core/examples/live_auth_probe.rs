//! Opt-in live Auth with the production Rust modules and real OS credential store.
//! Uses a disposable account and a new local directory. Never prints credentials.
#![allow(dead_code, unused_imports)]
extern crate vana_native_core_tests as tauri;
#[path = "../../../src-tauri/src/credentials.rs"]
mod credentials;
#[path = "../../../src-tauri/src/db.rs"]
mod db;
#[path = "../../../src-tauri/src/document_content.rs"]
mod document_content;
#[path = "../../../src-tauri/src/auth.rs"]
mod auth;

use anyhow::{ensure, Context, Result};
use serde::Deserialize;

#[derive(Deserialize)]
struct Config {
    url: String,
    anon: String,
    expected_project_ref: String,
    email: String,
    password: String,
    id: String,
}

fn stored_key(app: &tauri::AppHandle) -> Result<Option<String>> {
    use rusqlite::OptionalExtension;
    let conn = rusqlite::Connection::open(db::local_data_dir(app)?.join("control.db"))?;
    Ok(conn.query_row("SELECT value FROM app_config WHERE key='supabase.credential_id'", [], |r| r.get(0)).optional()?)
}

async fn verify(app: tauri::AppHandle, config: Config) -> Result<()> {
    ensure!(config.url == format!("https://{}.supabase.co", config.expected_project_ref), "Project mismatch");
    ensure!(config.email.starts_with("vana-acceptance-") && config.email.ends_with("@example.com"), "Disposable fixture required");
    db::save_supabase_config(&app, db::SupabaseConfig { url: Some(config.url.clone()), anon_key: Some(config.anon) })?;
    let scope = db::get_app_state(&app)?.account_scope;
    let registration = auth::password_auth(app.clone(), config.url.clone(), scope, config.email, config.password, false).await?;
    let session = registration.session.context("Login returned no session")?;
    ensure!(session.user_id.as_deref() == Some(config.id.as_str()), "Fixture identity mismatch");
    let first_key = stored_key(&app)?.context("Credential ID missing")?;
    ensure!(credentials::get(&app, &first_key)?.is_some(), "OS credential missing");
    let conn = rusqlite::Connection::open(db::local_data_dir(&app)?.join("control.db"))?;
    let raw: String = conn.query_row("SELECT value FROM app_config WHERE key='supabase.session'", [], |r| r.get(0))?;
    let metadata: serde_json::Value = serde_json::from_str(&raw)?;
    ensure!(metadata["access_token"] == "" && metadata["refresh_token"].is_null(), "Plaintext SQLite token");
    drop(conn);
    println!("PASS: production Rust login, real OS credential write/read, token-free SQLite metadata");

    let reopened = tauri::AppHandle(app.0.clone());
    let read = db::get_supabase_session(&reopened)?.context("Reopened session missing")?;
    ensure!(read.user_id.as_deref() == Some(config.id.as_str()), "Reopened identity mismatch");
    let scope = db::get_app_state(&reopened)?.account_scope;
    let refreshed = auth::refresh(reopened.clone(), config.url.clone(), scope.clone()).await?;
    ensure!(refreshed.user_id == read.user_id, "Refresh identity mismatch");
    ensure!(credentials::get(&reopened, &first_key)?.is_none(), "Old OS credential retained after refresh");
    let refreshed_key = stored_key(&reopened)?.context("Refreshed credential ID missing")?;
    ensure!(refreshed_key != first_key, "Refresh did not replace credential entry");
    println!("PASS: reopened local storage reads OS session, real refresh replaces and deletes old credential");

    auth::logout(reopened.clone(), config.url, scope).await?;
    ensure!(credentials::get(&reopened, &refreshed_key)?.is_none(), "Logout left OS secret");
    ensure!(db::get_supabase_session(&reopened)?.is_none(), "Logout left session metadata");
    ensure!(stored_key(&reopened)?.is_none(), "Logout left credential reference");
    ensure!(db::get_app_state(&reopened)?.account_mode == "guest", "Logout did not switch space");
    println!("PASS: real logout deletes OS credential and metadata, returns to guest space");
    Ok(())
}

#[tokio::main]
async fn main() {
    let root = std::env::temp_dir().join(format!("vana-native-auth-{}", uuid::Uuid::new_v4()));
    let app = tauri::AppHandle(root.clone());
    let result = async {
        let path = std::env::var("VANA_NATIVE_ACCEPTANCE_CONFIG")?;
        let config: Config = serde_json::from_slice(&std::fs::read(path)?)?;
        verify(app.clone(), config).await
    }.await;
    if let Ok(Some(key)) = stored_key(&app) { let _ = credentials::remove(&app, &key); }
    let _ = std::fs::remove_dir_all(root);
    if result.is_err() {
        eprintln!("FAIL: live native authentication acceptance; private error details suppressed");
        std::process::exit(1);
    }
}
