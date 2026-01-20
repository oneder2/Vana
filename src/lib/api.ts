/**
 * No Visitors - Tauri API 封装
 * 封装所有 Tauri 命令调用，提供类型安全的 API 接口
 */

import { invoke } from '@tauri-apps/api/core';

// 文件信息接口
export interface FileInfo {
  name: string;
  path: string;
  is_directory: boolean;
  is_file: boolean;
}

// Git 状态接口
export interface GitStatus {
  has_changes: boolean;
  is_clean: boolean;
}

// 仓库验证信息接口
export interface RepositoryVerification {
  is_initialized: boolean;
  has_commits: boolean;
  commit_count: number;
  latest_commit_sha: string | null;
  latest_commit_message: string | null;
  latest_commit_time: string | null;
}

// 提交信息接口
export interface CommitInfo {
  sha: string;
  message: string;
  time: string;
  author: string;
}

// 氛围协议配置接口
export interface AtmosphereConfig {
  theme: string;
}

// 工作区配置接口
export interface WorkspaceConfig {
  commit_scope: 'workspace' | 'directory';
  auto_commit_interval: number;
}

/**
 * 读取加密文件
 * @param path 文件路径
 * @returns 解密后的文件内容
 */
export async function readFile(path: string): Promise<string> {
  return await invoke<string>('read_file', { path });
}

/**
 * 写入加密文件
 * @param path 文件路径
 * @param content 要写入的内容
 */
export async function writeFile(path: string, content: string): Promise<void> {
  return await invoke<void>('write_file', { path, content });
}

/**
 * 列出目录内容
 * @param path 目录路径
 * @returns 文件信息列表
 */
export async function listDirectory(path: string): Promise<FileInfo[]> {
  return await invoke<FileInfo[]>('list_directory_command', { path });
}

/**
 * 初始化 Git 仓库
 * @param path 仓库路径
 */
export async function initRepository(path: string): Promise<void> {
  return await invoke<void>('init_repository_command', { path });
}

/**
 * 提交更改（全局提交）
 * 
 * 在工作区根目录执行全局提交，等价于：
 * `git add . && git commit -m "[message]"`
 * 
 * 会提交工作区中所有文件的变更，包括新增、修改、删除和重命名。
 * 
 * @param path 仓库路径（工作区根目录）
 * @param message 提交消息
 * @returns 提交的 SHA
 */
export async function commitChanges(path: string, message: string): Promise<string> {
  return await invoke<string>('commit_changes_command', { path, message });
}

/**
 * 获取仓库状态
 * @param path 仓库路径
 * @returns 仓库状态
 */
export async function getRepositoryStatus(path: string): Promise<GitStatus> {
  return await invoke<GitStatus>('get_repository_status_command', { path });
}

/**
 * 执行 Git GC
 * @param path 仓库路径
 */
export async function gitGc(path: string): Promise<void> {
  return await invoke<void>('git_gc_command', { path });
}

/**
 * 验证 Git 仓库
 * @param path 仓库路径
 * @returns 仓库验证信息
 */
export async function verifyRepository(path: string): Promise<RepositoryVerification> {
  return await invoke<RepositoryVerification>('verify_repository_command', { path });
}

/**
 * 获取提交历史
 * @param path 仓库路径
 * @param limit 返回的最大提交数量（可选，默认10）
 * @returns 提交历史列表
 */
export async function getCommitHistory(path: string, limit?: number): Promise<CommitInfo[]> {
  return await invoke<CommitInfo[]>('get_commit_history_command', { path, limit });
}

/**
 * 读取氛围协议配置
 * @param path 目录路径
 * @returns 氛围协议配置
 */
export async function readAtmosphereConfig(path: string): Promise<AtmosphereConfig> {
  return await invoke<AtmosphereConfig>('read_atmosphere_config', { path });
}

/**
 * 写入氛围协议配置
 * @param path 目录路径
 * @param config 氛围协议配置
 */
