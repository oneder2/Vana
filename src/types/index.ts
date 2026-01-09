/**
 * No Visitors - 类型定义
 * 集中管理所有 TypeScript 类型定义
 */

// 文档块类型
export type BlockType = 'h1' | 'meta' | 'p' | 'quote' | 'list' | 'code';

// 文档块接口
export interface DocumentBlock {
  id: string;
  type: BlockType;
  content: string;
  metadata?: Record<string, unknown>;
}

// 文档接口
export interface Document {
  id: string;
  path: string;
  title: string;
  blocks: DocumentBlock[];
  createdAt: number;
  updatedAt: number;
}

// 文件树节点
export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  children?: FileTreeNode[];
}

