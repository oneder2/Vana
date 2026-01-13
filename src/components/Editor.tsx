/**
 * No Visitors - 主编辑器组件
 * 使用 Tiptap 实现的块式编辑器
 * 支持多种块类型、实时编辑和防抖保存（Tier 1）
 */

'use client';

import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { TextSelection } from 'prosemirror-state';
import { useTheme } from './ThemeProvider';
import { getTiptapExtensions } from '@/lib/tiptap-extensions';
import { writeFile, commitChanges, readWorkspaceConfig } from '@/lib/api';
import { addBlockUUIDs } from '@/lib/smart-slice';
import { handleEditorShortcut } from '@/lib/editor-shortcuts';
import { ContextMenu } from './ContextMenu';
import { BlockTypeSelector } from './BlockTypeSelector';
import { Breadcrumb } from './Breadcrumb';
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
  onEditorReady?: (editor: TiptapEditor | null) => void;
  layout?: EditorLayout; // 布局类型
}

/**
 * 主编辑器组件
 * 使用 Tiptap 实现块式编辑和防抖保存
 */
export function Editor({ filePath, initialContent, onContentChange, workspacePath, onEditorReady }: EditorProps) {
  const { theme } = useTheme();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tier2IntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasUnsavedChangesRef = useRef(false);
  const isInitialLoadRef = useRef(true);
  const editorRef = useRef<TiptapEditor | null>(null);
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
      if (!filePath || !editorRef.current) return;

      // 清除之前的定时器
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // 设置新的定时器（2 秒后保存）
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          // 自动为块添加 UUID（如果还没有）
          const jsonWithUUIDs = addBlockUUIDs(json);
          // 直接保存 Tiptap JSON 格式（JSON 字符串）
          const jsonString = JSON.stringify(jsonWithUUIDs, null, 2);
          await writeFile(filePath, jsonString);
          console.log('文件已保存:', filePath);
          hasUnsavedChangesRef.current = true;
          
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

  // 创建稳定的 editorProps，避免编辑器频繁重新创建
  const editorProps = useMemo(() => ({
    attributes: {
      class: `tiptap-editor theme-${theme.id}`,
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
      onEditorReady?.(editor);
    }
    return () => {
      onEditorReady?.(null);
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

  // 当文件路径改变时，重置初始加载标志
  useEffect(() => {
    isInitialLoadRef.current = true;
  }, [filePath]);

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
    if (!workspacePath || !hasUnsavedChangesRef.current) {
      return;
    }

    try {
      const config = await readWorkspaceConfig();
      const commitPath = config.commit_scope === 'directory' && filePath
        ? filePath.substring(0, filePath.lastIndexOf('/'))
        : workspacePath;

      await commitChanges(commitPath, 'auto_snapshot');
      console.log('Tier 2: Git 提交成功');
      hasUnsavedChangesRef.current = false;
    } catch (error) {
      console.error('Tier 2: Git 提交失败:', error);
    }
  }, [workspacePath, filePath]);

  // Tier 2: 监听 App 后台切换和文档关闭事件
  useEffect(() => {
    if (!filePath) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        triggerTier2Commit();
      }
    };

    const handleBeforeUnload = () => {
        triggerTier2Commit();
    };

    const configPromise = readWorkspaceConfig();
    configPromise.then(async (config) => {
      const intervalMs = config.auto_commit_interval * 60 * 1000;
      tier2IntervalRef.current = setInterval(() => {
        if (hasUnsavedChangesRef.current) {
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
        <div className="max-w-4xl mx-auto px-8 py-20 min-h-full">
          <div className="text-sm opacity-50">加载编辑器...</div>
        </div>
      </main>
    );
  }

  // 如果编辑器还没有初始化，也显示加载状态
  if (!editor) {
    return (
      <main className="flex-1 overflow-y-auto relative">
        <div className="max-w-4xl mx-auto px-8 py-20 min-h-full">
          <div className="text-sm opacity-50">初始化编辑器...</div>
        </div>
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