export async function writeAtmosphereConfig(
  path: string,
  config: AtmosphereConfig
): Promise<void> {
  return await invoke<void>('write_atmosphere_config', { path, config });
}

/**
 * 获取平台信息
 * @returns 平台字符串 ("windows" | "linux" | "android")
 */
export async function getPlatform(): Promise<'windows' | 'linux' | 'android'> {
  return await invoke<'windows' | 'linux' | 'android'>('get_platform');
}

/**
 * 获取工作区路径
 * @returns 工作区路径
 */
export async function getWorkspacePath(): Promise<string> {
  return await invoke<string>('get_workspace_path');
}

/**
 * 确保工作区已初始化
 */
export async function ensureWorkspaceInitialized(): Promise<void> {
  return await invoke<void>('ensure_workspace_initialized');
}

/**
 * 读取工作区配置
 * @returns 工作区配置
 */
export async function readWorkspaceConfig(): Promise<WorkspaceConfig> {
  return await invoke<WorkspaceConfig>('read_workspace_config');
}

/**
 * 写入工作区配置
 * @param config 工作区配置
 */
export async function writeWorkspaceConfig(config: WorkspaceConfig): Promise<void> {
  return await invoke<void>('write_workspace_config', { config });
}

/**
 * 创建新文件
 * @param path 文件路径
 * @param content 初始内容
 */
export async function createFile(path: string, content: string = ''): Promise<void> {
  return await invoke<void>('create_file_command', { path, content });
}

/**
 * 创建新目录
 * @param path 目录路径
 */
export async function createDirectory(path: string): Promise<void> {
  return await invoke<void>('create_directory_command', { path });
}

/**
 * 删除文件
 * @param path 文件路径
 */
export async function deleteFile(path: string): Promise<void> {
  return await invoke<void>('delete_file_command', { path });
}

/**
 * 删除目录
 * @param path 目录路径
 */
export async function deleteDirectory(path: string): Promise<void> {
  return await invoke<void>('delete_directory_command', { path });
}

/**
 * 重命名文件或目录
 * @param oldPath 旧路径
 * @param newPath 新路径
 */
export async function renameFileOrDirectory(
  oldPath: string,
  newPath: string
): Promise<void> {
  return await invoke<void>('rename_file_or_directory_command', {
    oldPath: oldPath,
    newPath: newPath,
  });
}

/**
 * 删除文件并同步到 Git（原子操作）
 * 
 * 此函数会：
 * 1. 执行文件删除
 * 2. 执行 git add -A（自动删除索引）
 * 3. 执行 git commit
 * 4. 执行 git push（如果配置了远程仓库和 PAT）
 * 
 * @param workspacePath 工作区路径
 * @param path 文件路径
 * @param remoteName 远程仓库名称（默认 "origin"）
 * @param branchName 分支名称（默认 "main"）
 * @param patToken PAT Token（可选）
 */
export async function deleteFileWithGitSync(
  workspacePath: string,
  path: string,
  remoteName: string = 'origin',
  branchName: string = 'main',
  patToken?: string | null
): Promise<void> {
  return await invoke<void>('delete_file_with_git_sync_command', {
    workspacePath,
    path,
    remoteName,
    branchName,
    patToken: patToken || null,
  });
}

/**
 * 删除目录并同步到 Git（原子操作）
 * 
 * 此函数会：
 * 1. 执行目录删除
 * 2. 执行 git add -A（自动删除索引）
 * 3. 执行 git commit
 * 4. 执行 git push（如果配置了远程仓库和 PAT）
 * 
 * @param workspacePath 工作区路径
 * @param path 目录路径
 * @param remoteName 远程仓库名称（默认 "origin"）
 * @param branchName 分支名称（默认 "main"）
 * @param patToken PAT Token（可选）
 */
export async function deleteDirectoryWithGitSync(
  workspacePath: string,
  path: string,
  remoteName: string = 'origin',
  branchName: string = 'main',
  patToken?: string | null
): Promise<void> {
  return await invoke<void>('delete_directory_with_git_sync_command', {
    workspacePath,
    path,
    remoteName,
    branchName,
    patToken: patToken || null,
  });
}

