/**
 * No Visitors - 主编辑器组件
 * 使用 Tiptap 实现的块式编辑器
 * 支持多种块类型、实时编辑和防抖保存（Tier 1）
 *
 * Git 自动化说明（对齐 docs/Sync Protocol.md）：
 * - Tier 1：停止输入 2 秒后落盘（writeFile）
 * - Tier 2：在关键时机触发 Git commit（必须以「工作区」为范围，而不是当前文档目录）
 * - Tier 3：Commit 成功后（已配置 PAT + remote 且网络在线）后台同步（fetch + rebase + push）
 *
 * TODO(sync-status): 后续可把同步状态从 console.log 提升为 UI 状态指示灯（呼吸绿/静止灰/警告红）
 */

'use client';

import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { TextSelection } from 'prosemirror-state';
import { useTheme } from './ThemeProvider';
import { getTiptapExtensions } from '@/lib/tiptap-extensions';
import { writeFile, commitChanges, readWorkspaceConfig, syncWithRemote, getPatToken, getRemoteUrl, fetchFromRemote, getRepositoryStatus, getCurrentBranch, switchToBranch } from '@/lib/api';
import { addFailedPushTask } from '@/lib/syncQueue';
import { addBlockUUIDs } from '@/lib/smart-slice';
import { handleEditorShortcut } from '@/lib/editor-shortcuts';
import { ContextMenu } from './ContextMenu';
import { BlockTypeSelector } from './BlockTypeSelector';
import { Breadcrumb } from './Breadcrumb';
import { EditorSkeleton } from './Skeleton';
import { Plus } from 'lucide-react';
import { getThemeAccentColor, getThemeSurfaceColor, getThemeBorderColor } from '@/lib/themeStyles';
import { saveFileState, loadFileState } from '@/lib/cache';
import type { Editor as TiptapEditor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';

// 布局类型
export type EditorLayout = 'center' | 'left' | 'right';

// 编辑器属性
interface EditorProps {
  filePath?: string;
  initialContent?: JSONContent; // 直接使用 Tiptap JSON
  onContentChange?: (content: JSONContent) => void; // 直接传递 JSON
  workspacePath?: string;
  onEditorReady?: (editor: TiptapEditor | null, triggerCommit?: () => Promise<void>) => void;
  layout?: EditorLayout; // 布局类型
  onUnsavedChangesChange?: (hasChanges: boolean) => void; // 未保存更改状态变化回调
}

/**
 * 主编辑器组件
 * 使用 Tiptap 实现块式编辑和防抖保存
 */
export function Editor({ filePath, initialContent, onContentChange, workspacePath, onEditorReady, onUnsavedChangesChange }: EditorProps) {
  const { theme } = useTheme();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tier2IntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasUnsavedChangesRef = useRef(false);
  const isInitialLoadRef = useRef(true);
  const editorRef = useRef<TiptapEditor | null>(null);
  const triggerTier2CommitRef = useRef<(() => Promise<void>) | null>(null);
  const syncInProgressRef = useRef(false); // 原子性保护：同步进行中标志
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showBlockSelector, setShowBlockSelector] = useState(false);
  const [blockSelectorPos, setBlockSelectorPos] = useState<{ x: number; y: number } | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const scrollSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cursorSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 确保只在客户端挂载后初始化编辑器
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 使用 useMemo 缓存扩展配置，避免每次渲染都创建新数组
  const extensions = useMemo(() => getTiptapExtensions(theme.id), [theme.id]);

  // 防抖保存函数（Tier 1: 停止打字 2 秒后保存）
  // 使用 useRef 来存储最新的回调函数，避免闭包问题
  const onContentChangeRef = useRef(onContentChange);
  useEffect(() => {
    onContentChangeRef.current = onContentChange;
  }, [onContentChange]);

  // 防抖保存函数（Tier 1: 停止打字 2 秒后保存）
  const debouncedSave = useCallback(
    async (json: JSONContent) => {
      console.log('[debouncedSave] 被调用', { filePath, hasEditor: !!editorRef.current });
      if (!filePath || !editorRef.current) {
        console.warn('[debouncedSave] 提前返回：filePath 或 editorRef 为空');
        return;
      }

      // 清除之前的定时器
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        console.log('[debouncedSave] 清除之前的定时器');
      }

      // 设置新的定时器（2 秒后保存）
      console.log('[debouncedSave] 设置新的定时器（2秒后保存）');
      saveTimeoutRef.current = setTimeout(async () => {
        console.log('[debouncedSave] 定时器触发，开始保存');
        try {
          // 自动为块添加 UUID（如果还没有）
          const jsonWithUUIDs = addBlockUUIDs(json);
          // 直接保存 Tiptap JSON 格式（JSON 字符串）
          const jsonString = JSON.stringify(jsonWithUUIDs, null, 2);
          await writeFile(filePath, jsonString);
          console.log('文件已保存:', filePath);
          hasUnsavedChangesRef.current = true;
          console.log('[Tier 1] hasUnsavedChangesRef 已设置为 true');
          // 通知父组件未保存更改状态
          onUnsavedChangesChange?.(true);
          
          // 如果生成了新的 UUID，更新编辑器内容（但不会触发 onUpdate）
          if (editorRef.current && JSON.stringify(jsonWithUUIDs) !== JSON.stringify(json)) {
            setTimeout(() => {
              if (editorRef.current && editorRef.current.view && !editorRef.current.isDestroyed) {
                try {
                  editorRef.current.commands.setContent(jsonWithUUIDs, { emitUpdate: false });
                } catch (error) {
                  console.error('更新编辑器内容失败:', error);
                }
              }
            }, 0);
          }
        } catch (error) {
          console.error('保存文件失败:', error);
        }
      }, 2000);
    },
    [filePath]
  );

  /**
   * 强制刷新 Tier 1 的 pending 保存（如果存在）
   *
   * 场景：
   * - 用户切出应用/窗口失焦/关闭窗口时立刻触发 Tier 2；
   * - 但如果 Tier 1 的 2 秒防抖尚未落盘，本次 commit 可能拿不到最新内容，
   *   造成“commit 很多次，但文件内容没更新”的假象。
   */
  const flushPendingTier1Save = useCallback(
    async (reason: string) => {
      if (!filePath || !editorRef.current) return;

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        console.log('[Tier 1] flushPendingTier1Save: 清除 pending 定时器', { reason, filePath });
      }

      try {
        const json = editorRef.current.getJSON();
        const jsonWithUUIDs = addBlockUUIDs(json);
        const jsonString = JSON.stringify(jsonWithUUIDs, null, 2);
        await writeFile(filePath, jsonString);
        hasUnsavedChangesRef.current = true;
        console.log('[Tier 1] flushPendingTier1Save: 已强制落盘并标记 hasUnsavedChangesRef=true', {
          reason,
          filePath,
        });
      } catch (error) {
        console.error('[Tier 1] flushPendingTier1Save: 强制落盘失败', { reason, filePath, error });
      }
    },
    [filePath]
  );

  // 创建稳定的 editorProps，避免编辑器频繁重新创建
  const editorProps = useMemo(() => ({
    attributes: {
      class: `tiptap-editor theme-${theme.id}`,
      role: 'textbox',
      'aria-label': '文档编辑器',
      'aria-multiline': 'true',
    },
    handleKeyDown: (view: any, event: Event) => {
      const currentEditor = editorRef.current;
      if (currentEditor && currentEditor.isEditable && currentEditor.view) {
        const handled = handleEditorShortcut(
          currentEditor,
          event as KeyboardEvent,
          () => {
            try {
              const { state } = currentEditor;
              const { selection } = state;
              const { $from } = selection;
              const coords = view.coordsAtPos($from.pos);
              setBlockSelectorPos({
                x: coords.left,
                y: coords.bottom,
              });
              setShowBlockSelector(true);
            } catch (error) {
              console.warn('无法获取光标位置:', error);
              setBlockSelectorPos({
                x: window.innerWidth / 2,
                y: window.innerHeight / 2,
              });
              setShowBlockSelector(true);
            }
          }
        );
        if (handled) {
          return true;
        }
      }
      return false;
    },
  }), [theme.id]);

  // 初始化 Tiptap 编辑器
  // 注意：只在客户端挂载后初始化，避免 SSR 问题
  // TipTap 会自动处理 SSR，我们只需要确保在客户端渲染
  const editor = useEditor({
    extensions: extensions, // 使用准备好的扩展
    content: initialContent || { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
    immediatelyRender: false, // Next.js SSR 需要禁用立即渲染
    editable: true,
    autofocus: true, // 自动聚焦
    editorProps: {
      ...editorProps,
      // 处理点击空白区域
      handleClick: (view, pos, event) => {
        const { state } = view;
        const { doc } = state;
        
        // 如果文档为空或只有一个空段落，确保有段落并聚焦
        if (doc.content.size === 0 || (doc.content.size === 1 && doc.firstChild?.type.name === 'paragraph' && doc.firstChild.content.size === 0)) {
          // 确保至少有一个空段落
          if (doc.content.size === 0) {
            const tr = state.tr;
            tr.insert(1, state.schema.nodes.paragraph.create());
            view.dispatch(tr);
          }
          
          // 聚焦到段落开头（延迟执行，确保DOM更新）
          setTimeout(() => {
            const dom = getEditorDOM(editorRef.current);
            if (dom) {
              dom.focus();
              try {
                if (editorRef.current && editorRef.current.view) {
                  const currentState = editorRef.current.view.state;
                  const { tr } = currentState;
                  // 移动到第一个段落的位置（位置1）
                  const selection = TextSelection.create(currentState.doc, 1);
                  tr.setSelection(selection);
                  editorRef.current.view.dispatch(tr);
                }
              } catch (error) {
                console.warn('设置光标位置失败:', error);
              }
            }
          }, 10);
          return false; // 允许默认行为，但不阻止
        }
        
        // 如果点击位置无效（在文档范围外），找到最近的文本块
        if (pos < 1 || pos > doc.content.size) {
          const mouseEvent = event as MouseEvent;
          if (!mouseEvent) return false;
          
          // 获取点击的屏幕坐标
          const clickX = mouseEvent.clientX;
          const clickY = mouseEvent.clientY;
          
          // 找到最近的文本块
          let nearestBlock: { index: number; distance: number; pos: number } | null = null;
          
          for (let i = 0; i < doc.childCount; i++) {
            const child = doc.child(i);
            // 只处理块级节点
            if (!child.isBlock) continue;
            
            try {
              // 获取块的DOM位置
              const blockStartPos = (i === 0 ? 1 : doc.child(i - 1).nodeSize + (i > 0 ? 1 : 0));
              let currentPos = 1;
              for (let j = 0; j < i; j++) {
                currentPos += doc.child(j).nodeSize;
              }
              
              // 获取块在屏幕上的位置
              const coords = view.coordsAtPos(currentPos);
              if (!coords) continue;
              
              // 计算距离（行优先：行差大于列差）
              const rowDiff = Math.abs(coords.top - clickY);
              const colDiff = Math.abs(coords.left - clickX);
              
              // 距离计算：行差优先，如果行差相同则比较列差
              const distance = rowDiff * 1000 + colDiff; // 行差权重更大
              
              if (!nearestBlock || distance < nearestBlock.distance) {
                // 在块内找到最近的位置
                let bestPos = currentPos;
                if (child.content.size > 0) {
                  // 如果有内容，尝试找到块内最近的位置
                  const blockEndPos = currentPos + child.nodeSize;
                  // 简化处理：选择块的开头
                  bestPos = currentPos + 1;
                }
                
                nearestBlock = {
                  index: i,
                  distance,
                  pos: bestPos,
                };
              }
            } catch (error) {
              // 忽略无法获取坐标的块
              continue;
            }
          }
          
          if (nearestBlock) {
            const tr = state.tr;
            const selection = TextSelection.create(doc, Math.max(1, Math.min(nearestBlock.pos, doc.content.size)));
            tr.setSelection(selection);
            view.dispatch(tr);
            
            // 聚焦编辑器
            setTimeout(() => {
              const dom = getEditorDOM(editorRef.current);
              if (dom) {
                dom.focus();
              }
            }, 0);
            return true;
          }
          
          // 如果找不到最近的块，移动到文档末尾
          const tr = state.tr;
          const endPos = doc.content.size;
          const selection = TextSelection.create(doc, Math.max(1, endPos));
          tr.setSelection(selection);
          view.dispatch(tr);
          return true;
        }
        
        // 使用默认行为
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      if (!editor || editor.isDestroyed) return;
      
      console.log('[Editor onUpdate] 编辑器内容更新');
      
      // 确保文档始终至少有一个段落
      const { doc } = editor.state;
      if (doc.content.size === 0) {
        // 如果文档为空，插入一个空段落
        editor.commands.insertContent({ type: 'paragraph', content: [] });
        // 聚焦到新插入的段落
        setTimeout(() => {
          const dom = getEditorDOM(editorRef.current);
          if (dom) {
            dom.focus();
            try {
              if (editorRef.current && editorRef.current.view) {
                const currentState = editorRef.current.view.state;
                const { tr } = currentState;
                const selection = TextSelection.create(currentState.doc, 1);
                tr.setSelection(selection);
                editorRef.current.view.dispatch(tr);
              }
            } catch (error) {
              console.warn('设置光标位置失败:', error);
            }
          }
        }, 0);
        return; // 不保存空文档状态
      }
      
      const json = editor.getJSON();
      onContentChangeRef.current?.(json);
      debouncedSave(json);
    },
    onCreate: ({ editor }) => {
      editorRef.current = editor;
      console.log('编辑器已创建，editable:', editor.isEditable, 'view:', !!editor.view);
      
      // 确保编辑器是可编辑的
      if (!editor.isEditable) {
        console.warn('编辑器不可编辑，正在修复...');
        editor.setEditable(true);
      }
      
      // 确保空文档有一个段落块（如果文档为空）
      try {
        const { doc } = editor.state;
        if (doc.content.size === 0) {
          // 插入一个空段落
          editor.commands.insertContent({ type: 'paragraph', content: [] });
        } else if (doc.content.size === 1 && doc.firstChild?.type.name === 'paragraph' && doc.firstChild.content.size === 0) {
          // 如果只有一个空段落，确保它可以显示占位符
          // 这已经在配置中处理了，不需要额外操作
        }
      } catch (error) {
        console.error('初始化空文档段落失败:', error);
      }
      
      // 编辑器创建后聚焦 - 使用 requestAnimationFrame 确保 DOM 完全准备好
      requestAnimationFrame(() => {
        setTimeout(() => {
          // 使用安全的 DOM 访问方法
          const dom = getEditorDOM(editor);
          if (dom) {
            try {
              dom.focus();
                  // 设置光标到文档开头
                  try {
                    const { state } = editor;
                    const { tr } = state;
                    // 移动到第一个节点的开头
                    if (state.doc.content.size > 0) {
                      const selection = TextSelection.create(state.doc, 1);
                      tr.setSelection(selection);
                      editor.view.dispatch(tr);
                    }
                  } catch (error) {
                    console.warn('设置光标位置失败:', error);
                  }
              console.log('编辑器已自动聚焦（DOM 直接聚焦）');
            } catch (error) {
              console.error('聚焦失败:', error);
            }
          } else {
            console.warn('编辑器 DOM 不可用，无法自动聚焦');
          }
        }, 300);
      });
    },
  }, [isMounted, extensions, debouncedSave, editorProps]); // 包含必要的依赖

  // 将 editor 存储到 ref 中
  useEffect(() => {
    if (editor) {
      editorRef.current = editor;
    }
  }, [editor]);

  // 通知父组件编辑器已准备好
  useEffect(() => {
    if (editor) {
      onEditorReady?.(editor, triggerTier2Commit);
    }
    return () => {
      onEditorReady?.(null, undefined);
    };
  }, [editor, onEditorReady]);

  // 安全获取编辑器 DOM 的辅助函数
  // 这个函数不会抛出错误，即使 view 或 dom 不可用
  const getEditorDOM = useCallback((editor: TiptapEditor | null): HTMLElement | null => {
    if (!editor || editor.isDestroyed) {
      return null;
    }
    try {
      // 使用可选链和类型保护安全地访问
      const view = editor.view;
      if (!view) {
        return null;
      }
      
      // 尝试访问 dom，如果失败则返回 null
      // 使用 getter 属性访问而不是直接属性访问
      const dom = (view as any).dom;
      if (dom && typeof dom === 'object' && 'focus' in dom) {
        return dom as HTMLElement;
      }
      return null;
    } catch (error) {
      // 任何错误都返回 null，不抛出
      return null;
    }
  }, []);

  // 当 initialContent 改变时更新编辑器内容
  useEffect(() => {
    if (!editor || !initialContent || !isInitialLoadRef.current) {
      return;
      }

    // 确保编辑器视图已准备好
    const dom = getEditorDOM(editor);
    if (!dom) {
      console.log('编辑器 DOM 尚未准备好，等待...');
      // 延迟重试
      const timeoutId = setTimeout(() => {
        if (editor && initialContent && isInitialLoadRef.current) {
          const retryDom = getEditorDOM(editor);
          if (retryDom) {
            try {
              editor.commands.setContent(initialContent);
              isInitialLoadRef.current = false;
              // 聚焦
              requestAnimationFrame(() => {
                setTimeout(() => {
                  const focusDom = getEditorDOM(editor);
                  if (focusDom) {
                    focusDom.focus();
                    console.log('内容加载后已聚焦（延迟重试）');
                  }
                }, 200);
              });
        } catch (error) {
              console.error('设置初始内容失败（延迟重试）:', error);
              isInitialLoadRef.current = false;
            }
          } else {
            // 如果还是不可用，重置标志避免无限重试
            isInitialLoadRef.current = false;
          }
        }
      }, 500);
      return () => clearTimeout(timeoutId);
    }

    try {
      // 设置内容
      editor.commands.setContent(initialContent);
      isInitialLoadRef.current = false;

      // 使用 requestAnimationFrame 确保 DOM 更新后再聚焦
      requestAnimationFrame(() => {
        setTimeout(() => {
          const focusDom = getEditorDOM(editor);
          if (focusDom) {
            focusDom.focus();
            console.log('内容加载后已聚焦');
          }
        }, 200);
      });
    } catch (error) {
      console.error('设置初始内容失败:', error);
      // 即使出错也重置标志，避免无限重试
      isInitialLoadRef.current = false;
    }
  }, [editor, initialContent, getEditorDOM]);

  // 当文件路径改变时，重置初始加载标志和未保存状态
  useEffect(() => {
    isInitialLoadRef.current = true;
    hasUnsavedChangesRef.current = false;
    onUnsavedChangesChange?.(false);
  }, [filePath, onUnsavedChangesChange]);

  // 保存滚动位置（防抖）
  const saveScrollPosition = useCallback(() => {
    if (!filePath || !scrollContainerRef.current || !editorRef.current) return;
    
    // 清除之前的定时器
    if (scrollSaveTimeoutRef.current) {
      clearTimeout(scrollSaveTimeoutRef.current);
    }
    
    // 防抖保存（500ms）
    scrollSaveTimeoutRef.current = setTimeout(() => {
      const scrollTop = scrollContainerRef.current?.scrollTop || 0;
      const cursorPosition = editorRef.current?.state.selection.anchor || 0;
      saveFileState(filePath, scrollTop, cursorPosition);
    }, 500);
  }, [filePath]);

  // 保存光标位置（防抖）
  const saveCursorPosition = useCallback(() => {
    if (!filePath || !editorRef.current) return;
    
    // 清除之前的定时器
    if (cursorSaveTimeoutRef.current) {
      clearTimeout(cursorSaveTimeoutRef.current);
    }
    
    // 防抖保存（300ms）
    cursorSaveTimeoutRef.current = setTimeout(() => {
      const cursorPosition = editorRef.current?.state.selection.anchor || 0;
      const scrollTop = scrollContainerRef.current?.scrollTop || 0;
      saveFileState(filePath, scrollTop, cursorPosition);
    }, 300);
  }, [filePath]);

  // 恢复文件状态（滚动位置和光标位置）
  const restoreFileState = useCallback(() => {
    if (!filePath || !editorRef.current || !scrollContainerRef.current) return;
    
    const state = loadFileState(filePath);
    if (!state) return;
    
    // 恢复滚动位置
    if (state.scrollTop > 0) {
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = state.scrollTop;
        }
      });
    }
    
    // 恢复光标位置
    if (state.cursorPosition > 0 && editorRef.current.view) {
      try {
        const { state: editorState } = editorRef.current;
        const { doc } = editorState;
        const validPos = Math.max(1, Math.min(state.cursorPosition, doc.content.size));
        const selection = TextSelection.create(doc, validPos);
        const tr = editorState.tr;
        tr.setSelection(selection);
        editorRef.current.view.dispatch(tr);
        
        // 聚焦编辑器
        setTimeout(() => {
          const dom = getEditorDOM(editorRef.current);
          if (dom) {
            dom.focus();
          }
        }, 100);
      } catch (error) {
        console.warn('恢复光标位置失败:', error);
      }
    }
  }, [filePath, getEditorDOM]);

  // 监听滚动事件
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const handleScroll = () => {
      saveScrollPosition();
    };
    
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [saveScrollPosition]);

  // 监听光标位置变化
  useEffect(() => {
    if (!editor) return;
    
    const handleSelectionUpdate = () => {
      saveCursorPosition();
    };
    
    editor.on('selectionUpdate', handleSelectionUpdate);
    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate);
    };
  }, [editor, saveCursorPosition]);

  // 文件路径改变时恢复状态
  useEffect(() => {
    if (!filePath || !editor || !isMounted) return;
    
    // 延迟恢复，确保编辑器内容已加载
    const timeoutId = setTimeout(() => {
      restoreFileState();
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [filePath, editor, isMounted, restoreFileState]);

  // Tier 2: Git 自动提交函数
  const triggerTier2Commit = useCallback(async () => {
    console.log('[triggerTier2Commit] 被调用', { 
      workspacePath, 
      hasUnsavedChanges: hasUnsavedChangesRef.current,
      filePath,
      syncInProgress: syncInProgressRef.current
    });
    
    if (!workspacePath) {
      console.log('[triggerTier2Commit] 提前返回：workspacePath 为空');
      return;
    }

    // 原子性保护：如果同步正在进行中，延迟 commit
    if (syncInProgressRef.current) {
      console.log('[triggerTier2Commit] 同步进行中，延迟 2 秒后重试 commit');
      setTimeout(() => triggerTier2Commit(), 2000);
      return;
    }

    console.log('[triggerTier2Commit] 开始执行提交');
    try {
      // 先确保当前文档最新内容已落盘（否则 Git 可能拿不到最新文件）
      await flushPendingTier1Save('tier2_commit');

      // 全局提交：所有 commit 都在工作区根目录执行，等价于 `git add . && git commit -m "[message]"`
      // 固定使用 workspacePath 作为 repo path，确保提交所有文件的变更
      const commitPath = workspacePath;
      
      console.log('[triggerTier2Commit] 提交路径:', commitPath);

      // 分支检查和自动纠错：确保当前在 draft 分支
      try {
        const currentBranch = await getCurrentBranch(commitPath);
        console.log('[triggerTier2Commit] 当前分支:', currentBranch);
        
        if (currentBranch !== 'draft') {
          console.warn('[triggerTier2Commit] 检测到当前分支不是 draft，自动切换到 draft 分支');
          await switchToBranch(commitPath, 'draft');
          console.log('[triggerTier2Commit] 已切换到 draft 分支');
        }
      } catch (branchError) {
        console.error('[triggerTier2Commit] 分支检查失败，继续执行 commit（commit_changes 会处理分支切换）:', branchError);
        // 分支检查失败不影响 commit，因为 commit_changes 内部也会确保分支正确
      }

      // 不再只依赖 hasUnsavedChangesRef（它只反映当前文档落盘状态）
      // 以 git status 为准：确保“全局变更（创建/删除/移动/其它文件更新）”也能触发 commit
      const status = await getRepositoryStatus(commitPath);
      console.log('[triggerTier2Commit] git status:', status);

      if (!status.has_changes) {
        console.log('[triggerTier2Commit] 提前返回：工作区无任何变更，无需提交');
        hasUnsavedChangesRef.current = false;
        onUnsavedChangesChange?.(false);
        return;
      }

      await commitChanges(commitPath, 'auto_snapshot');
      console.log('Tier 2: Git 提交成功（在 draft 分支上）');
      hasUnsavedChangesRef.current = false;
      onUnsavedChangesChange?.(false);
      
      // 双层分支模型：不再每次 commit 后都自动同步
      // Commit 会在 draft 分支上累积，只在手动同步或特定场景（应用关闭前）才同步
      // 这样可以减少 push 频率，提高性能
    } catch (error) {
      console.error('Tier 2: Git 提交失败:', error);
    }
  }, [workspacePath, filePath, flushPendingTier1Save]);

  // 前台恢复时触发 Fetch
  const triggerForegroundFetch = useCallback(async () => {
    if (!workspacePath) {
      console.log('[triggerForegroundFetch] 提前返回：workspacePath 为空');
      return;
    }

    try {
      const remoteUrl = await getRemoteUrl(workspacePath, 'origin');
      const patToken = await getPatToken();
      
      if (remoteUrl && patToken) {
        console.log('[triggerForegroundFetch] 前台恢复：执行 Fetch');
        await fetchFromRemote(workspacePath, 'origin', patToken);
        console.log('[triggerForegroundFetch] Fetch 完成');
      } else {
        console.log('[triggerForegroundFetch] 未配置远程仓库或 PAT，跳过 Fetch');
      }
    } catch (error) {
      console.error('[triggerForegroundFetch] Fetch 失败:', error);
      // Fetch 失败不影响应用使用
    }
  }, [workspacePath]);

  // Tier 2: 监听 App 后台切换和文档关闭事件
  useEffect(() => {
    if (!filePath) return;

    // Sync Protocol 桌面端补强：
    // - visibilitychange 在 Tauri Desktop 下可能不稳定
    // - 额外监听 window blur/focus 作为“进入后台/恢复前台”的等价信号
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('[Tier 2] visibilitychange 触发：应用进入后台');
        triggerTier2Commit();
      } else {
        console.log('[Tier 2] visibilitychange 触发：应用恢复前台');
        triggerForegroundFetch();
      }
    };

    const handleWindowBlur = () => {
      console.log('[Tier 2] window blur 触发：窗口失焦（桌面端后台语义）');
      triggerTier2Commit();
    };

    const handleWindowFocus = () => {
      console.log('[Tier 2] window focus 触发：窗口聚焦（桌面端前台语义）');
      triggerForegroundFetch();
    };

    const handleBeforeUnload = () => {
        console.log('[窗口关闭] ===== beforeunload 事件触发 =====');
        console.log('[窗口关闭] 时间:', new Date().toISOString());
        console.log('[窗口关闭] workspacePath:', workspacePath);
        console.log('[窗口关闭] syncInProgress:', syncInProgressRef.current);
        console.log('[窗口关闭] hasUnsavedChanges:', hasUnsavedChangesRef.current);
        
        // beforeunload 事件中不能执行异步操作，只能同步执行
        // 先触发 commit（如果有未保存更改）
        if (hasUnsavedChangesRef.current) {
          console.log('[窗口关闭] 检测到未保存更改，触发 commit');
          triggerTier2Commit().then(() => {
            console.log('[窗口关闭] commit 完成');
          }).catch(err => {
            console.error('[窗口关闭] commit 失败:', err);
          });
        } else {
          console.log('[窗口关闭] 无未保存更改，跳过 commit');
        }
        
        // 清仓同步：将 draft 分支的所有 commit 压缩并推送到远程
        // 注意：beforeunload 中的异步操作可能被浏览器终止
        // 使用非阻塞方式触发同步（不等待完成）
        if (!workspacePath) {
          console.log('[窗口关闭] workspacePath 为空，跳过清仓同步');
          return;
        }
        
        if (syncInProgressRef.current) {
          console.log('[窗口关闭] 同步正在进行中，跳过本次清仓同步');
          return;
        }
        
        console.log('[窗口关闭] 开始准备清仓同步（异步执行）');
        
        // 使用 Promise 但不 await，避免阻塞页面关闭
        (async () => {
          const syncStartTime = Date.now();
          console.log('[窗口关闭] [清仓同步] 异步函数开始执行，时间:', new Date().toISOString());
          
          try {
            console.log('[窗口关闭] [清仓同步] 步骤 1: 获取远程仓库 URL');
            const remoteUrl = await getRemoteUrl(workspacePath, 'origin');
            console.log('[窗口关闭] [清仓同步] 远程 URL:', remoteUrl ? '已配置' : '未配置');
            
            console.log('[窗口关闭] [清仓同步] 步骤 2: 获取 PAT Token');
            const patToken = await getPatToken();
            console.log('[窗口关闭] [清仓同步] PAT Token:', patToken ? '已配置' : '未配置');
            
            if (remoteUrl && patToken) {
              console.log('[窗口关闭] [清仓同步] 步骤 3: 开始执行同步操作');
              syncInProgressRef.current = true;
              
              try {
                console.log('[窗口关闭] [清仓同步] 调用 syncWithRemote...');
                const syncResult = await syncWithRemote(workspacePath, 'origin', 'main', patToken);
                const syncDuration = Date.now() - syncStartTime;
                
                if (syncResult.success) {
                  console.log('[窗口关闭] [清仓同步] ✅ 同步成功，耗时:', syncDuration, 'ms');
                  if (syncResult.has_conflict) {
                    console.warn('[窗口关闭] [清仓同步] ⚠️ 检测到冲突，冲突分支:', syncResult.conflict_branch);
                  }
                } else {
                  console.warn('[窗口关闭] [清仓同步] ❌ 同步失败，耗时:', syncDuration, 'ms');
                  console.warn('[窗口关闭] [清仓同步] 将任务加入重试队列');
                  addFailedPushTask({
                    workspacePath,
                    remoteName: 'origin',
                    branchName: 'main',
                    patToken,
                    timestamp: Date.now(),
                  });
                }
              } catch (error: any) {
                const syncDuration = Date.now() - syncStartTime;
                console.error('[窗口关闭] [清仓同步] ❌ 同步操作异常，耗时:', syncDuration, 'ms');
                console.error('[窗口关闭] [清仓同步] 错误详情:', error);
                console.error('[窗口关闭] [清仓同步] 错误消息:', error?.message || String(error));
                console.warn('[窗口关闭] [清仓同步] 将任务加入重试队列');
                addFailedPushTask({
                  workspacePath,
                  remoteName: 'origin',
                  branchName: 'main',
                  patToken,
                  timestamp: Date.now(),
                });
              } finally {
                syncInProgressRef.current = false;
                console.log('[窗口关闭] [清仓同步] 同步操作完成，已释放同步锁');
              }
            } else {
              console.log('[窗口关闭] [清仓同步] ⏭️ 跳过同步：未配置远程仓库或 PAT');
              console.log('[窗口关闭] [清仓同步] remoteUrl:', remoteUrl ? '✓' : '✗', 'patToken:', patToken ? '✓' : '✗');
            }
          } catch (error: any) {
            const syncDuration = Date.now() - syncStartTime;
            console.error('[窗口关闭] [清仓同步] ❌ 准备阶段失败，耗时:', syncDuration, 'ms');
            console.error('[窗口关闭] [清仓同步] 错误:', error);
            console.error('[窗口关闭] [清仓同步] 错误消息:', error?.message || String(error));
          }
          
          const totalDuration = Date.now() - syncStartTime;
          console.log('[窗口关闭] [清仓同步] 异步函数执行完毕，总耗时:', totalDuration, 'ms');
        })();
        
        console.log('[窗口关闭] ===== beforeunload 处理函数返回 =====');
    };

    const configPromise = readWorkspaceConfig();
    configPromise.then(async (config) => {
      const intervalMs = config.auto_commit_interval * 60 * 1000;
      console.log('[Tier 2] 设置定时器，间隔:', intervalMs, 'ms (', config.auto_commit_interval, '分钟)');
      tier2IntervalRef.current = setInterval(() => {
        console.log('[Tier 2] 定时器触发，hasUnsavedChanges:', hasUnsavedChangesRef.current);
        if (hasUnsavedChangesRef.current) {
          triggerTier2Commit();
        }
      }, intervalMs);
    }).catch((error) => {
      console.error('[Tier 2] 读取配置失败，无法设置定时器:', error);
    });

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (tier2IntervalRef.current) {
        clearInterval(tier2IntervalRef.current);
      }
    };
  }, [filePath, triggerTier2Commit, triggerForegroundFetch]);

  // 清理函数
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (tier2IntervalRef.current) {
        clearInterval(tier2IntervalRef.current);
      }
    };
  }, []);

  // 处理右键菜单
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!editor) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, [editor]);

  // 处理容器点击（空白区域）
  const handleContainerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!editor || !editor.view) return;
    
    // 如果点击的是编辑器内容本身，不处理（让编辑器自己的 handleClick 处理）
    const target = e.target as HTMLElement;
    if (target.closest('.ProseMirror')) {
      return;
    }
    
    // 获取点击坐标
    const { clientX, clientY } = e;
    
    // 使用 view.posAtCoords 尝试找到点击位置
    const pos = editor.view.posAtCoords({ left: clientX, top: clientY });
    if (pos && pos.pos !== null) {
      // 如果找到了有效位置，移动光标到那里
      const { state } = editor.view;
      const { doc } = state;
      const validPos = Math.max(1, Math.min(pos.pos, doc.content.size));
      const tr = state.tr;
      const selection = TextSelection.create(doc, validPos);
      tr.setSelection(selection);
      editor.view.dispatch(tr);
      
      // 聚焦编辑器
      setTimeout(() => {
        const dom = getEditorDOM(editorRef.current);
        if (dom) {
          dom.focus();
        }
      }, 0);
      return;
    }
    
    // 如果 posAtCoords 找不到位置，使用距离计算找到最近的块
    const { state } = editor.view;
    const { doc } = state;
    
    if (doc.content.size === 0) {
      // 如果文档为空，确保有段落并聚焦
      editor.commands.insertContent({ type: 'paragraph', content: [] });
      setTimeout(() => {
        const dom = getEditorDOM(editorRef.current);
        if (dom) {
          dom.focus();
          try {
            if (editorRef.current && editorRef.current.view) {
              const currentState = editorRef.current.view.state;
              const { tr } = currentState;
              const selection = TextSelection.create(currentState.doc, 1);
              tr.setSelection(selection);
              editorRef.current.view.dispatch(tr);
            }
          } catch (error) {
            console.warn('设置光标位置失败:', error);
          }
        }
      }, 10);
      return;
    }
    
    // 找到最近的文本块
    let nearestBlock: { index: number; distance: number; pos: number } | null = null;
    
    for (let i = 0; i < doc.childCount; i++) {
      const child = doc.child(i);
      if (!child.isBlock) continue;
      
      try {
        let currentPos = 1;
        for (let j = 0; j < i; j++) {
          currentPos += doc.child(j).nodeSize;
        }
        
        const coords = editor.view.coordsAtPos(currentPos);
        if (!coords) continue;
        
        const rowDiff = Math.abs(coords.top - clientY);
        const colDiff = Math.abs(coords.left - clientX);
        const distance = rowDiff * 1000 + colDiff; // 行差权重更大
        
        if (!nearestBlock || distance < nearestBlock.distance) {
          let bestPos = currentPos;
          if (child.content.size > 0) {
            bestPos = currentPos + 1;
          }
          
          nearestBlock = {
            index: i,
            distance,
            pos: bestPos,
          };
        }
      } catch (error) {
        continue;
      }
    }
    
    if (nearestBlock) {
      const { state } = editor.view;
      const { doc } = state;
      const tr = state.tr;
      const selection = TextSelection.create(doc, Math.max(1, Math.min(nearestBlock.pos, doc.content.size)));
      tr.setSelection(selection);
      editor.view.dispatch(tr);
      
      setTimeout(() => {
        const dom = getEditorDOM(editorRef.current);
        if (dom) {
          dom.focus();
        }
      }, 0);
    } else {
      // 如果找不到最近的块，移动到文档末尾
      const { state } = editor.view;
      const { doc } = state;
      const tr = state.tr;
      const endPos = doc.content.size;
      const selection = TextSelection.create(doc, Math.max(1, endPos));
      tr.setSelection(selection);
      editor.view.dispatch(tr);
      
      setTimeout(() => {
        const dom = getEditorDOM(editorRef.current);
        if (dom) {
          dom.focus();
        }
      }, 0);
    }
  }, [editor]);

  // 处理菜单操作
  const handleMenuAction = useCallback((action: string) => {
    if (!editor) return;
    
    // 使用安全的 DOM 访问方法检查编辑器是否可用
    const dom = getEditorDOM(editor);
    if (!dom) {
      console.warn('编辑器 DOM 不可用，无法执行菜单操作');
      return;
    }

    // 安全的聚焦方法
    const focusEditor = () => {
      const focusDom = getEditorDOM(editor);
      if (focusDom) {
        focusDom.focus();
      }
    };

    switch (action) {
      case 'copy':
        focusEditor();
        document.execCommand('copy');
        break;
      case 'cut':
        focusEditor();
        document.execCommand('cut');
        break;
      case 'paste':
        focusEditor();
        document.execCommand('paste');
        break;
      case 'selectAll':
        focusEditor();
        try {
          editor.commands.selectAll();
        } catch (error) {
          console.error('全选失败:', error);
        }
        break;
      case 'delete':
        focusEditor();
        try {
          editor.commands.deleteSelection();
        } catch (error) {
          console.error('删除选择失败:', error);
        }
        break;
    }
  }, [editor, getEditorDOM]);

  // 如果未挂载，显示加载状态
  if (!isMounted) {
    return (
      <main className="flex-1 overflow-y-auto relative">
        <EditorSkeleton />
      </main>
    );
  }

  // 如果编辑器还没有初始化，也显示加载状态
  if (!editor) {
    return (
      <main className="flex-1 overflow-y-auto relative">
        <EditorSkeleton />
      </main>
    );
  }

  return (
    <main 
      ref={(el) => {
        scrollContainerRef.current = el;
      }}
      className="flex-1 overflow-y-auto relative"
    >
      {/* 面包屑导航 */}
      <Breadcrumb filePath={filePath} workspacePath={workspacePath} />

      {/* 终端主题的扫描线效果 */}
      {theme.id === 'terminal' && (
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,118,0.06))] bg-[length:100%_2px,3px_100%] z-10"></div>
      )}

      {/* 固定的文本显示区域 - 区域位置固定，文字排布方式在内部 */}
      <div 
        className="max-w-4xl px-8 py-20 min-h-full relative mx-auto"
        onContextMenu={handleContextMenu}
        onClick={handleContainerClick}
      >
        {/* 编辑器内容 - 每个块独立对齐（通过 TextAlign 扩展） */}
        <div className="w-full">
          <EditorContent editor={editor} />
        </div>
        
        {/* 桌面端：块插入按钮（悬浮在编辑器右下角） */}
        <div className="hidden md:block fixed bottom-24 right-8 z-50">
          <button
            onClick={(e) => {
              e.stopPropagation();
              const buttonRect = e.currentTarget.getBoundingClientRect();
              setBlockSelectorPos({ 
                x: buttonRect.right,
                y: buttonRect.bottom,
              });
              setShowBlockSelector(true);
            }}
            className="w-12 h-12 rounded-full border flex items-center justify-center transition-opacity hover:opacity-80"
            style={{
              backgroundColor: getThemeSurfaceColor(theme),
              borderColor: getThemeBorderColor(theme),
              color: getThemeAccentColor(theme),
            }}
            title="转换块类型"
          >
            <Plus size={24} />
          </button>
        </div>
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onAction={handleMenuAction}
          hasSelection={editor.state.selection.empty === false}
          isBlock={true}
        />
      )}

      {/* 块类型选择器 */}
      {showBlockSelector && blockSelectorPos && (
        <BlockTypeSelector
          editor={editor}
          onClose={() => {
            setShowBlockSelector(false);
            setBlockSelectorPos(null);
          }}
          mode="desktop"
          position={blockSelectorPos}
        />
      )}
    </main>
  );
}
