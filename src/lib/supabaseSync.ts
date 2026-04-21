import {
  applyRemoteDocuments,
  clearSupabaseSession,
  exportSyncDocuments,
  finalizeSyncJobs,
  getSupabaseConfig,
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
    return {};
  }

  const data = (await response.json()) as { id?: string; email?: string };
  return {
    user_id: data.id ?? session.user_id ?? null,
    email: data.email ?? session.email ?? null,
  };
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

  return saveSupabaseSession(enriched);
}

export async function signOutSupabase(): Promise<void> {
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

  await clearSupabaseSession();
}

function localDocumentToRemote(document: SyncDocumentRecord, userId: string) {
  return {
    id: document.id,
    user_id: userId,
    title: document.title,
    node_kind: document.node_kind,
    parent_id: document.parent_id,
    depth: document.depth,
    content_json: document.content_json,
    plain_text: document.plain_text,
    status: document.status,
    is_favorite: document.is_favorite,
    is_template: document.is_template,
    created_at: document.created_at,
    updated_at: document.updated_at,
    archived_at: document.archived_at,
    deleted_at: document.deleted_at,
    tags: document.tags,
  };
}

function remoteDocumentToLocal(document: Record<string, unknown>): SyncDocumentRecord {
  return {
    id: String(document.id ?? ''),
    title: String(document.title ?? 'Untitled'),
    node_kind: String(document.node_kind ?? 'document') as SyncDocumentRecord['node_kind'],
    parent_id: document.parent_id ? String(document.parent_id) : null,
    depth: Number(document.depth ?? 0),
    content_json: String(document.content_json ?? '{"type":"doc","content":[{"type":"paragraph","content":[]}]}'),
    plain_text: String(document.plain_text ?? ''),
    status: String(document.status ?? 'active'),
    is_favorite: Boolean(document.is_favorite),
    is_template: Boolean(document.is_template),
    created_at: String(document.created_at ?? new Date().toISOString()),
    updated_at: String(document.updated_at ?? new Date().toISOString()),
    archived_at: document.archived_at ? String(document.archived_at) : null,
    deleted_at: document.deleted_at ? String(document.deleted_at) : null,
    tags: Array.isArray(document.tags) ? document.tags.map(String) : [],
  };
}

export async function runSupabaseSync(): Promise<SyncSnapshot> {
  const config = await getSupabaseConfig();
  const session = await getSupabaseSession();

  if (!config.url || !config.anon_key) {
    throw new Error('Supabase 连接信息未配置。');
  }
  if (!session?.access_token) {
    throw new Error('尚未登录。请先导入 Supabase 会话。');
  }

  const userId = session.user_id;
  if (!userId) {
    throw new Error('会话缺少 user_id，请重新导入。');
  }

  const local = await exportSyncDocuments();
  if (local.documents.length > 0) {
    const upsertResponse = await fetch(
      `${normalizeUrl(config.url)}/rest/v1/documents?on_conflict=id,user_id`,
      {
        method: 'POST',
        headers: {
          ...authHeaders(session.access_token, config.anon_key),
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(local.documents.map((document) => localDocumentToRemote(document, userId))),
      }
    );

    if (!upsertResponse.ok) {
      const message = await upsertResponse.text();
      return finalizeSyncJobs(local.pending_job_ids, false, message || '上行同步失败');
    }
  }

  const remoteQuery = new URLSearchParams({
    select: 'id,title,content_json,plain_text,status,is_favorite,is_template,created_at,updated_at,archived_at,deleted_at,tags',
    user_id: `eq.${userId}`,
    order: 'updated_at.asc',
  });
  if (local.last_pulled_at) {
    remoteQuery.set('updated_at', `gt.${local.last_pulled_at}`);
  }

  const pullResponse = await fetch(
    `${normalizeUrl(config.url)}/rest/v1/documents?${remoteQuery.toString()}`,
    {
      headers: authHeaders(session.access_token, config.anon_key),
    }
  );

  if (!pullResponse.ok) {
    const message = await pullResponse.text();
    return finalizeSyncJobs(local.pending_job_ids, false, message || '下行同步失败');
  }

  const remoteDocuments = ((await pullResponse.json()) as Record<string, unknown>[]).map(remoteDocumentToLocal);
  const pulledCursor =
    remoteDocuments.length > 0
      ? remoteDocuments[remoteDocuments.length - 1]?.updated_at ?? local.last_pulled_at
      : local.last_pulled_at;
  await applyRemoteDocuments(remoteDocuments);
  return finalizeSyncJobs(local.pending_job_ids, true, null, pulledCursor ?? null);
}