/**
 * 重命名文件或目录并同步到 Git（原子操作）
 * 
 * 此函数会：
 * 1. 执行文件重命名
 * 2. 执行 git add -A（自动删除旧索引、添加新索引）
 * 3. 执行 git commit
 * 4. 执行 git push（如果配置了远程仓库和 PAT）
 * 
 * @param workspacePath 工作区路径
 * @param oldPath 旧路径
 * @param newPath 新路径
 * @param remoteName 远程仓库名称（默认 "origin"）
 * @param branchName 分支名称（默认 "main"）
 * @param patToken PAT Token（可选）
 */
export async function renameFileWithGitSync(
  workspacePath: string,
  oldPath: string,
  newPath: string,
  remoteName: string = 'origin',
  branchName: string = 'main',
  patToken?: string | null
): Promise<void> {
  return await invoke<void>('rename_file_with_git_sync_command', {
    workspacePath,
    oldPath,
    newPath,
    remoteName,
    branchName,
    patToken: patToken || null,
  });
}

/**
 * 复制文件或目录
 * @param sourcePath 源路径
 * @param destPath 目标路径
 */
export async function copyFileOrDirectory(
  sourcePath: string,
  destPath: string
): Promise<void> {
  return await invoke<void>('copy_file_or_directory_command', {
    sourcePath: sourcePath,
    destPath: destPath,
  });
}

/**
 * 移动文件或目录
 * @param sourcePath 源路径
 * @param destPath 目标路径
 */
export async function moveFileOrDirectory(
  sourcePath: string,
  destPath: string
): Promise<void> {
  return await invoke<void>('move_file_or_directory_command', {
    sourcePath: sourcePath,
    destPath: destPath,
  });
}

/**
 * 存储 GitHub PAT Token
 * @param token PAT Token
 */
export async function storePatToken(token: string): Promise<void> {
  return await invoke<void>('store_pat', { token });
}

/**
 * 获取 GitHub PAT Token
 * @returns PAT Token，如果未配置则返回 null
 */
export async function getPatToken(): Promise<string | null> {
  return await invoke<string | null>('get_pat');
}

/**
 * 删除 GitHub PAT Token
 */
export async function removePatToken(): Promise<void> {
  return await invoke<void>('remove_pat');
}

/**
 * 检查是否已配置 GitHub PAT Token
 * @returns 如果已配置返回 true，否则返回 false
 */
export async function hasPatToken(): Promise<boolean> {
  return await invoke<boolean>('has_pat');
}

/**
 * 添加远程仓库
 * @param path 仓库路径
 * @param name 远程仓库名称（默认 "origin"）
 * @param url 远程仓库URL
 */
export async function addRemote(path: string, name: string, url: string): Promise<void> {
  return await invoke<void>('add_remote', { path, name, url });
}

/**
 * 获取远程仓库URL
 * @param path 仓库路径
 * @param name 远程仓库名称（默认 "origin"）
 * @returns 远程仓库URL，如果未配置则返回 null
 */
export async function getRemoteUrl(path: string, name: string = 'origin'): Promise<string | null> {
  return await invoke<string | null>('get_remote_url', { path, name });
}

/**
 * 删除远程仓库配置
 * @param path 仓库路径
 * @param name 远程仓库名称（默认 "origin"）
 */
export async function removeRemote(path: string, name: string = 'origin'): Promise<void> {
  return await invoke<void>('remove_remote', { path, name });
}

// 同步结果接口
export interface SyncConflictFile {
  path: string;
  is_binary: boolean;
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
  has_conflict: boolean;
  conflict_branch: string | null;
  conflict?: SyncConflict | null;
}

/**
 * 从远程仓库获取更新（fetch）
 * @param path 仓库路径
 * @param remoteName 远程仓库名称（默认 "origin"）
 * @param patToken PAT Token（可选）
 */
