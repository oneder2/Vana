//! Auth owns refresh tokens in Rust. The UI receives a short-lived access token
//! for the existing document transport, plus display metadata, never refresh tokens.
use crate::db::{self, SupabaseSession};
static AUTH_OPERATION: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
use anyhow::{Context, Result};
use serde::Serialize;
use serde_json::{json, Value};
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize)]
pub struct PublicSession {
    pub access_token: String,
    pub expires_at: Option<i64>,
    pub token_type: Option<String>,
    pub user_id: Option<String>,
    pub email: Option<String>,
}
impl From<SupabaseSession> for PublicSession {
    fn from(session: SupabaseSession) -> Self {
        Self {
            access_token: session.access_token,
            expires_at: session.expires_at,
            token_type: session.token_type,
            user_id: session.user_id,
            email: session.email,
        }
    }
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Registration {
    pub session: Option<PublicSession>,
    pub needs_email_confirmation: bool,
}

fn client() -> Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none())
        .build()?)
}
fn config(
    app: &AppHandle,
    expected_project: &str,
    expected_scope: &str,
) -> Result<(String, String)> {
    let state = db::get_app_state(app)?;
    anyhow::ensure!(state.account_scope == expected_scope, "认证期间账号已切换");
    let url = state.supabase.url.context("Supabase 连接信息未配置")?;
    let parsed = url::Url::parse(&url)?;
    anyhow::ensure!(
        parsed.as_str().trim_end_matches('/')
            == url::Url::parse(expected_project)?
                .as_str()
                .trim_end_matches('/'),
        "认证期间项目已切换"
    );
    anyhow::ensure!(
        parsed.scheme() == "https"
            || (parsed.scheme() == "http"
                && matches!(parsed.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))),
        "登录只允许 HTTPS 服务或本机测试服务"
    );
    Ok((
        url.trim_end_matches('/').into(),
        state
            .supabase
            .anon_key
            .context("Supabase Anon Key 未配置")?,
    ))
}
async fn response(response: reqwest::Response) -> Result<Value> {
    let mut response = response;
    let status = response.status();
    anyhow::ensure!(
        response.content_length().unwrap_or(0) <= 1024 * 1024,
        "认证响应过大"
    );
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        anyhow::ensure!(body.len() + chunk.len() <= 1024 * 1024, "认证响应过大");
        body.extend_from_slice(&chunk);
    }
    // Keep auth errors bounded, avoid logging response bodies or submitted secrets.
    anyhow::ensure!(
        status.is_success(),
        "认证请求失败（HTTP {}），请检查账号或连接后重试",
        status.as_u16()
    );
    Ok(serde_json::from_slice(&body).context("认证响应不是有效 JSON")?)
}
fn session(body: &Value, previous: Option<&SupabaseSession>) -> Result<SupabaseSession> {
    let access = body["access_token"]
        .as_str()
        .context("认证响应缺少访问令牌")?;
    anyhow::ensure!(!access.is_empty() && access.len() <= 16_384, "访问令牌无效");
    let refresh = body["refresh_token"]
        .as_str()
        .map(str::to_owned)
        .or_else(|| previous.and_then(|s| s.refresh_token.clone()));
    anyhow::ensure!(
        refresh.as_ref().map(|s| s.len() <= 16_384).unwrap_or(true),
        "刷新令牌无效"
    );
    let expiry = body["expires_at"].as_i64().or_else(|| {
        body["expires_in"]
            .as_i64()
            .and_then(|seconds| chrono::Utc::now().timestamp().checked_add(seconds))
    });
    Ok(SupabaseSession {
        access_token: access.into(),
        refresh_token: refresh,
        expires_at: expiry,
        token_type: Some("bearer".into()),
        user_id: None,
        email: None,
    })
}
async fn verified_session(
    client: &reqwest::Client,
    url: &str,
    key: &str,
    mut session: SupabaseSession,
) -> Result<SupabaseSession> {
    let user = response(
        client
            .get(format!("{url}/auth/v1/user"))
            .header("apikey", key)
            .bearer_auth(&session.access_token)
            .send()
            .await?,
    )
    .await?;
    let id = user["id"].as_str().context("服务器返回的用户 ID 无效")?;
    uuid::Uuid::parse_str(id).context("服务器返回的用户 ID 无效")?;
    session.user_id = Some(id.into());
    session.email = user["email"].as_str().map(str::to_owned);
    Ok(session)
}

