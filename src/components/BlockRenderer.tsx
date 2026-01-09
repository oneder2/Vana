/**
 * No Visitors - 块渲染器组件
 * 负责渲染不同类型的文档块（h1, meta, p, quote 等）
 */

'use client';

import React, { useRef, useEffect } from 'react';
import { useTheme } from './ThemeProvider';
import { getThemeBorderColor, getThemeAccentColor, getThemeSurfaceColor } from '@/lib/themeStyles';
import { BlockType } from '@/types';

// 块数据接口
export interface BlockData {
  id: string;
  type: BlockType;
  content: string;
  metadata?: Record<string, unknown>;
}

// 块渲染器属性
interface BlockRendererProps {
  block: BlockData;
  isTyping?: boolean;
  isFocused?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onContentChange?: (newContent: string) => void;
  onFocus?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onEnterKey?: (cursorPosition: number) => void;
  blockIndex?: number;
}

/**
 * 块渲染器组件
 * 根据块类型渲染不同的内容
 */
export function BlockRenderer({
  block,
  isTyping = false,
  isFocused = false,
  onClick,
  onContentChange,
  onFocus,
  onKeyDown,
  onEnterKey,
  blockIndex = 0,
}: BlockRendererProps) {
  const { theme } = useTheme();
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const pRef = useRef<HTMLParagraphElement>(null);
  const quoteRef = useRef<HTMLQuoteElement>(null);

  // 获取当前块的 ref
  const getCurrentRef = () => {
    if (block.type === 'h1') return h1Ref;
    if (block.type === 'p') return pRef;
    if (block.type === 'quote') return quoteRef;
    return null;
  };

  // 当块被聚焦时，聚焦到内容元素
  useEffect(() => {
    const currentRef = getCurrentRef();
    if (isFocused && currentRef?.current) {
      currentRef.current.focus();
      // 将光标移到末尾
      const range = document.createRange();
      const selection = window.getSelection();
      range.selectNodeContents(currentRef.current);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [isFocused, block.type]);

  const handleClick = (e: React.MouseEvent) => {
    if (!isTyping) {
      onClick?.(e);
      onFocus?.();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const currentRef = getCurrentRef();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const selection = window.getSelection();
      const range = selection?.getRangeAt(0);
      if (range && currentRef?.current) {
        const cursorPosition = range.startOffset;
        onEnterKey?.(cursorPosition);
      }
      return;
    }

    // 方向键处理
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      // 让父组件处理块间切换
      onKeyDown?.(e);
    }

    // 左右键在块边界时的处理
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const selection = window.getSelection();
      const range = selection?.getRangeAt(0);
      if (range && currentRef?.current) {
        const isAtStart = range.startOffset === 0 && e.key === 'ArrowLeft';
        const isAtEnd =
          range.startOffset === (currentRef.current.textContent?.length || 0) &&
          e.key === 'ArrowRight';
        if (isAtStart || isAtEnd) {
          // 让父组件处理块间切换
          onKeyDown?.(e);
        }
      }
    }
  };

  const handleInput = () => {
    const currentRef = getCurrentRef();
    if (currentRef?.current) {
      const newContent = currentRef.current.textContent || '';
      onContentChange?.(newContent);
    }
  };

  return (
    <div
      className={`group relative mb-6 cursor-text ${
        isTyping ? 'opacity-20' : 'opacity-100'
      } transition-opacity duration-500`}
      onClick={handleClick}
    >
      {/* 块类型指示器（悬停时显示） */}
      <div
        className={`absolute -left-8 top-1 opacity-0 group-hover:opacity-100 transition-opacity ${theme.uiFont} text-[9px] uppercase`}
      >
        {block.type}
      </div>

      {/* 根据类型渲染不同内容 */}
      {block.type === 'h1' && (
        <h1
          ref={h1Ref}
          contentEditable
          suppressContentEditableWarning
          className={`text-3xl font-bold mb-8 outline-none ${
            theme.id === 'arcane' ? 'tracking-widest' : ''
          }`}
          style={{
            outline: isFocused ? `1px solid ${getThemeAccentColor(theme)}` : 'none',
            outlineOffset: isFocused ? '2px' : '0',
          }}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          onClick={handleClick}
        >
          {block.content}
        </h1>
      )}

      {block.type === 'meta' && (
        <div
          className={`text-xs ${theme.uiFont} opacity-40 mb-10 border-b pb-2 uppercase tracking-widest`}
          style={{
            borderColor: getThemeBorderColor(theme),
          }}
        >
          {block.content}
        </div>
      )}

      {block.type === 'p' && (
        <p
          ref={pRef}
          contentEditable
          suppressContentEditableWarning
          className="text-lg leading-relaxed mb-4 outline-none"
          style={{
            outline: isFocused ? `1px solid ${getThemeAccentColor(theme)}` : 'none',
            outlineOffset: isFocused ? '2px' : '0',
          }}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          onClick={handleClick}
        >
          {block.content}
        </p>
      )}

      {block.type === 'quote' && (
        <blockquote
          ref={quoteRef}
          contentEditable
          suppressContentEditableWarning
          className="pl-4 border-l-2 italic my-8 outline-none"
          style={{
            borderColor: getThemeBorderColor(theme),
            color: getThemeAccentColor(theme),
            outline: isFocused ? `1px solid ${getThemeAccentColor(theme)}` : 'none',
            outlineOffset: isFocused ? '2px' : '0',
          }}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          onClick={handleClick}
        >
          {block.content}
        </blockquote>
      )}

      {block.type === 'list' && (
        <ul className="list-disc list-inside mb-4 space-y-2">
          {block.content.split('\n').map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}

      {block.type === 'code' && (
        <pre
          className="p-4 rounded border overflow-x-auto mb-4"
          style={{
            backgroundColor: getThemeSurfaceColor(theme),
            borderColor: getThemeBorderColor(theme),
          }}
        >
          <code className={theme.uiFont}>{block.content}</code>
        </pre>
      )}
    </div>
  );
}