export async function fetchFromRemote(
  path: string,
  remoteName: string = 'origin',
  patToken?: string
): Promise<void> {
  return await invoke<void>('fetch_from_remote', { 
    path, 
    remoteName,
    patToken,
  });
}

/**
 * 推送本地提交到远程仓库（push）
 * @param path 仓库路径
 * @param remoteName 远程仓库名称（默认 "origin"）
 * @param branchName 分支名称（默认 "main"）
 * @param patToken PAT Token（可选）
 */
export async function pushToRemote(
  path: string,
  remoteName: string = 'origin',
  branchName: string = 'main',
  patToken?: string
): Promise<void> {
  return await invoke<void>('push_to_remote', {
    path,
    remoteName: remoteName,
    branchName: branchName,
    patToken: patToken,
  });
}

/**
 * 同步远程仓库（fetch + rebase/push）
 * @param path 仓库路径
 * @param remoteName 远程仓库名称（默认 "origin"）
 * @param branchName 分支名称（默认 "main"）
 * @param patToken PAT Token（可选）
 * @returns 同步结果
 */
export async function syncWithRemote(
  path: string,
  remoteName: string = 'origin',
  branchName: string = 'main',
  patToken?: string
): Promise<SyncResult> {
  return await invoke<SyncResult>('sync_with_remote', {
    path,
    remoteName,
    branchName,
    patToken,
  });
}

/**
 * 启动同步（fetch + fast-forward/rebase），如遇冲突返回冲突详情
 */
export async function beginSync(
  path: string,
  remoteName: string = 'origin',
  branchName: string = 'main',
  patToken?: string
): Promise<SyncResult> {
  return await invoke<SyncResult>('begin_sync', {
    path,
    remoteName,
    branchName,
    patToken,
  });
}

/**
 * 继续同步（继续进行中的 rebase）
 */
export async function continueSync(
  path: string,
  branchName: string = 'main'
): Promise<SyncResult> {
  return await invoke<SyncResult>('continue_sync', {
    path,
    branchName,
  });
}

/**
 * 放弃同步（abort rebase）
 */
export async function abortSync(path: string): Promise<void> {
  return await invoke<void>('abort_sync', { path });
}

/**
 * 解决冲突（写入工作区 + stage），随后应调用 continueSync
 */
export async function resolveConflict(
  path: string,
  items: ConflictResolutionItem[]
): Promise<void> {
  return await invoke<void>('resolve_conflict', { path, items });
}

/**
 * 处理同步冲突
 * @param path 仓库路径
 * @param remoteName 远程仓库名称（默认 "origin"）
 * @param branchName 分支名称（默认 "main"）
 * @returns 冲突分支名称
 */
export async function handleSyncConflict(
  path: string,
  remoteName: string = 'origin',
  branchName: string = 'main'
): Promise<string> {
  return await invoke<string>('handle_sync_conflict', {
    path,
    remoteName: remoteName,
    branchName: branchName,
  });
}

/**
 * 获取当前分支名
 * @param path 仓库路径
 * @returns 当前分支名
 */
export async function getCurrentBranch(path: string): Promise<string> {
  return await invoke<string>('get_current_branch_command', { path });
}

/**
 * 切换到指定分支
 * @param path 仓库路径
 * @param branch 分支名称
 */
export async function switchToBranch(path: string, branch: string): Promise<void> {
  return await invoke<void>('switch_to_branch_command', { path, branch });
}

// 搜索结果接口
export interface SearchMatch {
  line: number;
  column: number;
  context: string;
}

export interface SearchResult {
  file_path: string;
  matches: SearchMatch[];
}

/**
 * 搜索文档内容
 * 
 * @param workspacePath 工作区路径
 * @param query 搜索关键词
 * @returns 搜索结果列表
 */
export async function searchFiles(workspacePath: string, query: string): Promise<SearchResult[]> {
  return await invoke<SearchResult[]>('search_files_command', {
    workspacePath,
    query,
  });
}

