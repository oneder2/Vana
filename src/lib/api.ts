import { invoke } from '@tauri-apps/api/core';

export interface AtmosphereConfig {
  theme: string;
}

export interface DocumentSummary {
  account_scope: string;
  id: string;
  title: string;
  node_kind: 'document' | 'folder';
  parent_id: string | null;
  depth: number;
  status: 'active' | 'archived' | 'trashed';
  is_favorite: boolean;
  is_template: boolean;
  updated_at: string;
  created_at: string;
  archived_at: string | null;
  deleted_at: string | null;
  tags: string[];
}

export interface DocumentRecord extends DocumentSummary {
  content_generation: number;
  content_json: string;
  plain_text: string;
}

export interface TagRecord {
  id: string;
  name: string;
  color: string | null;
  document_count: number;
}

export interface SupabaseConfig {
  url: string | null;
  anon_key: string | null;
}

export interface SupabaseSession {
  access_token: string;
  expires_at: number | null;
  token_type: string | null;
  user_id: string | null;
  email: string | null;
}

export interface SyncSnapshot {
  conflict_copies?: number;
  mode: string;
  pending_jobs: number;
  last_synced_at: string | null;
  last_pulled_at: string | null;
  auto_sync_enabled: boolean;
  last_error: string | null;
}

export interface UsageLimits {
  max_document_content_bytes: number;
  max_total_storage_bytes: number;
  max_document_count: number;
  max_write_ops_per_5_minutes: number;
  attachments_enabled: boolean;
  current_document_count: number;
  current_total_storage_bytes: number;
  current_write_ops_last_5_minutes: number;
}

export interface AppState {
  account_user_id: string | null;
  account_scope: string;
  recovery_available: boolean;
  account_mode: string;
  onboarding_completed: boolean;
  service_profile: string;
  account_email: string | null;
  local_db_path: string;
  legacy_workspace_path: string;
  supabase: SupabaseConfig;
  sync: SyncSnapshot;
  limits: UsageLimits;
}

export interface SaveDocumentInput {
  content_generation: number;
  account_scope: string;
  id: string;
  title: string;
  content_json: string;
  plain_text: string;
  tags: string[];
}

export interface CreateDocumentOptions {
  title?: string;
  isTemplate?: boolean;
  nodeKind?: 'document' | 'folder';
  parentId?: string | null;
}

export interface LegacyImportResult {
  imported_documents: number;
  skipped_entries: number;
  imported_paths: string[];
}

export interface SyncDocumentRecord {
  mutation_id: string;
  revision: number;
  is_purged: boolean;
  id: string;
  title: string;
  node_kind: 'document' | 'folder';
  parent_id: string | null;
  depth: number;
  content_json: string;
  plain_text: string;
  status: string;
  is_favorite: boolean;
  is_template: boolean;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
  tags: string[];
}

export interface SyncDocumentStructure {
  id: string;
  node_kind: 'document' | 'folder';
  parent_id: string | null;
  depth: number;
}

export interface SyncExport {
  account_scope: string;
  pending_job_ids: number[];
  documents: SyncDocumentRecord[];
  last_pulled_at: string | null;
}

export interface SearchMatch {
  line: number;
  column: number;
  context: string;
}

export interface SearchResult {
  document_id: string;
  title: string;
  matches: SearchMatch[];
}

export async function getPlatform(): Promise<'windows' | 'linux' | 'android'> {
  return invoke<'windows' | 'linux' | 'android'>('get_platform');
}

export async function ensureWorkspaceInitialized(): Promise<void> {
  return invoke<void>('ensure_workspace_initialized');
}

export async function getWorkspacePath(): Promise<string> {
  return invoke<string>('get_workspace_path');
}

let accountScope: string | undefined;
export function getCachedAccountScope() { return accountScope; }
export async function getAppState(): Promise<AppState> {
  const state = await invoke<AppState>('get_app_state_command');
  accountScope = state.account_scope;
  return state;
}
async function expectedScope() {
  return accountScope ?? (await getAppState()).account_scope;
}
async function flushBeforeAccountChange() {
  const { documentDrafts } = await import('./documentDrafts');
  await documentDrafts.flushAll();
}


export async function listDocuments(status?: 'active' | 'archived' | 'trashed'): Promise<DocumentSummary[]> {
  return invoke<DocumentSummary[]>('list_documents_command', { status: status ?? null });
}

export async function getDocument(id: string): Promise<DocumentRecord | null> {
  return invoke<DocumentRecord | null>('get_document_command', { id });
}

export async function createDocument(
  titleOrOptions?: string | CreateDocumentOptions,
  isTemplate = false
): Promise<DocumentRecord> {
  const options: CreateDocumentOptions =
    typeof titleOrOptions === 'string'
      ? { title: titleOrOptions, isTemplate }
      : (titleOrOptions ?? {});
  return invoke<DocumentRecord>('create_document_command', { expectedScope: await expectedScope(),
    title: options.title ?? null,
    isTemplate: options.isTemplate ?? false,
    nodeKind: options.nodeKind ?? 'document',
    parentId: options.parentId ?? null,
  });
}

