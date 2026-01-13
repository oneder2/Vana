/**
 * No Visitors - 编辑器键盘快捷键处理
 * 支持块类型选择器快捷键和快速插入块
 */

import type { Editor as TiptapEditor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';

/**
 * 键盘快捷键类型
 */
export type ShortcutAction = 'open-block-selector' | 'insert-block' | 'convert-block';

/**
 * 处理键盘快捷键
 * @param editor TipTap 编辑器实例
 * @param event 键盘事件
 * @param onOpenBlockSelector 打开块类型选择器的回调
 * @returns 是否处理了该事件
 */
export function handleEditorShortcut(
  editor: TiptapEditor,
  event: KeyboardEvent,
  onOpenBlockSelector?: () => void
): boolean {
  // Ctrl/Cmd + / 或 / 开头：打开块类型选择器
  if ((event.ctrlKey || event.metaKey) && event.key === '/') {
    event.preventDefault();
    if (onOpenBlockSelector) {
      onOpenBlockSelector();
    }
    return true;
  }

  // 检测用户输入 "/" 或 "++" 来触发块类型选择器
  // 注意：这需要在输入时检测，所以应该在 onUpdate 或其他地方处理
  // 这里只处理明确的快捷键组合

  // Ctrl/Cmd + Enter：在当前光标位置插入新段落块
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    editor.commands.insertContent({ type: 'paragraph', content: [] });
    // 聚焦到新插入的段落
    setTimeout(() => {
      editor.commands.focus();
      // 移动光标到文档末尾
      editor.commands.setTextSelection(editor.state.doc.content.size);
    }, 0);
    return true;
  }

  // Ctrl/Cmd + Shift + Enter：在当前位置创建标题块
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'Enter') {
    event.preventDefault();
    editor.commands.insertContent({
      type: 'heading',
      attrs: { level: 1 },
      content: [],
    });
    // 聚焦到新插入的标题
    setTimeout(() => {
      editor.commands.focus();
      editor.commands.setTextSelection(editor.state.doc.content.size);
    }, 0);
    return true;
  }

  return false;
}

/**
 * 检测并处理 "/" 或 "++" 触发块类型选择器
 * 这需要在编辑器内容更新时检测
 * @param editor TipTap 编辑器实例
 * @param onOpenBlockSelector 打开块类型选择器的回调
 * @returns 是否检测到触发字符
 */
export function detectBlockSelectorTrigger(
  editor: TiptapEditor,
  onOpenBlockSelector?: () => void
): boolean {
  const { state } = editor;
  const { selection } = state;
  const { $from } = selection;

  // 获取当前光标位置前的文本
  const textBeforeCursor = $from.nodeBefore?.textContent || '';
  const currentPos = $from.pos;
  
  // 检查当前行的开头是否是 "/" 或 "++"
  // 获取当前段落节点
  let currentNode = $from.node(-1);
  if (!currentNode || currentNode.type.name !== 'paragraph') {
    // 如果不在段落中，检查父节点
    currentNode = $from.node();
  }

  if (currentNode.type.name === 'paragraph') {
    const paragraphText = currentNode.textContent || '';
    const cursorOffset = $from.parentOffset;

    // 检查光标位置前的文本是否以 "/" 开头且光标在 "/" 之后
    // 或者是否以 "++" 开头
    if (cursorOffset === 1 && paragraphText.startsWith('/')) {
      // 删除 "/" 并打开块类型选择器
      editor.commands.deleteRange({ from: currentPos - 1, to: currentPos });
      if (onOpenBlockSelector) {
        onOpenBlockSelector();
      }
      return true;
    }

    if (cursorOffset === 2 && paragraphText.startsWith('++')) {
      // 删除 "++" 并打开块类型选择器
      editor.commands.deleteRange({ from: currentPos - 2, to: currentPos });
      if (onOpenBlockSelector) {
        onOpenBlockSelector();
      }
      return true;
    }
  }

  return false;
}

/**
 * 处理双回车自动切片为块
 * TipTap 默认行为已经是回车创建新段落，双回车就是两个空段落
 * 我们可以在保存时处理这个逻辑（通过智能切片）
 * 这里只提供检测逻辑，实际切片在保存时进行
 * @param editor TipTap 编辑器实例
 * @returns 是否检测到双回车（两个连续空段落）
 */
export function detectDoubleEnter(editor: TiptapEditor): boolean {
  const { state } = editor;
  const { doc } = state;

  // 检查是否有两个连续的空段落
  let prevWasEmpty = false;
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i);
    const isEmpty = child.type.name === 'paragraph' && 
      (child.content.size === 0 || 
       (child.content.size === 1 && 
        child.textContent.trim() === ''));

    if (isEmpty && prevWasEmpty) {
      return true;
    }
    prevWasEmpty = isEmpty;
  }

  return false;
}


