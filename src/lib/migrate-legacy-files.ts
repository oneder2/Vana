/**
 * No Visitors - 数据迁移脚本
 * 批量将旧格式（Markdown-like文本）转换为新格式（TipTap JSON）
 * 实现备份和验证机制
 */

import { JSONContent } from '@tiptap/core';
import { readFile, writeFile, listDirectory, type FileInfo } from '@/lib/api';
import { addBlockUUIDs } from './smart-slice';

/**
 * 迁移结果接口
 */
export interface MigrationResult {
  filePath: string;
  success: boolean;
  error?: string;
  backedUp: boolean;
  isAlreadyJSON: boolean;
}

/**
 * 迁移统计
 */
export interface MigrationStats {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  backedUp: number;
}

/**
 * 检测文件格式是否为 JSON
 * @param content 文件内容
 * @returns 是否为 JSON 格式
 */
function isJSONFormat(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    return parsed.type === 'doc' && Array.isArray(parsed.content);
  } catch {
    return false;
  }
}

/**
 * 将旧格式文本转换为 TipTap JSON 格式
 * @param content 旧格式文本内容
 * @returns TipTap JSON 内容
 */
function convertLegacyToJSON(content: string): JSONContent {
  // 空文件处理
  if (!content || content.trim() === '') {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    };
  }

  // 尝试解析为 JSON（如果已经是 JSON 格式）
  try {
    const parsed = JSON.parse(content);
    if (parsed.type === 'doc' && Array.isArray(parsed.content)) {
      return parsed;
    }
  } catch {
    // 不是 JSON，继续处理为文本格式
  }

  // 按空行分割段落
  const lines = content.split('\n\n').filter((line) => line.trim());

  const contentArray: JSONContent[] = lines.map((line) => {
    line = line.trim();

    // 检测标题（# 开头）
    if (line.startsWith('# ')) {
      return {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: line.substring(2).trim() }],
      };
    }

    // 检测引用（> 开头）
    if (line.startsWith('> ')) {
      return {
        type: 'blockquote',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: line.substring(2).trim() }],
        }],
      };
    }

    // 检测代码块（``` 包围）
    if (line.startsWith('```') && line.endsWith('```')) {
      const codeContent = line.slice(3, -3).trim();
      return {
        type: 'codeBlock',
        attrs: { language: null },
        content: [{ type: 'text', text: codeContent }],
      };
    }

    // 检测列表项（- 或 * 开头）
    if (line.match(/^[-*]\s+/)) {
      const items = line.split('\n').filter(item => item.trim().match(/^[-*]\s+/));
      const listItems = items.map(item => {
        const text = item.replace(/^[-*]\s+/, '').trim();
        return {
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text }],
          }],
        };
      });

      if (listItems.length > 0) {
        return {
          type: 'bulletList',
          content: listItems,
        };
      }
    }

    // 默认作为段落处理
    return {
      type: 'paragraph',
      content: [{ type: 'text', text: line }],
    };
  });

  // 如果没有任何内容，返回空段落
  if (contentArray.length === 0) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    };
  }

  return {
    type: 'doc',
    content: contentArray,
  };
}

/**
 * 创建文件备份
 * @param filePath 文件路径
 * @param content 文件内容
 * @returns 是否备份成功
 */
async function backupFile(filePath: string, content: string): Promise<boolean> {
  try {
    const backupPath = `${filePath}.backup.${Date.now()}`;
    await writeFile(backupPath, content);
    console.log(`备份文件: ${backupPath}`);
    return true;
  } catch (error) {
    console.error(`备份文件失败: ${filePath}`, error);
    return false;
  }
}

/**
 * 迁移单个文件
 * @param filePath 文件路径
 * @param createBackup 是否创建备份
 * @returns 迁移结果
 */