export async function moveDocument(id: string, parentId?: string | null): Promise<DocumentRecord> {
  return invoke<DocumentRecord>('move_document_command', { expectedScope: await expectedScope(),
    id,
    parentId: parentId ?? null,
  });
}

export async function saveDocument(input: SaveDocumentInput): Promise<DocumentRecord> {
  return invoke<DocumentRecord>('save_document_command', { input });
}

export async function setDocumentStatus(id: string, status: 'active' | 'archived' | 'trashed'): Promise<DocumentRecord> {
  return invoke<DocumentRecord>('set_document_status_command', { expectedScope: await expectedScope(), id, status });
}

export async function toggleFavorite(id: string, favorite: boolean): Promise<DocumentRecord> {
  return invoke<DocumentRecord>('toggle_favorite_command', { expectedScope: await expectedScope(), id, favorite });
}

export async function recoverLocalDocuments(source: 'guest' | 'legacy'): Promise<number> {
  await flushBeforeAccountChange();
  return invoke<number>('recover_local_documents_command', { source, expectedScope: await expectedScope() });
}

export async function permanentlyDeleteDocument(id: string): Promise<void> {
  await flushBeforeAccountChange();
  return invoke<void>('permanently_delete_document_command', { id, expectedScope: await expectedScope() });
}

export async function listTags(): Promise<TagRecord[]> {
  return invoke<TagRecord[]>('list_tags_command');
}

export interface DocumentHistoryEntry {
  id: string;
  created_at: string;
  content_json: string;
}

export async function listDocumentHistory(id: string, scope: string): Promise<DocumentHistoryEntry[]> {
  return invoke<DocumentHistoryEntry[]>('list_document_history_command', { id, expectedScope: scope });
}

export async function restoreDocumentHistory(document: DocumentRecord, historyId: string): Promise<DocumentRecord> {
  return invoke<DocumentRecord>('restore_document_history_command', { input: {
    account_scope: document.account_scope,
    document_id: document.id,
    history_id: historyId,
    content_generation: document.content_generation,
    expected_content_json: document.content_json,
  } });
}

export interface BackupPreview {
  created_at: string; documents: number; folders: number; tags: number;
  retained_history: number; discarded_history: number; titles: string[];
}
export interface BackupImportResult {
  documents: number; folders: number; retained_history: number; first_document_id: string | null;
}
export async function exportSpaceBackup(scope: string): Promise<string> {
  return invoke<string>('export_space_backup_command', { expectedScope: scope });
}
export async function previewSpaceBackup(scope: string, json: string): Promise<BackupPreview> {
  return invoke<BackupPreview>('preview_space_backup_command', { expectedScope: scope, json });
}
export async function importSpaceBackup(scope: string, json: string): Promise<BackupImportResult> {
  return invoke<BackupImportResult>('import_space_backup_command', { expectedScope: scope, json });
}
export async function shareSpaceBackup(path: string): Promise<void> {
  return invoke<void>('share_space_backup_command', { path });
}

export interface DocumentConflict {
  copy: DocumentRecord; original: DocumentRecord | null;
  reason: 'concurrent-tree-change' | 'edit-during-sync' | 'cloud-edit-during-delete' | 'name-marker';
  created_at: string;
}
export interface DocumentConflictSummary {
  copy_id: string; title: string; reason: DocumentConflict['reason']; created_at: string;
}
export async function listDocumentConflicts(scope: string): Promise<DocumentConflictSummary[]> {
  return invoke<DocumentConflictSummary[]>('list_document_conflicts_command', { expectedScope: scope });
}
export async function getDocumentConflict(scope: string, copyId: string): Promise<DocumentConflict> {
  return invoke<DocumentConflict>('get_document_conflict_command', { expectedScope: scope, copyId });
}
export async function acknowledgeDocumentConflict(scope: string, copyId: string): Promise<void> {
  return invoke<void>('acknowledge_document_conflict_command', { expectedScope: scope, copyId });
}

export async function upsertTag(name: string, color?: string | null, id?: string): Promise<TagRecord> {
  return invoke<TagRecord>('upsert_tag_command', { expectedScope: await expectedScope(),
    id: id ?? null,
    name,
    color: color ?? null,
  });
}

export async function getSupabaseConfig(): Promise<SupabaseConfig> {
  return invoke<SupabaseConfig>('get_supabase_config_command');
}

export async function saveSupabaseConfig(config: SupabaseConfig): Promise<SupabaseConfig> {
  await flushBeforeAccountChange();
  const result = await invoke<SupabaseConfig>('save_supabase_config_command', { config });
  accountScope = undefined;
  await getAppState();
  return result;
}

