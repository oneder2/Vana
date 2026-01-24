/**
 * No Visitors - 块类型选择器组件
 * 用于转换当前光标所在块的类型
 * 支持桌面端下拉菜单和移动端底部上拉框两种模式
 */

'use client';

import React, { useEffect, useRef } from 'react';
import { Heading, FileText, Quote, List, Code, Info, Plus } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { getThemeSurfaceColor, getThemeBorderColor, getThemeAccentColor, getThemeAccentBgColor } from '@/lib/themeStyles';
import type { Editor as TiptapEditor } from '@tiptap/react';

// 块类型定义
export type BlockType = 'h1' | 'p' | 'quote' | 'list' | 'code' | 'meta';

interface BlockTypeOption {
  id: BlockType;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}

const BLOCK_TYPES: BlockTypeOption[] = [
  { id: 'h1', label: '标题', icon: Heading },
  { id: 'p', label: '段落', icon: FileText },
  { id: 'quote', label: '引用', icon: Quote },
  { id: 'list', label: '列表', icon: List },
  { id: 'code', label: '代码', icon: Code },
  { id: 'meta', label: '元数据', icon: Info },
];

interface BlockTypeSelectorProps {
  editor: TiptapEditor | null;
  onClose: () => void;
  mode?: 'desktop' | 'mobile';
  position?: { x: number; y: number };
}

/**
 * 块类型选择器组件
 */