pub async fn password_auth(
    app: AppHandle,
    project: String,
    scope: String,
    email: String,
    password: String,
    register: bool,
) -> Result<Registration> {
    let _operation = AUTH_OPERATION.lock().await;
    anyhow::ensure!(
        !email.trim().is_empty()
            && email.len() <= 320
            && !password.is_empty()
            && password.len() <= 4096,
        "邮箱或密码格式无效"
    );
    let (url, key) = config(&app, &project, &scope)?;
    let client = client()?;
    let endpoint = if register {
        "signup"
    } else {
        "token?grant_type=password"
    };
    let body = response(
        client
            .post(format!("{url}/auth/v1/{endpoint}"))
            .header("apikey", &key)
            .bearer_auth(&key)
            .json(&json!({"email":email.trim(),"password":password}))
            .send()
            .await?,
    )
    .await?;
    if register && body["access_token"].is_null() {
        config(&app, &project, &scope)?;
        return Ok(Registration {
            session: None,
            needs_email_confirmation: true,
        });
    }
    let verified = verified_session(&client, &url, &key, session(&body, None)?).await?;
    let saved = db::save_supabase_session(&app, verified, &project, Some(&scope))?;
    Ok(Registration {
        session: Some(saved.into()),
        needs_email_confirmation: false,
    })
}

pub async fn refresh(app: AppHandle, project: String, scope: String) -> Result<PublicSession> {
    let _operation = AUTH_OPERATION.lock().await;
    let (url, key) = config(&app, &project, &scope)?;
    let previous = db::get_supabase_session(&app)?.context("尚未登录")?;
    let refresh = previous
        .refresh_token
        .as_deref()
        .context("登录态已过期，请重新登录")?;
    let client = client()?;
    let body = response(
        client
            .post(format!("{url}/auth/v1/token?grant_type=refresh_token"))
            .header("apikey", &key)
            .bearer_auth(&key)
            .json(&json!({"refresh_token":refresh}))
            .send()
            .await?,
    )
    .await?;
    let verified = verified_session(&client, &url, &key, session(&body, Some(&previous))?).await?;
    anyhow::ensure!(
        verified.user_id == previous.user_id,
        "刷新响应的账号身份不一致"
    );
    Ok(db::save_supabase_session(&app, verified, &project, Some(&scope))?.into())
}

pub async fn logout(app: AppHandle, project: String, scope: String) -> Result<()> {
    let _operation = AUTH_OPERATION.lock().await;
    let (url, key) = config(&app, &project, &scope)?;
    // Always permit local logout when the network is unavailable.
    if let Some(session) = db::get_supabase_session(&app)? {
        let _ = client()?
            .post(format!("{url}/auth/v1/logout"))
            .header("apikey", &key)
            .bearer_auth(&session.access_token)
            .send()
            .await;
    }
    db::clear_supabase_session(&app, &scope)
}

pub async fn import(
    app: AppHandle,
    project: String,
    scope: String,
    raw: String,
) -> Result<PublicSession> {
    let _operation = AUTH_OPERATION.lock().await;
    anyhow::ensure!(raw.len() <= 32_768, "导入会话过大");
    let body: Value = match serde_json::from_str(&raw) {
        Ok(body) => body,
        Err(_) => {
            let fragment = raw
                .split_once('#')
                .map(|(_, fragment)| fragment)
                .unwrap_or(raw.trim_start_matches(['#', '?']));
            let pairs: std::collections::HashMap<_, _> =
                url::form_urlencoded::parse(fragment.as_bytes())
                    .into_owned()
                    .collect();
            json!({"access_token":pairs.get("access_token"),"refresh_token":pairs.get("refresh_token"),"expires_at":pairs.get("expires_at").and_then(|s|s.parse::<i64>().ok())})
        }
    };
    let (url, key) = config(&app, &project, &scope)?;
    let verified = verified_session(&client()?, &url, &key, session(&body, None)?).await?;
    Ok(db::save_supabase_session(&app, verified, &project, Some(&scope))?.into())
}
