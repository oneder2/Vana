import { invoke } from '@tauri-apps/api/core';

export interface FileInfo {
  name: string;
  path: string;
  is_directory: boolean;
  is_file: boolean;
}

export interface GitStatus {
  has_changes: boolean;
  is_clean: boolean;
}

export interface RepositoryVerification {
  is_initialized: boolean;
  has_commits: boolean;
  commit_count: number;
  latest_commit_sha: string | null;
  latest_commit_message: string | null;
  latest_commit_time: string | null;
}

export interface CommitInfo {
  sha: string;
  message: string;
  time: string;
  author: string;
}

export interface AtmosphereConfig {
  theme: string;
}

export interface WorkspaceConfig {
  commit_scope: 'workspace' | 'directory';
  auto_commit_interval: number;
}

export interface LibraryEntry {
  favorite: boolean;
  archived_at: string | null;
  last_opened_at: string | null;
  trashed_at: string | null;
  original_path: string | null;
  title_override: string | null;
}

export interface LibraryMetadata {
  entries: Record<string, LibraryEntry>;
}

export interface DocumentSummary {
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
  refresh_token: string | null;
  expires_at: number | null;
  token_type: string | null;
  user_id: string | null;
  email: string | null;
}

export interface SyncSnapshot {
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

export interface SyncExport {
  pending_job_ids: number[];
  documents: SyncDocumentRecord[];
  last_pulled_at: string | null;
}

export interface RemoteConnectionStatus {
  reachable: boolean;
  authenticated: boolean;
  message: string;
}

export interface SyncConflictFile {
  path: string;
  ours: string;
  theirs: string;
}

export interface SyncConflict {
  files: SyncConflictFile[];
}

export type ConflictResolutionChoice = 'Ours' | 'Theirs' | 'CopyBoth';

export interface ConflictResolutionItem {
  path: string;
  choice: ConflictResolutionChoice;
}

export interface SyncResult {
  success: boolean;
  message: string;
  conflict: SyncConflict | null;
}

export interface SearchMatch {
  line: number;
  column: number;
  context: string;
}

export interface SearchResult {
  file_path: string;
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

export async function getAppState(): Promise<AppState> {
  return invoke<AppState>('get_app_state_command');
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
  return invoke<DocumentRecord>('create_document_command', {
    title: options.title ?? null,
    isTemplate: options.isTemplate ?? false,
    nodeKind: options.nodeKind ?? 'document',
    parentId: options.parentId ?? null,
  });
}

export async function moveDocument(id: string, parentId?: string | null): Promise<DocumentRecord> {
  return invoke<DocumentRecord>('move_document_command', {
    id,
    parentId: parentId ?? null,
  });
}

export async function saveDocument(input: SaveDocumentInput): Promise<DocumentRecord> {
  return invoke<DocumentRecord>('save_document_command', { input });
}

export async function setDocumentStatus(id: string, status: 'active' | 'archived' | 'trashed'): Promise<DocumentRecord> {
  return invoke<DocumentRecord>('set_document_status_command', { id, status });
}

export async function toggleFavorite(id: string, favorite: boolean): Promise<DocumentRecord> {
  return invoke<DocumentRecord>('toggle_favorite_command', { id, favorite });
}

export async function listTags(): Promise<TagRecord[]> {
  return invoke<TagRecord[]>('list_tags_command');
}

export async function upsertTag(name: string, color?: string | null, id?: string): Promise<TagRecord> {
  return invoke<TagRecord>('upsert_tag_command', {
    id: id ?? null,
    name,
    color: color ?? null,
  });
}

export async function getSupabaseConfig(): Promise<SupabaseConfig> {
  return invoke<SupabaseConfig>('get_supabase_config_command');
}

export async function saveSupabaseConfig(config: SupabaseConfig): Promise<SupabaseConfig> {
  return invoke<SupabaseConfig>('save_supabase_config_command', { config });
}

export async function getSupabaseSession(): Promise<SupabaseSession | null> {
  return invoke<SupabaseSession | null>('get_supabase_session_command');
}

export async function saveSupabaseSession(session: SupabaseSession): Promise<SupabaseSession> {
  return invoke<SupabaseSession>('save_supabase_session_command', { session });
}

export async function clearSupabaseSession(): Promise<void> {
  return invoke<void>('clear_supabase_session_command');
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
  return invoke<SyncExport>('export_sync_documents_command');
}

export async function applyRemoteDocuments(documents: SyncDocumentRecord[]): Promise<number> {
  return invoke<number>('apply_remote_documents_command', { documents });
}

export async function finalizeSyncJobs(
  processedJobIds: number[],
  success: boolean,
  error?: string | null,
  pulledCursor?: string | null
): Promise<SyncSnapshot> {
  return invoke<SyncSnapshot>('finalize_sync_jobs_command', {
    processedJobIds,
    success,
    error: error ?? null,
    pulledCursor: pulledCursor ?? null,
  });
}

export async function importLegacyWorkspace(): Promise<LegacyImportResult> {
  return invoke<LegacyImportResult>('import_legacy_workspace_command');
}

export async function readWorkspaceConfig(): Promise<WorkspaceConfig> {
  return invoke<WorkspaceConfig>('read_workspace_config');
}

export async function writeWorkspaceConfig(config: WorkspaceConfig): Promise<void> {
  return invoke<void>('write_workspace_config', { config });
}

export async function readLibraryMetadata(): Promise<LibraryMetadata> {
  return invoke<LibraryMetadata>('read_library_metadata');
}

export async function writeLibraryMetadata(metadata: LibraryMetadata): Promise<void> {
  return invoke<void>('write_library_metadata', { metadata });
}

export async function readFile(path: string): Promise<string> {
  return invoke<string>('read_file', { path });
}

export async function writeFile(path: string, content: string): Promise<void> {
  return invoke<void>('write_file', { path, content });
}

export async function listDirectory(path: string): Promise<FileInfo[]> {
  return invoke<FileInfo[]>('list_directory_command', { path });
}

export async function createFile(path: string, content = ''): Promise<void> {
  return invoke<void>('create_file_command', { path, content });
}

export async function createDirectory(path: string): Promise<void> {
  return invoke<void>('create_directory_command', { path });
}

export async function deleteFile(path: string): Promise<void> {
  return invoke<void>('delete_file_command', { path });
}

export async function deleteDirectory(path: string): Promise<void> {
  return invoke<void>('delete_directory_command', { path });
}

export async function renameFileOrDirectory(oldPath: string, newPath: string): Promise<void> {
  return invoke<void>('rename_file_or_directory_command', {
    oldPath,
    newPath,
  });
}

export async function copyFileOrDirectory(sourcePath: string, destPath: string): Promise<void> {
  return invoke<void>('copy_file_or_directory_command', { sourcePath, destPath });
}

export async function moveFileOrDirectory(sourcePath: string, destPath: string): Promise<void> {
  return invoke<void>('move_file_or_directory_command', { sourcePath, destPath });
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

export async function getCommitHistory(_path: string, _limit?: number): Promise<CommitInfo[]> {
  return [];
}

export async function initRepository(_path: string): Promise<void> {
  return;
}

export async function commitChanges(_path: string, _message: string): Promise<string> {
  return 'git-mainline-removed';
}

export async function getRepositoryStatus(_path: string): Promise<GitStatus> {
  return { has_changes: false, is_clean: true };
}

export async function gitGc(_path: string): Promise<void> {
  return;
}

export async function verifyRepository(_path: string): Promise<RepositoryVerification> {
  return {
    is_initialized: false,
    has_commits: false,
    commit_count: 0,
    latest_commit_sha: null,
    latest_commit_message: null,
    latest_commit_time: null,
  };
}

export async function deleteFileWithGitSync(
  _workspacePath: string,
  path: string,
  _remoteName?: string,
  _branchName?: string,
  _patToken?: string
): Promise<void> {
  return deleteFile(path);
}

export async function deleteDirectoryWithGitSync(
  _workspacePath: string,
  path: string,
  _remoteName?: string,
  _branchName?: string,
  _patToken?: string
): Promise<void> {
  return deleteDirectory(path);
}

export async function renameFileWithGitSync(
  _workspacePath: string,
  oldPath: string,
  newPath: string,
  _remoteName?: string,
  _branchName?: string,
  _patToken?: string
): Promise<void> {
  return renameFileOrDirectory(oldPath, newPath);
}

export async function storePatToken(_token: string): Promise<void> {
  throw new Error('旧凭证导入入口已停用；当前主线请改用 Supabase 或主密钥迁移');
}

export async function getPatToken(): Promise<string | null> {
  return null;
}

export async function removePatToken(): Promise<void> {
  return;
}

export async function hasPatToken(): Promise<boolean> {
  return false;
}

export async function addRemote(_path: string, _name: string, _url: string): Promise<void> {
  throw new Error('旧远端仓库入口已停用；当前主线请改用 Supabase 配置');
}

export async function getRemoteUrl(_path: string, _name = 'origin'): Promise<string | null> {
  return null;
}

export async function removeRemote(_path: string, _name = 'origin'): Promise<void> {
  return;
}

export async function validateRemoteConnection(_path: string, _remoteName: string, _patToken?: string): Promise<RemoteConnectionStatus> {
  return {
    reachable: false,
    authenticated: false,
    message: '旧远端同步入口已停用，请改用 Supabase 配置',
  };
}

export async function fetchFromRemote(_path: string, _remoteName: string, _patToken?: string): Promise<void> {
  return;
}

export async function pushToRemote(_path: string, _remoteName: string, _branchName: string, _patToken?: string): Promise<void> {
  return;
}

export async function syncWithRemote(_path: string, _remoteName: string, _branchName: string, _patToken?: string): Promise<SyncResult> {
  return {
    success: false,
    message: '旧远端同步入口已停用',
    conflict: null,
  };
}

export async function beginSync(path: string, remoteName: string, branchName: string, patToken?: string): Promise<SyncResult> {
  return invoke<SyncResult>('begin_sync', {
    path,
    remoteName,
    branchName,
    patToken: patToken ?? null,
  });
}

export async function continueSync(path: string, branchName: string): Promise<SyncResult> {
  return invoke<SyncResult>('continue_sync_command', { path, branchName });
}

export async function abortSync(path: string): Promise<void> {
  return invoke<void>('abort_sync_command', { path });
}

export async function resolveConflict(path: string, items: ConflictResolutionItem[]): Promise<void> {
  return invoke<void>('resolve_conflict_command', { path, items });
}

export async function getCurrentBranch(_path: string): Promise<string> {
  return 'supabase-mainline';
}

export async function switchToBranch(_path: string, _branch: string): Promise<void> {
  return;
}