export function BlockTypeSelector({
  editor,
  onClose,
  mode = 'desktop',
  position
}: BlockTypeSelectorProps) {
  const { theme } = useTheme();
  const menuRef = useRef<HTMLDivElement>(null);

  // 桌面端：点击外部关闭菜单
  useEffect(() => {
    if (mode !== 'desktop') return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // 延迟添加监听器，避免立即触发
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [mode, onClose]);

  const handleSelectBlockType = (blockType: BlockType) => {
    if (!editor || !editor.isEditable) {
      console.warn('编辑器不可用或不可编辑');
      onClose();
      return;
    }

    // 检查编辑器视图是否可用
    if (!editor.view) {
      console.warn('编辑器视图不可用');
      onClose();
      return;
    }

    try {
      const { state } = editor;
      const { selection } = state;
      const { $from } = selection;
      
      // 获取当前光标所在的块节点
      const currentNode = $from.node($from.depth);
      const currentPos = $from.before($from.depth);
      
      // 如果文档为空，回退到插入新块的行为
      const { doc } = state;
      const isEmpty = doc.content.size === 0 || 
        (doc.content.size === 1 && 
         doc.firstChild?.type.name === 'paragraph' && 
         doc.firstChild.content.size === 0);
      
      if (isEmpty) {
        // 文档为空时，插入新块
        const content = (() => {
          switch (blockType) {
            case 'h1':
              return { type: 'heading', attrs: { level: 1 }, content: [] };
            case 'p':
              return { type: 'paragraph', content: [] };
            case 'quote':
              return { type: 'blockquote', content: [{ type: 'paragraph', content: [] }] };
            case 'list':
              return { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [] }] }] };
            case 'code':
              return { type: 'codeBlock', attrs: { language: null }, content: [] };
            case 'meta':
              return { type: 'meta', content: [] };
          }
        })();
        editor.commands.setContent({ type: 'doc', content: [content] });
        setTimeout(() => {
          editor.commands.focus();
          editor.chain().focus().setTextSelection(1).run();
        }, 50);
        onClose();
        return;
      }
      
      // 转换当前块类型
      switch (blockType) {
        case 'h1':
          // 转换为标题
          if (currentNode.type.name === 'heading') {
            // 如果已经是标题，更新级别
            editor.chain().focus().setHeading({ level: 1 }).run();
          } else {
            // 转换为标题，保留内容
            editor.chain().focus().setHeading({ level: 1 }).run();
          }
          break;
        case 'p':
          // 转换为段落
          if (currentNode.type.name === 'paragraph') {
            // 已经是段落，不需要转换
            break;
          } else if (currentNode.type.name === 'heading') {
            editor.chain().focus().setParagraph().run();
          } else if (currentNode.type.name === 'blockquote') {
            // 从引用中提取段落
            const paragraphContent = currentNode.content;
            editor.chain().focus().lift('blockquote').setParagraph().run();
          } else if (currentNode.type.name === 'codeBlock') {
            // 从代码块转换为段落
            const codeContent = currentNode.textContent;
            editor.chain().focus().deleteNode('codeBlock').insertContent({ type: 'paragraph', content: [{ type: 'text', text: codeContent }] }).run();
          } else {
            editor.chain().focus().setParagraph().run();
          }
          break;
        case 'quote':
          // 转换为引用
          if (currentNode.type.name === 'blockquote') {
            // 已经是引用，不需要转换
            break;
          } else {
            editor.chain().focus().toggleBlockquote().run();
          }
          break;
        case 'list':
          // 转换为列表
          if (currentNode.type.name === 'listItem' || currentNode.type.name === 'bulletList' || currentNode.type.name === 'orderedList') {
            // 已经在列表中，不需要转换
            break;
          } else {
            // 将当前块转换为列表项
            const textContent = currentNode.textContent;
            editor.chain().focus().toggleBulletList().run();
          }
          break;
        case 'code':
          // 转换为代码块
          if (currentNode.type.name === 'codeBlock') {
            // 已经是代码块，不需要转换
            break;
          } else {
            const textContent = currentNode.textContent;
            editor.chain().focus().toggleCodeBlock().run();
          }
          break;
        case 'meta':
          // 转换为元数据块
          if (currentNode.type.name === 'meta') {
            // 已经是元数据，不需要转换
            break;
          } else {
            // 使用setNode转换为meta类型
            const textContent = currentNode.textContent;
            editor.chain().focus().command(({ tr, state }) => {
              const { selection } = state;
              const { $from } = selection;
              const pos = $from.before($from.depth);
              const node = state.schema.nodes.meta.create({}, currentNode.content);
              tr.replaceWith(pos, pos + currentNode.nodeSize, node);
              return true;
            }).run();
          }
          break;
      }
      
      // 保持光标位置
      setTimeout(() => {
        editor.commands.focus();
      }, 50);
    } catch (error) {
      console.error('转换块类型失败:', error);
    }

    onClose();
  };

  if (mode === 'mobile') {
    // 移动端：底部上拉框
    return (
      <div
        className="fixed inset-0 z-[90] flex items-end"
        onClick={onClose}
      >
        <div
          className="w-full rounded-t-lg border-t border-l border-r"
          style={{
            backgroundColor: getThemeSurfaceColor(theme),
            borderColor: getThemeBorderColor(theme),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4">
            <div className="text-sm mb-4" style={{ color: getThemeAccentColor(theme) }}>
              转换块类型
            </div>
            <div className="grid grid-cols-3 gap-2">
              {BLOCK_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.id}
                    onClick={() => handleSelectBlockType(type.id)}
                    className="flex flex-col items-center gap-2 p-3 rounded border transition-opacity hover:opacity-80"
                    style={{
                      backgroundColor: getThemeAccentBgColor(theme),
                      borderColor: getThemeBorderColor(theme),
                      color: getThemeAccentColor(theme),
                    }}
                  >
                    <Icon size={24} />
                    <span className="text-xs">{type.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 桌面端：下拉菜单
  if (!position) return null;

  // 计算菜单位置：菜单右下角对齐按钮位置，菜单向左上展开
  const menuRight = window.innerWidth - position.x;
  const menuBottom = window.innerHeight - position.y + 8; // 添加一点间距

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[200px] rounded border shadow-lg"
      style={{
        right: `${menuRight}px`, // 从右边定位，确保右下角对齐按钮
        bottom: `${menuBottom}px`, // 从底部定位，确保右下角对齐按钮
        backgroundColor: getThemeSurfaceColor(theme),
        borderColor: getThemeBorderColor(theme),
        // 菜单自然向左上展开（因为使用 right 和 bottom 定位）
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-2">
        {BLOCK_TYPES.map((type) => {
          const Icon = type.icon;
          return (
            <button
              key={type.id}
              onClick={() => handleSelectBlockType(type.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:opacity-80 transition-opacity text-sm rounded"
              style={{
                color: getThemeAccentColor(theme),
              }}
            >
              <Icon size={16} />
              <span>{type.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