export async function migrateFile(
  filePath: string,
  createBackup: boolean = true
): Promise<MigrationResult> {
  try {
    // 读取文件内容
    const content = await readFile(filePath);

    // 检测是否为 JSON 格式
    const isJSON = isJSONFormat(content);
    if (isJSON) {
      // 已经是 JSON 格式，只需要确保有 UUID
      const json = JSON.parse(content);
      const jsonWithUUIDs = addBlockUUIDs(json);
      
      // 如果生成了新的 UUID，保存更新
      if (JSON.stringify(jsonWithUUIDs) !== JSON.stringify(json)) {
        if (createBackup) {
          await backupFile(filePath, content);
        }
        const jsonString = JSON.stringify(jsonWithUUIDs, null, 2);
        await writeFile(filePath, jsonString);
      }

      return {
        filePath,
        success: true,
        backedUp: createBackup && JSON.stringify(jsonWithUUIDs) !== JSON.stringify(json),
        isAlreadyJSON: true,
      };
    }

    // 创建备份
    let backedUp = false;
    if (createBackup) {
      backedUp = await backupFile(filePath, content);
    }

    // 转换为 JSON 格式
    const json = convertLegacyToJSON(content);
    // 添加 UUID
    const jsonWithUUIDs = addBlockUUIDs(json);

    // 保存新格式
    const jsonString = JSON.stringify(jsonWithUUIDs, null, 2);
    await writeFile(filePath, jsonString);

    return {
      filePath,
      success: true,
      backedUp,
      isAlreadyJSON: false,
    };
  } catch (error) {
    console.error(`迁移文件失败: ${filePath}`, error);
    return {
      filePath,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      backedUp: false,
      isAlreadyJSON: false,
    };
  }
}

/**
 * 递归获取所有文件
 * @param dirPath 目录路径
 * @param fileList 文件列表（输出参数）
 */
async function getAllFiles(dirPath: string, fileList: string[] = []): Promise<string[]> {
  try {
    const entries = await listDirectory(dirPath);

    for (const entry of entries) {
      if (entry.is_directory) {
        // 递归处理子目录
        await getAllFiles(entry.path, fileList);
      } else if (entry.is_file && entry.path.endsWith('.enc')) {
        // 只处理 .enc 文件，排除备份文件
        if (!entry.path.includes('.backup.')) {
          fileList.push(entry.path);
        }
      }
    }

    return fileList;
  } catch (error) {
    console.error(`获取目录文件失败: ${dirPath}`, error);
    return fileList;
  }
}

/**
 * 迁移整个工作区的文件
 * @param workspacePath 工作区路径
 * @param createBackup 是否创建备份
 * @returns 迁移结果列表和统计信息
 */
export async function migrateWorkspace(
  workspacePath: string,
  createBackup: boolean = true
): Promise<{ results: MigrationResult[]; stats: MigrationStats }> {
  const results: MigrationResult[] = [];
  const stats: MigrationStats = {
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    backedUp: 0,
  };

  try {
    // 获取所有文件
    const files = await getAllFiles(workspacePath);
    stats.total = files.length;

    console.log(`找到 ${files.length} 个文件需要检查`);

    // 迁移每个文件
    for (const filePath of files) {
      const result = await migrateFile(filePath, createBackup);
      results.push(result);

      if (result.success) {
        stats.success++;
        if (result.isAlreadyJSON) {
          stats.skipped++;
        }
        if (result.backedUp) {
          stats.backedUp++;
        }
      } else {
        stats.failed++;
      }
    }

    console.log('迁移完成:', stats);
    return { results, stats };
  } catch (error) {
    console.error('迁移工作区失败:', error);
    throw error;
  }
}

/**
 * 验证迁移结果
 * @param filePath 文件路径
 * @returns 是否验证通过
 */
export async function verifyMigration(filePath: string): Promise<boolean> {
  try {
    const content = await readFile(filePath);
    const isJSON = isJSONFormat(content);
    
    if (!isJSON) {
      return false;
    }

    const json = JSON.parse(content);
    // 验证 JSON 结构
    if (json.type !== 'doc' || !Array.isArray(json.content)) {
      return false;
    }

    // 验证 JSON 结构完整性（可以正常解析即可）
    // UUID 会在保存时自动添加，所以这里不需要验证 UUID 的存在
    return true;
  } catch {
    return false;
  }
}

