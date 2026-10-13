import {
  applyRemoteDocuments,
  clearSupabaseSession,
  exportSyncDocuments,
  finalizeSyncJobs,
  getSupabaseConfig,
  getAppState,
  getSupabaseSession,
  saveSupabaseSession,
  type SupabaseSession,
  type SyncDocumentRecord,
  type SyncSnapshot,
} from './api';

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function authHeaders(accessToken: string, anonKey: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
  };
}

export function parseSupabaseCallbackPayload(input: string): SupabaseSession | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as Partial<SupabaseSession>;
    if (typeof parsed.access_token === 'string' && parsed.access_token.trim()) {
      return {
        access_token: parsed.access_token.trim(),
        refresh_token: parsed.refresh_token?.trim() ?? null,
        expires_at: typeof parsed.expires_at === 'number' ? parsed.expires_at : null,
        token_type: parsed.token_type?.trim() ?? 'bearer',
        user_id: parsed.user_id?.trim() ?? null,
        email: parsed.email?.trim() ?? null,
      };
    }
  } catch {
    // fall through
  }

  const fromHash = trimmed.includes('#') ? trimmed.split('#')[1] : trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  const params = new URLSearchParams(fromHash.startsWith('?') ? fromHash.slice(1) : fromHash);
  const accessToken = params.get('access_token');
  if (!accessToken) return null;

  return {
    access_token: accessToken,
    refresh_token: params.get('refresh_token'),
    expires_at: params.get('expires_at') ? Number(params.get('expires_at')) : null,
    token_type: params.get('token_type'),
    user_id: params.get('user_id') ?? params.get('sub'),
    email: params.get('email'),
  };
}

async function fetchUserProfile(url: string, anonKey: string, session: SupabaseSession): Promise<Partial<SupabaseSession>> {
  const response = await fetch(`${normalizeUrl(url)}/auth/v1/user`, {
    headers: authHeaders(session.access_token, anonKey),
  });

  if (!response.ok) {
    throw new Error(`登录会话验证失败：${response.status}`);
  }

  const data = (await response.json()) as { id?: string; email?: string };
  if (typeof data.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id)) {
    throw new Error('服务器返回的用户 ID 无效。');
  }
  return {
    user_id: data.id,
    email: data.email ?? session.email ?? null,
  };
}

async function persistSessionWithProfile(url: string, anonKey: string, session: SupabaseSession, scope?: string): Promise<SupabaseSession> {
  const enriched = {
    ...session,
    ...(await fetchUserProfile(url, anonKey, session)),
  };
  return saveSupabaseSession(enriched, { url, scope });
}

