import {
  applyRemoteDocuments,
  authenticateSupabase,
  importSessionNative,
  refreshSessionNative,
  logoutNative,
  exportSyncDocuments,
  finalizeSyncJobs,
  getSupabaseConfig,
  getAppState,
  getSupabaseSession,
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

async function ensureValidSupabaseSession(url: string, _anonKey: string): Promise<SupabaseSession> {
  const session = await getSupabaseSession();
  if (!session?.access_token) throw new Error('尚未登录。请先登录 Supabase。');
  if (session.expires_at && Date.now() >= session.expires_at * 1000 - 60_000) {
    const origin = await getAppState();
    if (origin.account_user_id !== session.user_id || normalizeUrl(origin.supabase.url ?? '') !== normalizeUrl(url)) throw new Error('刷新期间账号或项目已切换。');
    return refreshSessionNative(url, origin.account_scope);
  }
  return session;
}

export async function importSupabaseSession(raw: string): Promise<SupabaseSession> {
  return importSessionNative(raw);
}

export async function signInWithPassword(email: string, password: string): Promise<SupabaseSession> {
  const result = await authenticateSupabase(email, password, false);
  if (!result.session) throw new Error('登录响应缺少会话');
  return result.session;
}

export async function signUpWithPassword(email: string, password: string): Promise<{ session: SupabaseSession | null; needsEmailConfirmation: boolean }> {
  return authenticateSupabase(email, password, true);
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
  await logoutNative();
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
