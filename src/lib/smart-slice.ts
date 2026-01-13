/**
 * No Visitors - 智能切片逻辑
 * 实现"隐形块"编辑体验：空行分隔自动切片，连续段落保持为一个块
 * 为每个块分配 UUID，支持未来引用功能
 */

import { JSONContent } from '@tiptap/core';

/**
 * 生成 UUID v4
 * @returns UUID 字符串
 */
function generateUUID(): string {
  // 使用浏览器或 Node.js 的 crypto API
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  // 降级方案：使用时间戳和随机数生成 UUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * 块元数据接口
 * 每个块都有唯一的 UUID 和可选的类型标记
 */
export interface BlockMetadata {
  uuid: string;
  type?: string;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * 为块添加 UUID 和元数据
 * @param content TipTap JSON 内容
 * @returns 添加了 UUID 和元数据的内容
 */
export function addBlockUUIDs(content: JSONContent): JSONContent {
  if (!content.content || !Array.isArray(content.content)) {
    return content;
  }

  const processedContent = content.content.map((node) => {
    // 为每个块级节点添加 UUID（如果还没有）
    if (isBlockNode(node)) {
      if (!node.attrs) {
        node.attrs = {};
      }

      // 如果节点还没有 UUID，生成一个
      if (!node.attrs.uuid) {
        node.attrs.uuid = generateUUID();
      }

      // 添加更新时间戳
      node.attrs.updatedAt = Date.now();

      // 如果没有创建时间戳，添加一个
      if (!node.attrs.createdAt) {
        node.attrs.createdAt = node.attrs.updatedAt;
      }

      // 递归处理子节点
      if (node.content && Array.isArray(node.content)) {
        node.content = node.content.map((child) => {
          if (typeof child === 'object' && child !== null) {
            return addBlockUUIDs(child);
          }
          return child;
        });
      }
    }

    return node;
  });

  return {
    ...content,
    content: processedContent,
  };
}

/**
 * 检查节点是否为块级节点
 * @param node TipTap 节点
 * @returns 是否为块级节点
 */
function isBlockNode(node: JSONContent): boolean {
  if (!node.type) return false;

  const blockTypes = [
    'heading',
    'paragraph',
    'blockquote',
    'codeBlock',
    'bulletList',
    'orderedList',
    'meta',
  ];

  return blockTypes.includes(node.type);
}

/**
 * 检测块边界（空行分隔）
 * TipTap 本身已经是块结构，但我们可以检测连续的空段落并合并
 * 
 * 逻辑：
 * - 连续两个空段落被视为块分隔符
 * - 在保存时自动处理块边界
 * @param content TipTap JSON 内容
 * @returns 处理后的内容（包含块边界标记）
 */
export function detectBlockBoundaries(content: JSONContent): JSONContent {
  if (!content.content || !Array.isArray(content.content)) {
    return content;
  }

  const processedContent: JSONContent[] = [];
  let currentBlock: JSONContent[] = [];

  for (let i = 0; i < content.content.length; i++) {
    const node = content.content[i];

    // 检查当前节点是否为空段落
    const isEmptyParagraph = node.type === 'paragraph' && 
      (!node.content || node.content.length === 0 || 
       (node.content.length === 1 && 
        node.content[0].type === 'text' && 
        (!node.content[0].text || node.content[0].text.trim() === '')));

    // 检查下一个节点是否也为空段落
    const nextNode = content.content[i + 1];
    const nextIsEmptyParagraph = nextNode && 
      nextNode.type === 'paragraph' && 
      (!nextNode.content || nextNode.content.length === 0 ||
       (nextNode.content.length === 1 && 
        nextNode.content[0].type === 'text' && 
        (!nextNode.content[0].text || nextNode.content[0].text.trim() === '')));

    // 如果当前节点和下一个节点都是空段落，这是一个块边界
    if (isEmptyParagraph && nextIsEmptyParagraph) {
      // 如果有待处理的块，先添加到结果中
      if (currentBlock.length > 0) {
        processedContent.push(...currentBlock);
        currentBlock = [];
      }
      // 跳过这个空段落（块分隔符）
      continue;
    }

    // 将非分隔符节点添加到当前块
    if (!isEmptyParagraph) {
      currentBlock.push(node);
    }
  }

  // 添加剩余的块
  if (currentBlock.length > 0) {
    processedContent.push(...currentBlock);
  }

  return {
    ...content,
    content: processedContent,
  };
}

/**
 * 获取块的 UUID
 * @param node TipTap 节点
 * @returns UUID 或 null
 */
export function getBlockUUID(node: JSONContent): string | null {
  if (node.attrs && typeof node.attrs === 'object' && 'uuid' in node.attrs) {
    return node.attrs.uuid as string;
  }
  return null;
}

/**
 * 根据 UUID 查找块
 * @param content TipTap JSON 内容
 * @param uuid 块的 UUID
 * @returns 找到的块或 null
 */
export function findBlockByUUID(content: JSONContent, uuid: string): JSONContent | null {
  if (!content.content || !Array.isArray(content.content)) {
    return null;
  }

  for (const node of content.content) {
    if (getBlockUUID(node) === uuid) {
      return node;
    }

    // 递归搜索子节点
    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        if (typeof child === 'object' && child !== null) {
          const found = findBlockByUUID(child, uuid);
          if (found) {
            return found;
          }
        }
      }
    }
  }

  return null;
}

