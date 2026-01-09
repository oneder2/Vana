/**
 * No Visitors - 主编辑器组件
 * 块式编辑器，支持多种块类型
 * 实现实时编辑和防抖保存（Tier 1）
 */

'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from './ThemeProvider';
import { getThemeAccentColor } from '@/lib/themeStyles';
import { BlockRenderer, type BlockData } from './BlockRenderer';
import { writeFile, commitChanges, readWorkspaceConfig, getWorkspacePath } from '@/lib/api';

// 编辑器属性
interface EditorProps {
  filePath?: string;
  initialBlocks?: BlockData[];
  onContentChange?: (blocks: BlockData[]) => void;
  workspacePath?: string;
}

/**
 * 主编辑器组件
 * 实现块式编辑和防抖保存
 */
export function Editor({ filePath, initialBlocks = [], onContentChange, workspacePath }: EditorProps) {
  const { theme } = useTheme();
  const [blocks, setBlocks] = useState<BlockData[]>(initialBlocks);
  const [isTyping, setIsTyping] = useState(false);
  const [currentBlockIndex, setCurrentBlockIndex] = useState<number | null>(null);
  const [focusedBlockIndex, setFocusedBlockIndex] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState('');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tier2IntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasUnsavedChangesRef = useRef(false);

  // 防抖保存函数（Tier 1: 停止打字 2 秒后保存）
  const debouncedSave = useCallback(
    async (content: BlockData[]) => {
      if (!filePath) return;

      // 清除之前的定时器
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // 设置新的定时器（2 秒后保存）
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          // 将块转换为文本内容
          const textContent = content
            .map((block) => {
              const prefix = block.type === 'h1' ? '# ' : block.type === 'quote' ? '> ' : '';
              return `${prefix}${block.content}`;
            })
            .join('\n\n');

          await writeFile(filePath, textContent);
          console.log('文件已保存:', filePath);
          hasUnsavedChangesRef.current = true;
        } catch (error) {
          console.error('保存文件失败:', error);
        }
      }, 2000);
    },
    [filePath]
  );

  // Tier 2: Git 自动提交函数
  const triggerTier2Commit = useCallback(async () => {
    if (!workspacePath || !hasUnsavedChangesRef.current) {
      return;
    }

    try {
      // 读取提交范围配置
      const config = await readWorkspaceConfig();
      const commitPath = config.commit_scope === 'directory' && filePath
        ? filePath.substring(0, filePath.lastIndexOf('/'))
        : workspacePath;

      // 执行 Git 提交
      await commitChanges(commitPath, 'auto_snapshot');
      console.log('Tier 2: Git 提交成功');
      hasUnsavedChangesRef.current = false;
    } catch (error) {
      console.error('Tier 2: Git 提交失败:', error);
    }
  }, [workspacePath, filePath]);

  // 当内容改变时触发防抖保存
  useEffect(() => {
    if (blocks.length > 0) {
      debouncedSave(blocks);
      onContentChange?.(blocks);
    }

    // 清理函数
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [blocks, debouncedSave, onContentChange]);

  // Tier 2: 监听 App 后台切换和文档关闭事件
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && filePath) {
        triggerTier2Commit();
      }
    };

    const handleBeforeUnload = () => {
      if (filePath) {
        // 注意：beforeunload 中无法执行异步操作，这里只做标记
        // 实际提交应该在 visibilitychange 中处理
        triggerTier2Commit();
      }
    };

    // 15分钟定时器
    const configPromise = readWorkspaceConfig();
    configPromise.then(async (config) => {
      const intervalMs = config.auto_commit_interval * 60 * 1000;
      tier2IntervalRef.current = setInterval(() => {
        if (filePath && hasUnsavedChangesRef.current) {
          triggerTier2Commit();
        }
      }, intervalMs);
    });

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (tier2IntervalRef.current) {
        clearInterval(tier2IntervalRef.current);
      }
    };
  }, [filePath, triggerTier2Commit]);

  // 处理输入
  const handleInputChange = (value: string) => {
    setInputValue(value);
    setIsTyping(true);

    // 重置打字状态定时器
    setTimeout(() => setIsTyping(false), 2000);
  };

  // 处理回车键（创建新块）
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      const newBlock: BlockData = {
        id: Date.now().toString(),
        type: 'p',
        content: inputValue.trim(),
      };

      setBlocks([...blocks, newBlock]);
      setInputValue('');
      setIsTyping(false);
    }
  };

  return (
    <main className="flex-1 overflow-y-auto relative">
      {/* 终端主题的扫描线效果 */}
      {theme.id === 'terminal' && (
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,118,0.06))] bg-[length:100%_2px,3px_100%] z-10"></div>
      )}

      <div className="max-w-2xl mx-auto px-6 py-20 min-h-full">
        {/* 渲染所有块 */}
        {blocks.map((block, index) => (
          <BlockRenderer
            key={block.id}
            block={block}
            blockIndex={index}
            isTyping={isTyping && index < blocks.length - 2}
            isFocused={focusedBlockIndex === index}
            onClick={(e) => {
              setCurrentBlockIndex(index);
              setFocusedBlockIndex(index);
            }}
            onFocus={() => setFocusedBlockIndex(index)}
            onContentChange={(newContent) => {
              const updatedBlocks = [...blocks];
              updatedBlocks[index] = { ...updatedBlocks[index], content: newContent };
              setBlocks(updatedBlocks);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (index > 0) {
                  setFocusedBlockIndex(index - 1);
                }
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (index < blocks.length - 1) {
                  setFocusedBlockIndex(index + 1);
                }
              } else if (e.key === 'ArrowLeft' && index > 0) {
                // 在块开头按左键，切换到上一个块
                const selection = window.getSelection();
                const range = selection?.getRangeAt(0);
                if (range && range.startOffset === 0) {
                  setFocusedBlockIndex(index - 1);
                }
              } else if (e.key === 'ArrowRight' && index < blocks.length - 1) {
                // 在块末尾按右键，切换到下一个块
                const selection = window.getSelection();
                const range = selection?.getRangeAt(0);
                const element = e.currentTarget as HTMLElement;
                if (range && range.startOffset === (element.textContent?.length || 0)) {
                  setFocusedBlockIndex(index + 1);
                }
              }
            }}
            onEnterKey={(cursorPosition) => {
              const currentBlock = blocks[index];
              const textBeforeCursor = currentBlock.content.slice(0, cursorPosition);
              const textAfterCursor = currentBlock.content.slice(cursorPosition);

              // 更新当前块
              const updatedBlocks = [...blocks];
              updatedBlocks[index] = { ...updatedBlocks[index], content: textBeforeCursor };

              // 创建新块
              const newBlockType = currentBlock.type === 'list' ? 'list' : 'p';
              const newBlock: BlockData = {
                id: `${Date.now()}-${index}`,
                type: newBlockType,
                content: textAfterCursor,
              };

              // 插入新块
              updatedBlocks.splice(index + 1, 0, newBlock);
              setBlocks(updatedBlocks);
              setFocusedBlockIndex(index + 1);
            }}
          />
        ))}

        {/* 输入行 */}
        <div className="flex items-center gap-2 mt-8">
          <div
            className="w-1 h-6 animate-pulse"
            style={{
              backgroundColor: getThemeAccentColor(theme),
            }}
          ></div>
          <input
            className="bg-transparent border-none outline-none w-full text-lg"
            placeholder="铭刻..."
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsTyping(true)}
          />
        </div>
      </div>
    </main>
  );
}

