use super::*;

// Configuration is global; document data, cursors and outbox belong to one space.
pub(super) fn open_control(app: &AppHandle) -> Result<Connection> {
    let dir = local_data_dir(app)?;
    let conn = Connection::open(dir.join("control.db"))?;
    conn.busy_timeout(std::time::Duration::from_secs(10))?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
    )?;
    let tx = rusqlite::Transaction::new_unchecked(&conn, rusqlite::TransactionBehavior::Immediate)?;
    if get_config_value(&tx, "spaces.migrated")?.is_none() {
        let legacy = dir.join("vana.db");
        if legacy.exists() {
            let old = Connection::open(&legacy)?;
            let mut stmt = old.prepare("SELECT key, value FROM app_config WHERE key LIKE 'supabase.%' OR key LIKE 'onboarding.%'")?;
            let config = stmt
                .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            for (key, value) in config {
                set_config_value(&tx, &key, Some(&value))?;
            }
            let scope = match active_scope(&tx) {
                Ok(scope) => scope,
                Err(_) => {
                    set_config_value(&tx, "supabase.session", None)?;
                    set_config_value(&tx, "supabase.user_id", None)?;
                    set_config_value(&tx, "supabase.email", None)?;
                    "guest".into()
                }
            };
            let destination = if scope == "guest" {
                dir.join("legacy-unassigned.db")
            } else {
                dir.join(format!("space-{scope}.db"))
            };
            if !destination.exists() {
                old.execute("VACUUM INTO ?1", params![destination.to_string_lossy()])?;
            }
        }
        set_config_value(&tx, "spaces.migrated", Some("1"))?;
    }
    tx.commit()?;
    Ok(conn)
}

pub(super) fn canonical_project(url: &str) -> Result<String> {
    let mut parsed = url::Url::parse(url.trim())?;
    anyhow::ensure!(
        matches!(parsed.scheme(), "http" | "https")
            && parsed.host_str().is_some()
            && parsed.username().is_empty()
            && parsed.password().is_none(),
        "Supabase URL 无效"
    );
    parsed.set_query(None);
    parsed.set_fragment(None);
    Ok(parsed.as_str().trim_end_matches('/').to_string())
}

pub(super) fn active_scope(conn: &Connection) -> Result<String> {
    let Some(raw) = get_config_value(conn, "supabase.session")? else {
        return Ok("guest".into());
    };
    let session: SupabaseSession = serde_json::from_str(&raw)?;
    let id = Uuid::parse_str(session.user_id.as_deref().unwrap_or_default())?;
    let config = effective_supabase_config(conn)?;
    let project = canonical_project(config.url.as_deref().unwrap_or_default())?;
    Ok(format!(
        "{:x}",
        Sha256::digest(format!("{project}\n{id}").as_bytes())
    ))
}

pub fn open_db(app: &AppHandle) -> Result<Connection> {
    let control = open_control(app)?;
    let scope = active_scope(&control)?;
    let dir = local_data_dir(app)?;
    let path = dir.join(format!("space-{scope}.db"));
    let conn = Connection::open(&path)?;
    conn.busy_timeout(std::time::Duration::from_secs(10))?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.execute(
        "ATTACH DATABASE ?1 AS control",
        params![dir.join("control.db").to_string_lossy()],
    )?;
    if conn.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))? < 5 {
        let tx = conn.unchecked_transaction()?;
        init_schema(&tx)?;
        // Migrated space databases must not retain credentials from their old global configuration.
        tx.execute(
            "DELETE FROM app_config WHERE key LIKE 'supabase.%' OR key LIKE 'onboarding.%'",
            [],
        )?;
        tx.pragma_update(None, "user_version", 5)?;
        tx.commit()?;
    }
    if get_config_value(&conn, "space.id")?.as_deref() != Some(&scope) {
        set_config_value(&conn, "space.id", Some(&scope))?;
    }
    if scope == "guest" && get_config_value(&conn, "space.seeded")?.is_none() {
        let tx = conn.unchecked_transaction()?;
        seed_if_empty(&tx)?;
        set_config_value(&tx, "space.seeded", Some("1"))?;
        tx.commit()?;
    }
    Ok(conn)
}

pub(super) fn open_scoped_db(app: &AppHandle, expected: &str) -> Result<Connection> {
    let conn = open_db(app)?;
    anyhow::ensure!(
        get_config_value(&conn, "space.id")?.as_deref() == Some(expected),
        "账号空间已切换，请刷新后重试；原草稿仍保留"
    );
    Ok(conn)
}
