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
 * 提交更改
 * @param path 仓库路径
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
    old_path: oldPath,
    new_path: newPath,
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
    source_path: sourcePath,
    dest_path: destPath,
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
    source_path: sourcePath,
    dest_path: destPath,
  });
}