async function refreshSupabaseSession(url: string, anonKey: string, session: SupabaseSession): Promise<SupabaseSession> {
  const origin = await getAppState();
  if (origin.account_user_id !== session.user_id || normalizeUrl(origin.supabase.url ?? '') !== normalizeUrl(url)) throw new Error('刷新期间账号或项目已切换。');
  if (!session.refresh_token) {
    throw new Error('登录态已过期，请重新登录。');
  }

  const response = await fetch(`${normalizeUrl(url)}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    await clearSupabaseSession(origin.account_scope);
    throw new Error(String(body?.msg ?? body?.error_description ?? body?.error ?? '登录态已过期，请重新登录。'));
  }

  return persistSessionWithProfile(url, anonKey, {
    access_token: String(body.access_token),
    refresh_token: body.refresh_token ? String(body.refresh_token) : session.refresh_token,
    expires_at: typeof body.expires_at === 'number' ? body.expires_at : null,
    token_type: body.token_type ? String(body.token_type) : 'bearer',
    user_id: body.user?.id ? String(body.user.id) : session.user_id,
    email: body.user?.email ? String(body.user.email) : session.email,
  }, origin.account_scope);
}

async function ensureValidSupabaseSession(url: string, anonKey: string): Promise<SupabaseSession> {
  const session = await getSupabaseSession();
  if (!session?.access_token) {
    throw new Error('尚未登录。请先登录 Supabase。');
  }

  const expiresAt = session.expires_at ?? null;
  if (expiresAt && Date.now() >= expiresAt * 1000 - 60_000) {
    return refreshSupabaseSession(url, anonKey, session);
  }

  return session;
}

export async function importSupabaseSession(raw: string): Promise<SupabaseSession> {
  const parsed = parseSupabaseCallbackPayload(raw);
  if (!parsed) {
    throw new Error('无法解析会话。请粘贴登录回调 URL、hash 片段，或 access_token JSON。');
  }

  const config = await getSupabaseConfig();
  if (!config.url || !config.anon_key) {
    throw new Error('请先保存 Supabase URL 和 Anon Key。');
  }

  const enriched = {
    ...parsed,
    ...(await fetchUserProfile(config.url, config.anon_key, parsed)),
  };

  return saveSupabaseSession(enriched, { url: config.url });
}

export async function signInWithPassword(email: string, password: string): Promise<SupabaseSession> {
  const config = await getSupabaseConfig();
  if (!config.url || !config.anon_key) {
    throw new Error('Supabase 连接信息未配置。');
  }

  const response = await fetch(`${normalizeUrl(config.url)}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.anon_key,
      Authorization: `Bearer ${config.anon_key}`,
    },
    body: JSON.stringify({ email, password }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(body?.msg ?? body?.error_description ?? body?.error ?? `登录失败: ${response.status}`));
  }

  return persistSessionWithProfile(config.url, config.anon_key, {
    access_token: String(body.access_token ?? ''),
    refresh_token: body.refresh_token ? String(body.refresh_token) : null,
    expires_at: typeof body.expires_at === 'number' ? body.expires_at : null,
    token_type: body.token_type ? String(body.token_type) : 'bearer',
    user_id: body.user?.id ? String(body.user.id) : null,
    email: body.user?.email ? String(body.user.email) : email,
  });
}

