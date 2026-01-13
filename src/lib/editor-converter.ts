/**
 * No Visitors - 编辑器数据格式转换工具
 * 在 BlockData[] 和 Tiptap JSON 格式之间转换
 */

import { JSONContent } from '@tiptap/core';
import { BlockData } from '@/components/BlockRenderer';
import type { BlockType } from '@/types';

/**
 * 将 BlockData[] 转换为 Tiptap JSON 格式
 * @param blocks 块数据数组
 * @returns Tiptap JSON 内容
 */
export function blocksToTiptapJSON(blocks: BlockData[]): JSONContent {
  const content: JSONContent[] = blocks.map((block) => {
    const base: JSONContent = {
      type: block.type === 'h1' ? 'heading' : block.type === 'list' ? 'bulletList' : block.type,
      attrs: block.type === 'h1' ? { level: 1 } : {},
    };

    // 处理不同类型的内容
    switch (block.type) {
      case 'h1':
        return {
          ...base,
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: block.content }],
        };
      case 'p':
        return {
          ...base,
          content: block.content ? [{ type: 'text', text: block.content }] : undefined,
        };
      case 'quote':
        return {
          ...base,
          type: 'blockquote',
          content: block.content ? [{ type: 'paragraph', content: [{ type: 'text', text: block.content }] }] : undefined,
        };
      case 'list':
        // 列表需要特殊处理，将内容按行分割
        const listItems = block.content
          .split('\n')
          .filter((line) => line.trim())
          .map((line) => ({
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: line.trim() }],
              },
            ],
          }));
        return {
          ...base,
          type: 'bulletList',
          content: listItems.length > 0 ? listItems : undefined,
        };
      case 'code':
        return {
          ...base,
          type: 'codeBlock',
          attrs: { language: null },
          content: block.content ? [{ type: 'text', text: block.content }] : undefined,
        };
      case 'meta':
        return {
          ...base,
          type: 'meta',
          content: block.content ? [{ type: 'text', text: block.content }] : undefined,
        };
      default:
        return {
          ...base,
          content: block.content ? [{ type: 'text', text: block.content }] : undefined,
        };
    }
  });

  return {
    type: 'doc',
    content,
  };
}

/**
 * 将 Tiptap JSON 格式转换为 BlockData[]
 * @param json Tiptap JSON 内容
 * @returns 块数据数组
 */
export function tiptapJSONToBlocks(json: JSONContent): BlockData[] {
  if (!json.content || !Array.isArray(json.content)) {
    return [];
  }

  const blocks: BlockData[] = [];
  let blockIndex = 0;

  const processNode = (node: JSONContent): BlockData | null => {
    if (!node.type) return null;

    let blockType: BlockType = 'p';
    let content = '';

    switch (node.type) {
      case 'heading':
        const level = (node.attrs as { level?: number })?.level || 1;
        if (level === 1) {
          blockType = 'h1';
        } else {
          blockType = 'p'; // 其他级别的标题暂时作为段落处理
        }
        content = extractTextContent(node);
        break;
      case 'paragraph':
        blockType = 'p';
        content = extractTextContent(node);
        break;
      case 'blockquote':
        blockType = 'quote';
        content = extractTextContent(node);
        break;
      case 'bulletList':
      case 'orderedList':
        blockType = 'list';
        // 提取所有列表项
        const listItems: string[] = [];
        if (node.content) {
          node.content.forEach((item) => {
            if (item.type === 'listItem' && item.content) {
              item.content.forEach((para) => {
                if (para.type === 'paragraph') {
                  const text = extractTextContent(para);
                  if (text) listItems.push(text);
                }
              });
            }
          });
        }
        content = listItems.join('\n');
        break;
      case 'codeBlock':
        blockType = 'code';
        content = extractTextContent(node);
        break;
      case 'meta':
        blockType = 'meta';
        content = extractTextContent(node);
        break;
      default:
        // 未知类型，尝试提取文本内容
        content = extractTextContent(node);
        if (!content) return null;
        blockType = 'p';
    }

    return {
      id: `${blockIndex++}-${Date.now()}`,
      type: blockType,
      content,
    };
  };

  // 处理所有顶级节点
  json.content.forEach((node) => {
    const block = processNode(node);
    if (block) {
      blocks.push(block);
    }
  });

  return blocks;
}

/**
 * 从 Tiptap 节点中提取纯文本内容
 * @param node Tiptap 节点
 * @returns 文本内容
 */
function extractTextContent(node: JSONContent): string {
  if (node.type === 'text') {
    return node.text || '';
  }

  if (node.content && Array.isArray(node.content)) {
    return node.content
      .map((child) => extractTextContent(child))
      .join('')
      .trim();
  }

  return '';
}