export async function getSupabaseSession(): Promise<SupabaseSession | null> {
  return invoke<SupabaseSession | null>('get_supabase_session_command');
}

export async function authenticateSupabase(email: string, password: string, register: boolean): Promise<{ session: SupabaseSession | null; needsEmailConfirmation: boolean }> {
  const origin = await getAppState();
  if (!origin.supabase.url || !origin.supabase.anon_key) throw new Error('Supabase 连接信息未配置。');
  await flushBeforeAccountChange();
  const result = await invoke<{ session: SupabaseSession | null; needsEmailConfirmation: boolean }>('authenticate_supabase_command', {
    email, password, register, expectedProject: origin.supabase.url, expectedScope: origin.account_scope,
  });
  accountScope = undefined;
  await getAppState();
  return result;
}

export async function importSessionNative(raw: string): Promise<SupabaseSession> {
  const origin = await getAppState();
  if (!origin.supabase.url || !origin.supabase.anon_key) throw new Error('Supabase 连接信息未配置。');
  await flushBeforeAccountChange();
  const result = await invoke<SupabaseSession>('import_supabase_session_command', {
    raw, expectedProject: origin.supabase.url, expectedScope: origin.account_scope,
  });
  accountScope = undefined;
  await getAppState();
  return result;
}

export async function refreshSessionNative(project: string, scope: string): Promise<SupabaseSession> {
  return invoke<SupabaseSession>('refresh_supabase_session_command', { expectedProject: project, expectedScope: scope });
}

export async function logoutNative(): Promise<void> {
  const origin = await getAppState();
  await flushBeforeAccountChange();
  if (origin.account_mode === 'guest') return;
  await invoke<void>('logout_supabase_command', { expectedProject: origin.supabase.url, expectedScope: origin.account_scope });
  accountScope = undefined;
  await getAppState();
}

export async function clearSupabaseSession(scope?: string): Promise<void> {
  const targetScope = scope ?? await expectedScope();
  await flushBeforeAccountChange();
  const result = await invoke<void>('clear_supabase_session_command', { expectedScope: targetScope });
  accountScope = undefined;
  await getAppState();
  return result;
}

export async function completeOnboarding(): Promise<void> {
  return invoke<void>('complete_onboarding_command');
}

export async function markSyncAttempt(success: boolean, error?: string | null): Promise<SyncSnapshot> {
  return invoke<SyncSnapshot>('mark_sync_attempt_command', {
    success,
    error: error ?? null,
  });
}

export async function exportSyncDocuments(): Promise<SyncExport> {
  return invoke<SyncExport>('export_sync_documents_command', { expectedScope: await expectedScope() });
}

export async function exportDocumentStructures(): Promise<SyncDocumentStructure[]> {
  try {
    return await invoke<SyncDocumentStructure[]>('export_document_structures_command');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('not found')) {
      throw error;
    }
    return invoke<SyncDocumentStructure[]>('export_documents_structured_command');
  }
}

export async function applyRemoteDocuments(documents: SyncDocumentRecord[], scope: string): Promise<{ applied: number; conflict_copies: number }> {
  return invoke<{ applied: number; conflict_copies: number }>('apply_remote_documents_command', { documents, expectedScope: scope });
}

export async function finalizeSyncJobs(
  processedJobIds: number[],
  scope: string,
  success: boolean,
  error?: string | null,
  pulledCursor?: string | null,
  acknowledgements: SyncDocumentRecord[] = [],
  conflictCopies = 0
): Promise<SyncSnapshot> {
  return invoke<SyncSnapshot>('finalize_sync_jobs_command', {
    processedJobIds,
    acknowledgements,
    conflictCopies,
    expectedScope: scope,
    success,
    error: error ?? null,
    pulledCursor: pulledCursor ?? null,
  });
}

export async function importLegacyWorkspace(): Promise<LegacyImportResult> {
  return invoke<LegacyImportResult>('import_legacy_workspace_command', { expectedScope: await expectedScope() });
}

export async function readAtmosphereConfig(path: string): Promise<AtmosphereConfig> {
  return invoke<AtmosphereConfig>('read_atmosphere_config', { path });
}

export async function writeAtmosphereConfig(path: string, config: AtmosphereConfig): Promise<void> {
  return invoke<void>('write_atmosphere_config', { path, config });
}

export async function exportMasterKey(): Promise<string> {
  return invoke<string>('export_master_key_command');
}

export async function importMasterKey(keyBase64: string): Promise<void> {
  return invoke<void>('import_master_key_command', { keyBase64 });
}

export async function searchFiles(workspacePath: string, query: string): Promise<SearchResult[]> {
  return invoke<SearchResult[]>('search_files_command', { workspacePath, query });
}