export async function signUpWithPassword(email: string, password: string): Promise<{
  session: SupabaseSession | null;
  needsEmailConfirmation: boolean;
}> {
  const config = await getSupabaseConfig();
  if (!config.url || !config.anon_key) {
    throw new Error('Supabase 连接信息未配置。');
  }

  const response = await fetch(`${normalizeUrl(config.url)}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.anon_key,
      Authorization: `Bearer ${config.anon_key}`,
    },
    body: JSON.stringify({ email, password }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(body?.msg ?? body?.error_description ?? body?.error ?? `注册失败: ${response.status}`));
  }

  if (!body.access_token) {
    return {
      session: null,
      needsEmailConfirmation: true,
    };
  }

  const session = await persistSessionWithProfile(config.url, config.anon_key, {
    access_token: String(body.access_token),
    refresh_token: body.refresh_token ? String(body.refresh_token) : null,
    expires_at: typeof body.expires_at === 'number' ? body.expires_at : null,
    token_type: body.token_type ? String(body.token_type) : 'bearer',
    user_id: body.user?.id ? String(body.user.id) : null,
    email: body.user?.email ? String(body.user.email) : email,
  });

  return {
    session,
    needsEmailConfirmation: false,
  };
}

export async function verifySupabaseConnection(
  override?: { url?: string | null; anon_key?: string | null }
): Promise<{
  reachable: boolean;
  authenticated: boolean;
  message: string;
}> {
  const baseConfig = await getSupabaseConfig();
  const config = {
    url: override?.url?.trim() || baseConfig.url,
    anon_key: override?.anon_key?.trim() || baseConfig.anon_key,
  };

  if (!config.url || !config.anon_key) {
    return {
      reachable: false,
      authenticated: false,
      message: '缺少 Supabase URL 或 Anon Key。',
    };
  }

  const settingsResponse = await fetch(`${normalizeUrl(config.url)}/auth/v1/settings`, {
    headers: {
      apikey: config.anon_key,
      Authorization: `Bearer ${config.anon_key}`,
    },
  });

  if (!settingsResponse.ok) {
    return {
      reachable: false,
      authenticated: false,
      message: `连接失败：Supabase 返回 ${settingsResponse.status}`,
    };
  }

  const stored = await getSupabaseSession();
  if (!stored?.access_token || (override?.url && normalizeUrl(override.url) !== normalizeUrl(baseConfig.url ?? ''))) {
    return {
      reachable: true,
      authenticated: false,
      message: '连接成功，当前未登录。',
    };
  }

  let session: SupabaseSession;
  try { session = await ensureValidSupabaseSession(config.url, config.anon_key); }
  catch { return { reachable: true, authenticated: false, message: '连接成功，但登录态无效或已过期。' }; }
  const userResponse = await fetch(`${normalizeUrl(config.url)}/auth/v1/user`, {
    headers: authHeaders(session.access_token, config.anon_key),
  });

  if (!userResponse.ok) {
    return {
      reachable: true,
      authenticated: false,
      message: '连接成功，但当前登录态无效或已过期。',
    };
  }

  return {
    reachable: true,
    authenticated: true,
    message: '连接成功，当前登录态有效。',
  };
}

export async function signOutSupabase(): Promise<void> {
  const origin = await getAppState();
  const config = await getSupabaseConfig();
  const session = await getSupabaseSession();

  if (config.url && config.anon_key && session?.access_token) {
    try {
      await fetch(`${normalizeUrl(config.url)}/auth/v1/logout`, {
        method: 'POST',
        headers: authHeaders(session.access_token, config.anon_key),
      });
    } catch {
      // ignore remote logout failures
    }
  }

  await clearSupabaseSession(origin.account_scope);
}

export function localDocumentToRemote(document: SyncDocumentRecord) {
  const content = JSON.parse(document.content_json);
  if (!content || Array.isArray(content) || content.type !== 'doc' || !Array.isArray(content.content)) {
    throw new Error('本地正文不是有效的 Tiptap doc 对象。');
  }
  return { ...document, content_json: content };
}

export function remoteDocumentToLocal(document: Record<string, unknown>): SyncDocumentRecord {
  const content = typeof document.content_json === 'string' ? JSON.parse(document.content_json) : document.content_json;
  if (!content || typeof content !== 'object' || Array.isArray(content) ||
      (content as Record<string, unknown>).type !== 'doc' || !Array.isArray((content as Record<string, unknown>).content)) {
    throw new Error('远端正文不是有效的 Tiptap doc 对象。');
  }
  if (typeof document.id !== 'string' || !Number.isSafeInteger(document.revision) || Number(document.revision) < 1 ||
      !['document', 'folder'].includes(String(document.node_kind)) ||
      !['active', 'archived', 'trashed'].includes(String(document.status)) ||
      !Number.isInteger(document.depth) || Number(document.depth) < 0 || Number(document.depth) > 7 ||
      !Array.isArray(document.tags) || !document.tags.every(tag => typeof tag === 'string')) {
    throw new Error('远端文档字段无效；未应用此次同步。');
  }
  return {
    id: document.id, revision: Number(document.revision), mutation_id: String(document.last_mutation_id ?? ''),
    is_purged: document.is_purged === true, title: String(document.title ?? 'Untitled'),
    node_kind: document.node_kind as SyncDocumentRecord['node_kind'],
    parent_id: document.parent_id ? String(document.parent_id) : null, depth: Number(document.depth),
    content_json: JSON.stringify(content), plain_text: String(document.plain_text ?? ''),
    status: String(document.status), is_favorite: document.is_favorite === true, is_template: document.is_template === true,
    created_at: String(document.created_at), updated_at: String(document.updated_at),
    archived_at: document.archived_at ? String(document.archived_at) : null,
    deleted_at: document.deleted_at ? String(document.deleted_at) : null, tags: document.tags as string[],
  };
}

type SyncDependencies = {
  getConfig: typeof getSupabaseConfig;
  getState: typeof getAppState;
  ensureSession: typeof ensureValidSupabaseSession;
  exportDocuments: typeof exportSyncDocuments;
  apply: typeof applyRemoteDocuments;
  finalize: typeof finalizeSyncJobs;
  flushDrafts: () => Promise<void>;
  request: typeof fetch;
};

/** Injectable boundary for protocol regressions; production calls the native data layer. */
export async function executeSupabaseSync(deps: SyncDependencies): Promise<SyncSnapshot> {
  const config = await deps.getConfig();
  if (!config.url || !config.anon_key) throw new Error('Supabase 连接信息未配置。');
  const session = await deps.ensureSession(config.url, config.anon_key);
  if (!session.user_id) throw new Error('会话缺少 user_id，请重新登录。');
  const state = await deps.getState();
  if (state.account_user_id !== session.user_id || normalizeUrl(state.supabase.url ?? '') !== normalizeUrl(config.url)) {
    throw new Error('账号或项目在登录验证期间已切换。');
  }
  const scope = state.account_scope;
  let jobs: number[] = [];
  const assertScope = async () => {
    if ((await deps.getState()).account_scope !== scope) throw new Error('账号空间已切换，已停止旧账号同步。');
  };
  const rpc = async (name: string, body: Record<string, unknown> = {}) => {
    await assertScope();
    const response = await deps.request(`${normalizeUrl(config.url!)}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: authHeaders(session.access_token, config.anon_key!), body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error((await response.text()) || `同步失败：HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  };
  let snapshotId: string | undefined;
  try {
    await deps.flushDrafts();
    const before = await deps.exportDocuments();
    if (before.account_scope !== scope) throw new Error('账号空间已切换。');
    jobs = before.pending_job_ids;
    const snapshot = await rpc('vana_open_pull_snapshot');
    if (!snapshot || typeof snapshot.snapshot_id !== 'string' || !Number.isSafeInteger(snapshot.total) || snapshot.total < 0) {
      throw new Error('同步快照格式无效；请更新服务端迁移。');
    }
    snapshotId = snapshot.snapshot_id;
    const remote: SyncDocumentRecord[] = [];
    for (let offset = 0; offset < snapshot.total; offset += 500) {
      const page = await rpc('vana_pull_snapshot_page', { snapshot_id: snapshotId, page_offset: offset });
      if (!Array.isArray(page) || page.length !== Math.min(500, snapshot.total - offset)) throw new Error('下行分页不完整。');
      remote.push(...page.map(remoteDocumentToLocal));
    }
    await rpc('vana_close_pull_snapshot', { snapshot_id: snapshotId }); snapshotId = undefined;
    await deps.flushDrafts();
    await assertScope();
    const applied = await deps.apply(remote, scope);
    const local = await deps.exportDocuments();
    if (local.account_scope !== scope) throw new Error('账号空间已切换。');
    jobs = local.pending_job_ids;
    let acknowledgements: SyncDocumentRecord[] = [];
    if (local.documents.length > 0) {
      const result = await rpc('vana_push_documents', { changes: local.documents.map(localDocumentToRemote) });
      if (!result?.accepted) throw new Error('云端出现并发修改，本地修改仍保留。请再次同步以生成冲突副本。');
      if (!Array.isArray(result.documents) || result.documents.length !== local.documents.length) throw new Error('云端确认不完整。');
      acknowledgements = result.documents.map(remoteDocumentToLocal);
      const ids = new Set(acknowledgements.map(d => d.id));
      if (ids.size !== local.documents.length || local.documents.some(d => !ids.has(d.id))) throw new Error('云端确认 ID 不匹配。');
    }
    await assertScope();
    return await deps.finalize(jobs, scope, true, null, new Date().toISOString(), acknowledgements, applied.conflict_copies);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try { await deps.finalize(jobs, scope, false, message); } catch { /* Scope changes must not write new-account status. */ }
    throw new Error(message);
  } finally {
    if (snapshotId) { try { await rpc('vana_close_pull_snapshot', { snapshot_id: snapshotId }); } catch {} }
  }
}

let activeSync: Promise<SyncSnapshot> | undefined;
export function runSupabaseSync(): Promise<SyncSnapshot> {
  if (activeSync) return activeSync;
  const promise = executeSupabaseSync({
    getConfig: getSupabaseConfig, getState: getAppState, ensureSession: ensureValidSupabaseSession,
    exportDocuments: exportSyncDocuments, apply: applyRemoteDocuments, finalize: finalizeSyncJobs,
    flushDrafts: async () => { const { documentDrafts } = await import('./documentDrafts'); await documentDrafts.flushAll(); },
    request: (...args) => fetch(...args),
  }).finally(() => { if (activeSync === promise) activeSync = undefined; });
  activeSync = promise;
  return promise;
}
