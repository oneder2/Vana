use super::*;

fn write_metadata(conn: &Connection, session: &SupabaseSession, key: &str) -> Result<()> {
    let mut metadata = session.clone();
    metadata.access_token.clear();
    metadata.refresh_token = None;
    set_config_value(
        conn,
        "supabase.session",
        Some(&serde_json::to_string(&metadata)?),
    )?;
    set_config_value(conn, "supabase.credential_id", Some(key))?;
    set_config_value(conn, "supabase.user_id", metadata.user_id.as_deref())?;
    set_config_value(conn, "supabase.email", metadata.email.as_deref())?;
    Ok(())
}

pub fn save_supabase_session(
    app: &AppHandle,
    session: SupabaseSession,
    expected_project: &str,
    expected_scope: Option<&str>,
) -> Result<SupabaseSession> {
    let control = open_control(app)?;
    control.pragma_update(None, "secure_delete", "ON")?;
    let conn =
        rusqlite::Transaction::new_unchecked(&control, rusqlite::TransactionBehavior::Immediate)?;
    let current = effective_supabase_config(&conn)?;
    anyhow::ensure!(
        canonical_project(current.url.as_deref().unwrap_or_default())?
            == canonical_project(expected_project)?,
        "登录期间项目已切换"
    );
    if let Some(scope) = expected_scope {
        anyhow::ensure!(active_scope(&conn)? == scope, "认证期间账号已切换");
    }
    Uuid::parse_str(session.user_id.as_deref().unwrap_or_default())
        .context("会话缺少有效用户 ID")?;
    anyhow::ensure!(!session.access_token.trim().is_empty(), "会话缺少访问令牌");
    let old_key = get_config_value(&conn, "supabase.credential_id")?;
    let new_key = Uuid::new_v4().to_string();
    crate::credentials::put(app, &new_key, &serde_json::to_string(&session)?)?;
    let save = (|| -> Result<()> {
        write_metadata(&conn, &session, &new_key)?;
        set_config_value(&conn, "onboarding.completed", Some("1"))?;
        set_config_value(&conn, "supabase.secrets_cleanup_pending", Some("1"))?;
        conn.commit()?;
        Ok(())
    })();
    if let Err(error) = save {
        let _ = crate::credentials::remove(app, &new_key);
        return Err(error);
    }
    if let Some(key) = old_key {
        crate::credentials::remove(app, &key).context("登录已保存，但旧系统凭据清理失败")?;
    }
    cleanup_legacy_tokens(app)?;
    set_config_value(&control, "supabase.secrets_cleanup_pending", None)?;
    Ok(session)
}

/// The only read path for session secrets. Older SQLite sessions migrate only
/// after the OS store writes AND reads back successfully; failures keep local
/// documents accessible but never return plaintext secrets to the frontend.
pub fn get_supabase_session(app: &AppHandle) -> Result<Option<SupabaseSession>> {
    let control = open_control(app)?;
    control.pragma_update(None, "secure_delete", "ON")?;
    let conn =
        rusqlite::Transaction::new_unchecked(&control, rusqlite::TransactionBehavior::Immediate)?;
    let Some(raw) = get_config_value(&conn, "supabase.session")? else {
        return Ok(None);
    };
    let metadata: SupabaseSession = serde_json::from_str(&raw)?;
    if !metadata.access_token.is_empty() || metadata.refresh_token.is_some() {
        let key = Uuid::new_v4().to_string();
        crate::credentials::put(app, &key, &raw)?;
        let migrate = (|| -> Result<()> {
            write_metadata(&conn, &metadata, &key)?;
            set_config_value(&conn, "supabase.secrets_cleanup_pending", Some("1"))?;
            conn.commit()?;
            Ok(())
        })();
        if let Err(error) = migrate {
            let _ = crate::credentials::remove(app, &key);
            return Err(error);
        }
    } else {
        conn.commit()?;
    }
    if get_config_value(&control, "supabase.secrets_cleanup_pending")?.is_some() {
        cleanup_legacy_tokens(app)?;
        set_config_value(&control, "supabase.secrets_cleanup_pending", None)?;
    }
    let key = get_config_value(&control, "supabase.credential_id")?
        .context("系统会话凭据缺失，请重新登录")?;
    let raw = crate::credentials::get(app, &key)?.context("系统会话凭据缺失，请重新登录")?;
    let session: SupabaseSession =
        serde_json::from_str(&raw).context("系统会话凭据损坏，请重新登录")?;
    anyhow::ensure!(
        session.user_id == metadata.user_id,
        "系统会话与账号身份不一致，请重新登录"
    );
    Ok(Some(session))
}

pub fn clear_supabase_session(app: &AppHandle, expected_scope: &str) -> Result<()> {
    let control = open_control(app)?;
    control.pragma_update(None, "secure_delete", "ON")?;
    let conn =
        rusqlite::Transaction::new_unchecked(&control, rusqlite::TransactionBehavior::Immediate)?;
    anyhow::ensure!(active_scope(&conn)? == expected_scope, "退出期间账号已切换");
    if let Some(key) = get_config_value(&conn, "supabase.credential_id")? {
        crate::credentials::remove(app, &key)?;
    }
    set_config_value(&conn, "supabase.credential_id", None)?;
    set_config_value(&conn, "supabase.session", None)?;
    set_config_value(&conn, "supabase.user_id", None)?;
    set_config_value(&conn, "supabase.email", None)?;
    conn.commit()?;
    cleanup_legacy_tokens(app)?;
    Ok(())
}

/// Remove token copies left by the old one-database architecture. Files owned by
/// Vana only; credentials never enter workspace backups. Pending flag permits retry.
fn cleanup_legacy_tokens(app: &AppHandle) -> Result<()> {
    let dir = local_data_dir(app)?;
    for entry in std::fs::read_dir(&dir)? {
        let entry = entry?;
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        if name == "control.db"
            || !(name == "vana.db" || name == "legacy-unassigned.db" || name.starts_with("space-"))
            || !name.ends_with(".db")
        {
            continue;
        }
        anyhow::ensure!(
            !entry.file_type()?.is_symlink(),
            "旧会话清理拒绝符号链接数据库"
        );
        let conn = Connection::open(entry.path())?;
        conn.busy_timeout(std::time::Duration::from_secs(10))?;
        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_config')",
            [],
            |r| r.get(0),
        )?;
        if exists {
            conn.pragma_update(None, "secure_delete", "ON")?;
            let removed =
                conn.execute("DELETE FROM app_config WHERE key='supabase.session'", [])?;
            if removed > 0 {
                conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;")?;
            }
        }
    }
    let control = open_control(app)?;
    control.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
    Ok(())
}
