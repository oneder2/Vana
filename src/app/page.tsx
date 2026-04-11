/**
 * No Visitors - 主页面
 * 集成所有组件的主应用界面
 * 包含顶部导航、侧边栏、编辑器和底部状态栏
 */

'use client';

import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  Menu,
  ChevronRight,
  Shield,
  Layers,
  Database,
  MoreHorizontal,
  X,
  Archive,
  Clock3,
  Command,
  History,
  Import,
  Star,
  Trash2,
} from 'lucide-react';
import { TextSelection } from 'prosemirror-state';
import { useTheme } from '@/components/ThemeProvider';
import { useToast } from '@/components/ToastProvider';
import { Modal } from '@/components/Modal';
import { Sidebar } from '@/components/Sidebar';
import { Editor } from '@/components/Editor';
import { RadialMenu } from '@/components/RadialMenu';
import { BlockTypeSelector } from '@/components/BlockTypeSelector';
import { SearchModal } from '@/components/SearchModal';
import { AtmospherePreviewModal } from '@/components/AtmospherePreviewModal';
import { CommandPalette, type CommandPaletteItem } from '@/components/CommandPalette';
import { HistoryTimelineModal } from '@/components/HistoryTimelineModal';
import { TitleBar } from '@/components/TitleBar';
import { getAllThemes, getThemeIcon } from '@/lib/themes';
import { getThemeBgColor, getThemeSurfaceColor, getThemeBorderColor, getThemeAccentColor, getThemeAccentBgColor } from '@/lib/themeStyles';
import {
  readFile,
  getWorkspacePath,
  ensureWorkspaceInitialized,
  fetchFromRemote,
  getRemoteUrl,
  getPatToken,
  commitChanges,
  readWorkspaceConfig,
  createFile,
  deleteDirectory,
  deleteFile,
  gitGc,
  getCurrentBranch,
  listDirectory,
  moveFileOrDirectory,
  type LibraryMetadata,
  verifyRepository,
  writeWorkspaceConfig,
} from '@/lib/api';
import { retryFailedPushTasks, getQueueSize } from '@/lib/syncQueue';
import { loadAtmosphereConfig, findThemeForFile } from '@/lib/atmosphere';
import { loadWindowState, saveWindowState } from '@/lib/windowState';
import { exportToPDF, exportToDOCX, exportToMarkdown, saveMarkdownExport } from '@/lib/export';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Plus, AlignCenter, AlignLeft, AlignRight, Settings, GitCommit, Search, FileDown, Bold, Italic, Underline, Strikethrough } from 'lucide-react';
import Link from 'next/link';
import type { Editor as TiptapEditor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import type { EditorLayout } from '@/components/Editor';
import {
  createRestoreTargetPath,
  createTrashTargetPath,
  deleteLibraryEntry,
  getLibraryEntry,
  listArchivedEntries,
  listFavoriteEntries,
  listRecentEntries,
  listTrashEntries,
  loadLibraryMetadata,
  markFileOpened,
  normalizePath,
  renameLibraryEntries,
  saveLibraryMetadata,
  toRelativeWorkspacePath,
  upsertLibraryEntry,
} from '@/lib/library';
import { markdownToTiptapJSON } from '@/lib/markdown';
import { isMobile as detectMobilePlatform } from '@/lib/platform';

/**
 * 计算 JSONContent 中的字数
 */
function countWords(content: JSONContent): number {
  if (!content.content) return 0;
  
  let count = 0;
  const traverse = (node: JSONContent) => {
    if (node.type === 'text' && node.text) {
      count += node.text.length;
    }
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(traverse);
    }
  };
  
  traverse(content);
  return count;
}

// 主应用组件（需要在 ThemeProvider 内部）
function MainApp() {
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isCompactLayout, setIsCompactLayout] = useState(false);
  const [showRadial, setShowRadial] = useState(false);
  const [radialPos, setRadialPos] = useState({ x: 0, y: 0 });
  const [isPrivate, setIsPrivate] = useState(true);
  const [currentFilePath, setCurrentFilePath] = useState<string | undefined>();
  const [editorContent, setEditorContent] = useState<JSONContent>({ type: 'doc', content: [] });
  const [workspacePath, setWorkspacePath] = useState<string>('');
  const [showBlockSelector, setShowBlockSelector] = useState(false);
  const [editorInstance, setEditorInstance] = useState<TiptapEditor | null>(null);
  const [editorLayout, setEditorLayout] = useState<EditorLayout>('center');
  const [editorTriggerCommit, setEditorTriggerCommit] = useState<(() => Promise<void>) | undefined>(undefined);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState<string>('');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showAtmospherePreview, setShowAtmospherePreview] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showHistoryTimeline, setShowHistoryTimeline] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [libraryMetadata, setLibraryMetadata] = useState<LibraryMetadata>({ entries: {} });
  const [workspaceInfo, setWorkspaceInfo] = useState<{
    branch: string | null;
    commitCount: number;
    latestCommit: string | null;
  }>({
    branch: null,
    commitCount: 0,
    latestCommit: null,
  });
  const fileImportRef = useRef<HTMLInputElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia('(max-width: 767px)');
    const applyViewportState = (compact: boolean) => {
      setIsCompactLayout(compact);
      setIsSidebarOpen((prev) => (compact ? false : prev));
    };

    applyViewportState(media.matches);
    const handleChange = (event: MediaQueryListEvent) => {
      applyViewportState(event.matches);
    };

    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    detectMobilePlatform()
      .then((mobile) => {
        if (mobile) {
          setIsCompactLayout(true);
          setIsSidebarOpen(false);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!moreMenuRef.current?.contains(event.target as Node)) {
        setShowMoreMenu(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  // 窗口状态记忆（集成 Tauri 窗口 API）
  useEffect(() => {
    const restoreWindowState = async () => {
      try {
        const savedState = loadWindowState();
        if (!savedState) {
          console.log('[windowState] 没有保存的窗口状态');
          return;
        }
        
        console.log('[windowState] 恢复窗口状态:', savedState);
        const appWindow = getCurrentWindow();
        
        // 恢复窗口大小
        if (savedState.width && savedState.height) {
          // Tauri v2 使用 LogicalSize 类型
          const { LogicalSize } = await import('@tauri-apps/api/window');
          await appWindow.setSize(new LogicalSize(savedState.width, savedState.height));
          console.log('[windowState] 窗口大小已恢复:', savedState.width, 'x', savedState.height);
        }
        
        // 恢复窗口位置
        if (savedState.x !== undefined && savedState.y !== undefined) {
          // Tauri v2 使用 LogicalPosition 类型
          const { LogicalPosition } = await import('@tauri-apps/api/window');
          await appWindow.setPosition(new LogicalPosition(savedState.x, savedState.y));
          console.log('[windowState] 窗口位置已恢复:', savedState.x, ',', savedState.y);
        }
        
        // 恢复最大化状态
        if (savedState.maximized) {
          await appWindow.maximize();
          console.log('[windowState] 窗口已最大化');
        }
      } catch (error) {
        console.warn('[windowState] 恢复窗口状态失败:', error);
        // 在非 Tauri 环境中（如开发模式），忽略错误
      }
    };
    
    restoreWindowState();
  }, []);

  // 保存窗口状态（在窗口大小/位置改变时）
  useEffect(() => {
    const saveWindowStateAsync = async () => {
      try {
        const appWindow = getCurrentWindow();
        const size = await appWindow.innerSize();
        const position = await appWindow.innerPosition();
        const isMaximized = await appWindow.isMaximized();
        
        const state = {
          width: size.width,
          height: size.height,
          x: position.x,
          y: position.y,
          maximized: isMaximized,
        };
        
        saveWindowState(state);
        console.log('[windowState] 窗口状态已保存:', state);
      } catch (error) {
        // 在非 Tauri 环境中，使用 fallback
        const state = {
          width: window.innerWidth,
          height: window.innerHeight,
        };
        saveWindowState(state);
        console.warn('[windowState] 使用 fallback 保存窗口状态:', error);
      }
    };

    // 防抖保存
    let timeoutId: NodeJS.Timeout;
    const debouncedSave = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(saveWindowStateAsync, 500);
    };

    window.addEventListener('resize', debouncedSave);
    
    // 监听窗口移动（仅在 Tauri 环境中）
    let moveListenerCleanup: (() => void) | null = null;
    (async () => {
      try {
        const appWindow = getCurrentWindow();
        const cleanup = await appWindow.onMoved(() => {
          debouncedSave();
        });
        moveListenerCleanup = cleanup;
      } catch (error) {
        // 非 Tauri 环境或权限不足，忽略
        console.warn('[windowState] 无法监听窗口移动事件:', error);
      }
    })();
    
    return () => {
      window.removeEventListener('resize', debouncedSave);
      clearTimeout(timeoutId);
      if (moveListenerCleanup) {
        moveListenerCleanup();
      }
    };
  }, []);

  // 初始化工作区（仅执行一次）
  useEffect(() => {
    let isMounted = true;
    let hasInitialized = false;
    
    const initWorkspace = async () => {
      // 防止重复执行
      if (hasInitialized) {
        console.log('[initWorkspace] 已初始化，跳过重复执行');
        return;
      }
      hasInitialized = true;
      
      try {
        // 获取工作区路径
        const path = await getWorkspacePath();
        if (!isMounted) return;
        
        setWorkspacePath(path);
        
        // 确保工作区已初始化
        await ensureWorkspaceInitialized();
        if (!isMounted) return;

        const [metadata, branch, verification] = await Promise.all([
          loadLibraryMetadata(),
          getCurrentBranch(path).catch(() => null),
          verifyRepository(path).catch(() => null),
        ]);
        if (!isMounted) return;
        setLibraryMetadata(metadata);
        setWorkspaceInfo({
          branch,
          commitCount: verification?.commit_count ?? 0,
          latestCommit: verification?.latest_commit_message ?? null,
        });
        
        // 应用冷启动时执行 Fetch（根据 Sync Protocol.md）
        try {
          const remoteUrl = await getRemoteUrl(path, 'origin');
          const patToken = await getPatToken();
          
          if (!isMounted) return;
          
          if (remoteUrl && patToken) {
            console.log('[initWorkspace] 应用启动：执行 Fetch');
            await fetchFromRemote(path, 'origin', patToken);
            if (isMounted) {
            console.log('[initWorkspace] Fetch 完成');
            }
          } else {
            console.log('[initWorkspace] 未配置远程仓库或 PAT，跳过 Fetch');
          }
        } catch (fetchError) {
          if (isMounted) {
          console.error('[initWorkspace] Fetch 失败:', fetchError);
          // Fetch 失败不影响应用启动
          }
        }
      } catch (error) {
        if (isMounted) {
        console.error('初始化工作区失败:', error);
        }
      }
    };
    
    initWorkspace();
    
    return () => {
      isMounted = false;
    };
  }, []);

  // 快捷键支持：Ctrl+F / Cmd+F 打开搜索
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearchModal(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandPalette(true);
      }
      if (e.key === 'Escape' && showSearchModal) {
        setShowSearchModal(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showSearchModal]);

  // 网络恢复时执行 Fetch 和重试 Push（根据 Sync Protocol.md）
  useEffect(() => {
    if (!workspacePath) return;

    const handleOnline = async () => {
      console.log('[网络恢复] 检测到网络连接恢复');
      try {
        const remoteUrl = await getRemoteUrl(workspacePath, 'origin');
        const patToken = await getPatToken();
        
        if (remoteUrl && patToken) {
          console.log('[网络恢复] 执行 Fetch');
          await fetchFromRemote(workspacePath, 'origin', patToken);
          console.log('[网络恢复] Fetch 完成');
          
          // 网络恢复后，重试失败的 Push 任务
          try {
            console.log('[网络恢复] 开始重试失败的 Push 任务');
            const retryResult = await retryFailedPushTasks();
            console.log('[网络恢复] Push 任务重试完成:', retryResult);
          } catch (retryError) {
            console.error('[网络恢复] 重试 Push 任务失败:', retryError);
          }
        } else {
          console.log('[网络恢复] 未配置远程仓库或 PAT，跳过 Fetch');
        }
      } catch (error) {
        console.error('[网络恢复] Fetch 失败:', error);
      }
    };
    
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [workspacePath]);

  const persistLibraryState = async (next: LibraryMetadata) => {
    setLibraryMetadata(next);
    await saveLibraryMetadata(next);
  };

  const refreshWorkspaceInfo = async () => {
    if (!workspacePath) return;
    const [branch, verification] = await Promise.all([
      getCurrentBranch(workspacePath).catch(() => null),
      verifyRepository(workspacePath).catch(() => null),
    ]);
    setWorkspaceInfo({
      branch,
      commitCount: verification?.commit_count ?? 0,
      latestCommit: verification?.latest_commit_message ?? null,
    });
  };

  const handlePathRename = async (oldPath: string, newPath: string) => {
    if (!workspacePath) return;
    const next = {
      entries: { ...libraryMetadata.entries },
    };
    renameLibraryEntries(
      next,
      toRelativeWorkspacePath(workspacePath, oldPath),
      toRelativeWorkspacePath(workspacePath, newPath)
    );
    await persistLibraryState(next);
    if (currentFilePath === oldPath) {
      setCurrentFilePath(newPath);
    }
    await refreshWorkspaceInfo();
  };

  const handleToggleFavorite = async (path: string) => {
    if (!workspacePath) return;
    const relativePath = toRelativeWorkspacePath(workspacePath, path);
    const next = {
      entries: { ...libraryMetadata.entries },
    };
    const current = getLibraryEntry(next, relativePath);
    upsertLibraryEntry(next, relativePath, {
      favorite: !current.favorite,
    });
    await persistLibraryState(next);
  };

  const handleToggleArchive = async (path: string) => {
    if (!workspacePath) return;
    const relativePath = toRelativeWorkspacePath(workspacePath, path);
    const next = {
      entries: { ...libraryMetadata.entries },
    };
    const current = getLibraryEntry(next, relativePath);
    upsertLibraryEntry(next, relativePath, {
      archived_at: current.archived_at ? null : new Date().toISOString(),
    });
    await persistLibraryState(next);
  };

  const handleMoveToTrash = async (path: string) => {
    if (!workspacePath) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const trashPath = createTrashTargetPath(workspacePath, path, timestamp);
    await moveFileOrDirectory(path, trashPath);

    const relativePath = toRelativeWorkspacePath(workspacePath, path);
    const trashRelativePath = toRelativeWorkspacePath(workspacePath, trashPath);
    const next = {
      entries: { ...libraryMetadata.entries },
    };
    const current = getLibraryEntry(next, relativePath);
    deleteLibraryEntry(next, relativePath);
    upsertLibraryEntry(next, trashRelativePath, {
      ...current,
      trashed_at: new Date().toISOString(),
      original_path: relativePath,
      last_opened_at: current.last_opened_at,
    });
    await persistLibraryState(next);

    if (currentFilePath === path) {
      setCurrentFilePath(undefined);
      setEditorContent({ type: 'doc', content: [] });
    }
    toast.info('已移至回收站');
    await refreshWorkspaceInfo();
  };

  const handleRestoreFromTrash = async (trashPath: string) => {
    if (!workspacePath) return;
    const trashRelativePath = toRelativeWorkspacePath(workspacePath, trashPath);
    const entry = libraryMetadata.entries[trashRelativePath];
    const originalRelativePath = entry?.original_path;
    if (!originalRelativePath) return;

    const targetPath = `${workspacePath}/${originalRelativePath}`;
    let restoredPath = targetPath;
    try {
      await moveFileOrDirectory(trashPath, targetPath);
    } catch {
      restoredPath = createRestoreTargetPath(targetPath, Date.now().toString());
      await moveFileOrDirectory(trashPath, restoredPath);
    }

    const next = {
      entries: { ...libraryMetadata.entries },
    };
    deleteLibraryEntry(next, trashRelativePath);
    upsertLibraryEntry(next, toRelativeWorkspacePath(workspacePath, restoredPath), {
      ...entry,
      trashed_at: null,
      original_path: null,
    });
    await persistLibraryState(next);
    toast.success('文档已恢复');
    await refreshWorkspaceInfo();
  };

  const handleDeletePermanently = async (path: string) => {
    if (path.endsWith('.enc')) {
      await deleteFile(path);
    } else {
      await deleteDirectory(path);
    }

    if (!workspacePath) return;
    const next = {
      entries: { ...libraryMetadata.entries },
    };
    deleteLibraryEntry(next, toRelativeWorkspacePath(workspacePath, path));
    await persistLibraryState(next);
    toast.info('已永久删除');
    await refreshWorkspaceInfo();
  };

  const triggerMarkdownImport = () => {
    fileImportRef.current?.click();
  };

  const handleMarkdownImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !workspacePath) return;

    try {
      const markdown = await file.text();
      const filename = file.name.replace(/\.md$/i, '') || 'imported';
      const path = `${workspacePath}/${filename}`;
      const content = JSON.stringify(markdownToTiptapJSON(markdown), null, 2);
      await createFile(path, content);
      toast.success('Markdown 导入成功');
    } catch (error) {
      toast.error(`Markdown 导入失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      event.target.value = '';
    }
  };

  // 清仓同步：应用关闭前执行队列中的 Push 任务（根据 Sync Protocol.md）
  useEffect(() => {
    const handleBeforeUnload = async (event: BeforeUnloadEvent) => {
      console.log('[页面关闭] ===== page.tsx beforeunload 事件触发 =====');
      console.log('[页面关闭] 时间:', new Date().toISOString());
      console.log('[页面关闭] workspacePath:', workspacePath);
      
      const queueSize = getQueueSize();
      console.log('[页面关闭] 队列大小:', queueSize);
      
      if (queueSize > 0 && workspacePath) {
        console.log('[页面关闭] [队列处理] 检测到应用即将关闭，队列中有', queueSize, '个待处理任务');
        console.log('[页面关闭] [队列处理] 注意：beforeunload 中的异步操作可能被浏览器终止');
        
        // 注意：beforeunload 中的异步操作可能被浏览器终止
        // 使用 sendBeacon 或同步方式尝试最后一次同步
        // 这里我们尝试快速执行，但不阻塞关闭
        try {
          console.log('[页面关闭] [队列处理] 尝试获取远程配置...');
          const remoteUrl = await getRemoteUrl(workspacePath, 'origin');
          const patToken = await getPatToken();
          
          console.log('[页面关闭] [队列处理] 远程配置状态 - URL:', remoteUrl ? '已配置' : '未配置', 'PAT:', patToken ? '已配置' : '未配置');
          
          if (remoteUrl && patToken) {
            // 使用 navigator.sendBeacon 发送同步请求（如果支持）
            // 或者尝试快速同步（但可能被中断）
            console.log('[页面关闭] [队列处理] ⚠️ 由于 beforeunload 的限制，队列任务无法在此处处理');
            console.log('[页面关闭] [队列处理] ⚠️ 队列任务将在下次应用启动时通过网络恢复机制重试');
            // 由于 beforeunload 的限制，这里只记录日志
            // 实际的清仓同步应该在 Tauri 层面处理
          } else {
            console.log('[页面关闭] [队列处理] ⏭️ 跳过队列处理：未配置远程仓库或 PAT');
          }
        } catch (error) {
          console.error('[页面关闭] [队列处理] ❌ 队列处理失败:', error);
        }
      } else {
        if (queueSize === 0) {
          console.log('[页面关闭] 队列为空，无需处理');
        }
        if (!workspacePath) {
          console.log('[页面关闭] workspacePath 为空，跳过队列处理');
        }
      }
      
      console.log('[页面关闭] ===== page.tsx beforeunload 处理完成 =====');
    };
    
    console.log('[页面关闭] 注册 beforeunload 事件监听器');
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      console.log('[页面关闭] 卸载 beforeunload 事件监听器');
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [workspacePath]);

  // 加载文件
  const handleFileSelect = async (path: string) => {
    // 直接执行文件选择，自动保存当前文件（如果有未保存的更改）
    await performFileSelect(path);
    if (isCompactLayout) {
      setIsSidebarOpen(false);
    }
  };

  // 执行文件选择（实际加载文件）
  const performFileSelect = async (path: string) => {
    try {
      // 关闭旧文件时自动触发 Tier 2 提交（如果有旧文件且存在未保存的更改）
      if (currentFilePath && currentFilePath !== path && editorTriggerCommit && hasUnsavedChanges) {
        console.log('[handleFileSelect] 切换文件前自动保存并提交');
        try {
          await editorTriggerCommit();
          setHasUnsavedChanges(false); // 提交成功后清除未保存标记
        } catch (error) {
          console.error('[handleFileSelect] 切换文件时的自动保存失败:', error);
          // 即使 Commit 失败，也继续切换文件（不阻塞用户操作）
        }
      }

      const content = await readFile(path);
      
      // 尝试解析为 JSON（Tiptap 格式）
      let parsedContent: JSONContent;
      try {
        parsedContent = JSON.parse(content);
        // 验证是否为有效的 Tiptap JSON 格式
        if (!parsedContent.type || parsedContent.type !== 'doc') {
          throw new Error('Invalid Tiptap JSON format');
        }
      } catch (jsonError) {
        // 如果不是 JSON，尝试作为旧格式文本解析（向后兼容）
        console.warn('文件不是 JSON 格式，尝试解析为旧格式文本:', jsonError);
        const lines = content.split('\n\n').filter((line) => line.trim());
        const contentArray: JSONContent[] = lines.map((line) => {
          if (line.startsWith('# ')) {
            return {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: line.substring(2).trim() }],
            };
          } else if (line.startsWith('> ')) {
            return {
              type: 'blockquote',
              content: [{
                type: 'paragraph',
                content: [{ type: 'text', text: line.substring(2).trim() }],
              }],
            };
          } else {
            return {
              type: 'paragraph',
              content: [{ type: 'text', text: line.trim() }],
            };
          }
        });
        
        parsedContent = {
          type: 'doc',
          content: contentArray.length > 0 ? contentArray : [{ type: 'paragraph', content: [] }],
        };
      }

      setEditorContent(parsedContent);
      setCurrentFilePath(path);
      if (workspacePath) {
        const next = {
          entries: { ...libraryMetadata.entries },
        };
        markFileOpened(next, toRelativeWorkspacePath(workspacePath, path), new Date().toISOString());
        await persistLibraryState(next);
      }
      
      // 加载文件时，使用主题继承查找逻辑（从文件向上查找最近的.vnode.json）
      try {
        const fileTheme = await findThemeForFile(path);
        setTheme(fileTheme.id);
      } catch (error) {
        console.error('加载文件主题失败:', error);
        // 主题加载失败不影响文件加载，使用当前主题
      }
      await refreshWorkspaceInfo();
    } catch (error) {
      console.error('加载文件失败:', error);
      toast.error(`加载文件失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };


  // 处理块点击（显示环形菜单）
  const handleBlockClick = (e: React.MouseEvent) => {
    setRadialPos({ x: e.clientX, y: e.clientY });
    setShowRadial(true);
  };

  // 处理目录切换，加载氛围协议
  const handleDirectoryChange = async (path: string) => {
    try {
      const theme = await loadAtmosphereConfig(path);
      setTheme(theme.id);
    } catch (error) {
      console.error('加载氛围协议失败:', error);
    }
  };

  const favoriteItems = useMemo(
    () => workspacePath
      ? listFavoriteEntries(libraryMetadata).map((path) => `${workspacePath}/${path}`)
      : [],
    [libraryMetadata, workspacePath]
  );
  const recentItems = useMemo(
    () => workspacePath
      ? listRecentEntries(libraryMetadata, 10).map((path) => `${workspacePath}/${path}`)
      : [],
    [libraryMetadata, workspacePath]
  );
  const archivedItems = useMemo(
    () => workspacePath
      ? listArchivedEntries(libraryMetadata).map((path) => `${workspacePath}/${path}`)
      : [],
    [libraryMetadata, workspacePath]
  );
  const trashItems = useMemo(
    () => workspacePath
      ? listTrashEntries(libraryMetadata).map(([path, entry]) => ({
          path: `${workspacePath}/${path}`,
          entry,
        }))
      : [],
    [libraryMetadata, workspacePath]
  );
  const currentRelativePath = currentFilePath && workspacePath
    ? toRelativeWorkspacePath(workspacePath, currentFilePath)
    : null;
  const currentLibraryEntry = currentRelativePath
    ? getLibraryEntry(libraryMetadata, currentRelativePath)
    : null;
  const currentFileName = currentFilePath
    ? currentFilePath.split('/').pop()?.replace('.json', '') || 'Untitled'
    : 'No Document Selected';
  const currentFileLocation = currentFilePath
    ? toRelativeWorkspacePath(workspacePath, currentFilePath).split('/').slice(0, -1).join('/') || 'Workspace Root'
    : 'Select a file from the sidebar';

  const commandPaletteItems: CommandPaletteItem[] = useMemo(() => {
    const items: CommandPaletteItem[] = [
      {
        id: 'search',
        title: '搜索文档内容',
        group: 'Navigation',
        keywords: ['find', 'search'],
        onSelect: () => setShowSearchModal(true),
      },
      {
        id: 'history',
        title: '打开历史时间线',
        group: 'Navigation',
        keywords: ['history', 'commits', 'timeline'],
        onSelect: () => setShowHistoryTimeline(true),
      },
      {
        id: 'import-markdown',
        title: '导入 Markdown',
        group: 'Content',
        keywords: ['markdown', 'import'],
        onSelect: triggerMarkdownImport,
      },
      {
        id: 'settings',
        title: '打开设置',
        group: 'Navigation',
        onSelect: () => {
          window.location.href = '/settings';
        },
      },
    ];

    if (currentFilePath) {
      items.push(
        {
          id: 'favorite',
          title: currentLibraryEntry?.favorite ? '取消收藏当前文档' : '收藏当前文档',
          group: 'Current File',
          onSelect: () => handleToggleFavorite(currentFilePath),
        },
        {
          id: 'archive',
          title: currentLibraryEntry?.archived_at ? '取消归档当前文档' : '归档当前文档',
          group: 'Current File',
          onSelect: () => handleToggleArchive(currentFilePath),
        },
        {
          id: 'trash',
          title: '将当前文档移至回收站',
          group: 'Current File',
          onSelect: () => handleMoveToTrash(currentFilePath),
        }
      );
    }

    recentItems.slice(0, 8).forEach((path) => {
      items.push({
        id: `open:${path}`,
        title: `打开 ${path.split('/').pop()}`,
        subtitle: path,
        group: 'Recent Files',
        onSelect: () => handleFileSelect(path),
      });
    });

    return items;
  }, [currentFilePath, currentLibraryEntry?.archived_at, currentLibraryEntry?.favorite, recentItems]);

  return (
    <div
      className={`fixed inset-0 flex flex-col transition-colors duration-700 ${theme.font} ${
        theme.id === 'vellum' ? 'text-stone-800' : 'text-stone-300'
      }`}
      style={{
        backgroundColor: getThemeBgColor(theme),
      }}
    >
      {/* 自定义标题栏（窗口控制） */}
      <TitleBar />
      
      {/* 顶部导航栏 (The Deck) */}
      <header
        className={`h-16 flex items-center justify-between px-4 z-50 border-b transition-transform duration-300`}
        style={{
          backgroundColor: getThemeSurfaceColor(theme),
          borderColor: getThemeBorderColor(theme),
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="block shrink-0"
          >
            <Menu size={20} style={{ color: getThemeAccentColor(theme) }} />
          </button>
          <div className="min-w-0">
            <div
              className={`flex items-center gap-1 text-[10px] ${theme.uiFont} uppercase tracking-[0.18em] opacity-50 min-w-0`}
            >
              <span>STYX-Ω</span>
              <ChevronRight size={10} />
              <span className="truncate">{currentFileLocation}</span>
            </div>
            <div className="flex items-center gap-2 min-w-0 mt-0.5">
              <span
                className="truncate text-sm"
                style={{ color: getThemeAccentColor(theme) }}
                title={currentFileName}
              >
                {currentFileName}
              </span>
              {currentLibraryEntry?.favorite && (
                <span className="hidden sm:inline text-[10px] uppercase opacity-50">Favorite</span>
              )}
              {currentLibraryEntry?.archived_at && (
                <span className="hidden sm:inline text-[10px] uppercase opacity-50">Archived</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 max-w-[62vw] overflow-x-auto no-scrollbar">
          {/* 移动端：块插入按钮 */}
          <button
            onClick={() => setShowBlockSelector(true)}
            className="md:hidden"
            style={{ color: getThemeAccentColor(theme) }}
            title="插入新块"
          >
            <Plus size={20} />
          </button>
          
          {/* 文本格式化按钮组 */}
          <div className="hidden md:flex items-center gap-1 border rounded"
            style={{
              borderColor: getThemeBorderColor(theme),
              backgroundColor: getThemeSurfaceColor(theme),
            }}
          >
            <button
              onClick={() => {
                if (editorInstance) {
                  editorInstance.chain().focus().toggleBold().run();
                }
              }}
              className={`p-1.5 transition-opacity ${
                editorInstance?.isActive('bold') ? 'opacity-100' : 'opacity-50 hover:opacity-75'
              }`}
              style={{
                color: editorInstance?.isActive('bold') ? getThemeAccentColor(theme) : undefined,
              }}
              title="粗体 (Ctrl+B / Cmd+B)"
            >
              <Bold size={16} />
            </button>
            <button
              onClick={() => {
                if (editorInstance) {
                  editorInstance.chain().focus().toggleItalic().run();
                }
              }}
              className={`p-1.5 transition-opacity ${
                editorInstance?.isActive('italic') ? 'opacity-100' : 'opacity-50 hover:opacity-75'
              }`}
              style={{
                color: editorInstance?.isActive('italic') ? getThemeAccentColor(theme) : undefined,
              }}
              title="斜体 (Ctrl+I / Cmd+I)"
            >
              <Italic size={16} />
            </button>
            <button
              onClick={() => {
                if (editorInstance) {
                  editorInstance.chain().focus().toggleUnderline().run();
                }
              }}
              className={`p-1.5 transition-opacity ${
                editorInstance?.isActive('underline') ? 'opacity-100' : 'opacity-50 hover:opacity-75'
              }`}
              style={{
                color: editorInstance?.isActive('underline') ? getThemeAccentColor(theme) : undefined,
              }}
              title="下划线 (Ctrl+U / Cmd+U)"
            >
              <Underline size={16} />
            </button>
            <button
              onClick={() => {
                if (editorInstance) {
                  editorInstance.chain().focus().toggleStrike().run();
                }
              }}
              className={`p-1.5 transition-opacity ${
                editorInstance?.isActive('strike') ? 'opacity-100' : 'opacity-50 hover:opacity-75'
              }`}
              style={{
                color: editorInstance?.isActive('strike') ? getThemeAccentColor(theme) : undefined,
              }}
              title="删除线 (Ctrl+Shift+X / Cmd+Shift+X)"
            >
              <Strikethrough size={16} />
            </button>
          </div>

          {/* 文本对齐按钮组 - 每个块独立对齐 */}
          <div className="hidden md:flex items-center gap-1 border rounded"
            style={{
              borderColor: getThemeBorderColor(theme),
              backgroundColor: getThemeSurfaceColor(theme),
            }}
          >
            <button
              onClick={() => {
                if (editorInstance) {
                  editorInstance.chain().focus().setTextAlign('left').run();
                }
              }}
              className={`p-1.5 transition-opacity ${
                editorInstance?.isActive({ textAlign: 'left' }) ? 'opacity-100' : 'opacity-50 hover:opacity-75'
              }`}
              style={{
                color: editorInstance?.isActive({ textAlign: 'left' }) ? getThemeAccentColor(theme) : undefined,
              }}
              title="居左对齐"
            >
              <AlignLeft size={16} />
            </button>
            <button
              onClick={() => {
                if (editorInstance) {
                  editorInstance.chain().focus().setTextAlign('center').run();
                }
              }}
              className={`p-1.5 transition-opacity ${
                editorInstance?.isActive({ textAlign: 'center' }) ? 'opacity-100' : 'opacity-50 hover:opacity-75'
              }`}
              style={{
                color: editorInstance?.isActive({ textAlign: 'center' }) ? getThemeAccentColor(theme) : undefined,
              }}
              title="居中对齐"
            >
              <AlignCenter size={16} />
            </button>
            <button
              onClick={() => {
                if (editorInstance) {
                  editorInstance.chain().focus().setTextAlign('right').run();
                }
              }}
              className={`p-1.5 transition-opacity ${
                editorInstance?.isActive({ textAlign: 'right' }) ? 'opacity-100' : 'opacity-50 hover:opacity-75'
              }`}
              style={{
                color: editorInstance?.isActive({ textAlign: 'right' }) ? getThemeAccentColor(theme) : undefined,
              }}
              title="居右对齐"
            >
              <AlignRight size={16} />
            </button>
          </div>
          
          <div className="flex items-center gap-2" title={syncMessage || '同步状态'}>
            <span
              className={`text-[9px] ${theme.uiFont} opacity-40 hidden sm:block`}
            >
              {syncStatus === 'syncing' ? '同步中...' : syncStatus === 'error' ? '同步失败' : 'SYNC_STABLE'}
            </span>
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                syncStatus === 'syncing' 
                  ? 'bg-yellow-500'
                  : syncStatus === 'error'
                  ? 'bg-red-500'
                  : theme.accent === 'text-stone-800' ? 'bg-green-600' : 'bg-emerald-500'
              } ${theme.glow}`}
            ></div>
          </div>
          {/* 搜索按钮 */}
          <button
            onClick={() => setShowSearchModal(true)}
            className="p-1.5 transition-opacity opacity-50 hover:opacity-100 shrink-0"
            style={{ color: getThemeAccentColor(theme) }}
            title="搜索文档 (Ctrl+F / Cmd+F)"
          >
            <Search size={18} />
          </button>

          <button
            onClick={() => setShowCommandPalette(true)}
            className="p-1.5 transition-opacity opacity-50 hover:opacity-100 shrink-0"
            style={{ color: getThemeAccentColor(theme) }}
            title="命令面板 (Ctrl+K / Cmd+K)"
          >
            <Command size={18} />
          </button>

          {currentFilePath && (
            <button
              onClick={() => handleToggleFavorite(currentFilePath)}
              className="p-1.5 transition-opacity opacity-50 hover:opacity-100 shrink-0"
              style={{ color: getThemeAccentColor(theme) }}
              title={currentLibraryEntry?.favorite ? '取消收藏' : '收藏'}
            >
              <Star size={18} fill={currentLibraryEntry?.favorite ? 'currentColor' : 'none'} />
            </button>
          )}

          {/* 导出按钮 */}
          {currentFilePath && editorContent && (
            <div className="relative group hidden sm:block shrink-0">
              {/* 扩大悬停判定区域 */}
              <div className="absolute -inset-2 group-hover:block hidden" />

              <button
                className="p-1.5 transition-opacity opacity-50 hover:opacity-100 relative z-10"
                style={{ color: getThemeAccentColor(theme) }}
                title="导出文档"
              >
                <FileDown size={18} />
              </button>

              {/* 导出菜单 - 添加过渡区域 */}
              <div
                className="absolute right-0 top-full pt-2 hidden group-hover:block z-50"
              >
                <div
                  className="rounded border shadow-lg"
                  style={{
                    backgroundColor: getThemeSurfaceColor(theme),
                    borderColor: getThemeBorderColor(theme),
                  }}
                >
                  <button
                    onClick={async () => {
                      try {
                        const filename = currentFilePath.split('/').pop()?.replace('.json', '') || 'document';
                        await exportToPDF(editorContent, theme, filename);
                        toast.success('PDF 导出成功');
                      } catch (error) {
                        console.error('导出 PDF 失败:', error);
                        toast.error(`导出 PDF 失败: ${error instanceof Error ? error.message : String(error)}`);
                      }
                    }}
                    className="block w-full px-4 py-2 text-left text-sm hover:opacity-80 transition-opacity whitespace-nowrap"
                    style={{ color: getThemeAccentColor(theme) }}
                  >
                    导出为 PDF
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const filename = currentFilePath.split('/').pop()?.replace('.json', '') || 'document';
                        await exportToDOCX(editorContent, theme, filename);
                        toast.success('DOCX 导出成功');
                      } catch (error) {
                        console.error('导出 DOCX 失败:', error);
                        toast.error(`导出 DOCX 失败: ${error instanceof Error ? error.message : String(error)}`);
                      }
                    }}
                    className="block w-full px-4 py-2 text-left text-sm hover:opacity-80 transition-opacity whitespace-nowrap"
                    style={{ color: getThemeAccentColor(theme) }}
                  >
                    导出为 DOCX
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const filename = currentFilePath.split('/').pop()?.replace('.json', '') || 'document';
                        const markdown = exportToMarkdown(editorContent);
                        await saveMarkdownExport(filename, markdown);
                        toast.success('Markdown 导出成功');
                      } catch (error) {
                        console.error('导出 Markdown 失败:', error);
                        toast.error(`导出 Markdown 失败: ${error instanceof Error ? error.message : String(error)}`);
                      }
                    }}
                    className="block w-full px-4 py-2 text-left text-sm hover:opacity-80 transition-opacity whitespace-nowrap"
                    style={{ color: getThemeAccentColor(theme) }}
                  >
                    导出为 Markdown
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="relative shrink-0" ref={moreMenuRef}>
            <button
              onClick={() => setShowMoreMenu((open) => !open)}
              className="p-1.5 transition-opacity opacity-50 hover:opacity-100"
              style={{ color: getThemeAccentColor(theme) }}
              title="更多操作"
            >
              <MoreHorizontal size={18} />
            </button>
            {showMoreMenu && (
              <div
                className="absolute right-0 top-full mt-2 w-52 rounded border shadow-lg z-50 p-1"
                style={{
                  backgroundColor: getThemeSurfaceColor(theme),
                  borderColor: getThemeBorderColor(theme),
                }}
              >
                <button
                  onClick={() => {
                    setShowHistoryTimeline(true);
                    setShowMoreMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm rounded hover:opacity-80"
                  style={{ color: getThemeAccentColor(theme) }}
                >
                  <History size={16} />
                  <span>历史时间线</span>
                </button>
                <button
                  onClick={() => {
                    triggerMarkdownImport();
                    setShowMoreMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm rounded hover:opacity-80"
                  style={{ color: getThemeAccentColor(theme) }}
                >
                  <Import size={16} />
                  <span>导入 Markdown</span>
                </button>
                <button
                  onClick={() => {
                    setShowAtmospherePreview(true);
                    setShowMoreMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm rounded hover:opacity-80"
                  style={{ color: getThemeAccentColor(theme) }}
                >
                  <Clock3 size={16} />
                  <span>氛围预览</span>
                </button>
                {currentFilePath && (
                  <>
                    <button
                      onClick={() => {
                        handleToggleArchive(currentFilePath);
                        setShowMoreMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm rounded hover:opacity-80"
                      style={{ color: getThemeAccentColor(theme) }}
                    >
                      <Archive size={16} />
                      <span>{currentLibraryEntry?.archived_at ? '取消归档' : '归档文档'}</span>
                    </button>
                    <button
                      onClick={() => {
                        handleMoveToTrash(currentFilePath);
                        setShowMoreMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm rounded hover:opacity-80"
                      style={{ color: getThemeAccentColor(theme) }}
                    >
                      <Trash2 size={16} />
                      <span>移至回收站</span>
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          if (!workspacePath) {
                            toast.error('工作区路径为空');
                            return;
                          }
                          await commitChanges(workspacePath, 'manual_debug_commit');
                          toast.success('提交成功');
                        } catch (error) {
                          toast.error(`提交失败: ${error instanceof Error ? error.message : String(error)}`);
                        } finally {
                          setShowMoreMenu(false);
                        }
                      }}
                      className="w-full hidden sm:flex items-center gap-2 px-3 py-2 text-left text-sm rounded hover:opacity-80"
                      style={{ color: getThemeAccentColor(theme) }}
                    >
                      <GitCommit size={16} />
                      <span>手动提交</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          
          <Link
            href="/settings"
            style={{ color: getThemeAccentColor(theme) }}
            className="hover:opacity-80 transition-opacity shrink-0"
            title="设置"
          >
            <Settings size={18} />
          </Link>
          <button
            onClick={() => setIsPrivate(!isPrivate)}
            style={{ color: getThemeAccentColor(theme) }}
            className="shrink-0"
          >
            {isPrivate ? <Shield size={18} /> : <Layers size={18} />}
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* 移动端遮罩层 */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 md:hidden transition-opacity duration-300"
            onClick={() => setIsSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* 左侧资源管理器 - 固定位置，不受滚动影响 */}
        <Sidebar
          workspacePath={workspacePath}
          onFileSelect={handleFileSelect}
          onDirectoryChange={handleDirectoryChange}
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          currentFilePath={currentFilePath}
          favoritePaths={favoriteItems}
          recentPaths={recentItems}
          archivedPaths={archivedItems}
          trashEntries={trashItems}
          onMoveToTrash={handleMoveToTrash}
          onRestoreFromTrash={handleRestoreFromTrash}
          onDeletePermanently={handleDeletePermanently}
          onPathRename={handlePathRename}
        />

        {/* 主编辑区 - 可以滚动 */}
        <div
          className="flex-1 relative overflow-y-auto"
          onClick={(e) => {
            // 只在点击编辑器外部区域时关闭菜单，避免阻止编辑器事件
            if (e.target === e.currentTarget) {
              setShowRadial(false);
            }
            
            // 如果点击在主编辑区，但没有点击在编辑器内容上，触发 Editor 的容器点击处理
            const target = e.target as HTMLElement;
            const editorMain = target.closest('main');
            const editorContent = target.closest('.ProseMirror');
            
            // 如果点击在主编辑区容器内，但不在编辑器内容上，且编辑器实例存在
            if (!editorContent && editorInstance && editorInstance.view) {
              // 检查是否点击在 Editor 的 main 标签内
              if (editorMain) {
                // 点击在 Editor 的 main 内，但不在编辑器内容上，触发容器点击
                const { clientX, clientY } = e;
                const { view } = editorInstance;
                
                // 使用 view.posAtCoords 尝试找到点击位置
                const pos = view.posAtCoords({ left: clientX, top: clientY });
                if (pos && pos.pos !== null) {
                  const { state } = view;
                  const { doc } = state;
                  const validPos = Math.max(1, Math.min(pos.pos, doc.content.size));
                  const tr = state.tr;
                  const selection = TextSelection.create(doc, validPos);
                  tr.setSelection(selection);
                  view.dispatch(tr);
                  
                  setTimeout(() => {
                    const dom = view.dom;
                    if (dom) {
                      (dom as HTMLElement).focus();
                    }
                  }, 0);
                  return;
                }
                
                // 如果 posAtCoords 找不到位置，使用距离计算找到最近的块
                const { state } = view;
                const { doc } = state;
                
                if (doc.content.size > 0) {
                  let nearestBlock: { index: number; distance: number; pos: number } | null = null;
                  
                  for (let i = 0; i < doc.childCount; i++) {
                    const child = doc.child(i);
                    if (!child.isBlock) continue;
                    
                    try {
                      let currentPos = 1;
                      for (let j = 0; j < i; j++) {
                        currentPos += doc.child(j).nodeSize;
                      }
                      
                      const coords = view.coordsAtPos(currentPos);
                      if (!coords) continue;
                      
                      const rowDiff = Math.abs(coords.top - clientY);
                      const colDiff = Math.abs(coords.left - clientX);
                      const distance = rowDiff * 1000 + colDiff;
                      
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
                    const { state } = view;
                    const { doc } = state;
                    const tr = state.tr;
                    const selection = TextSelection.create(doc, Math.max(1, Math.min(nearestBlock.pos, doc.content.size)));
                    tr.setSelection(selection);
                    view.dispatch(tr);
                    
                    setTimeout(() => {
                      const dom = view.dom;
                      if (dom) {
                        (dom as HTMLElement).focus();
                      }
                    }, 0);
                  }
                }
              }
            }
          }}
        >
          <div className={isPrivate ? '' : 'blur-xl select-none opacity-20'}>
            <Editor
              filePath={currentFilePath}
              initialContent={editorContent}
              onContentChange={setEditorContent}
              workspacePath={workspacePath}
              onEditorReady={(editor, triggerCommit) => {
                setEditorInstance(editor);
                setEditorTriggerCommit(() => triggerCommit);
              }}
              onUnsavedChangesChange={setHasUnsavedChanges}
            />
          </div>
        </div>
      </div>

      {/* 环形菜单 */}
      {showRadial && (
        <RadialMenu
          x={radialPos.x}
          y={radialPos.y}
          onClose={() => setShowRadial(false)}
          onAction={(action) => {
            console.log('执行操作:', action);
            
            if (!editorInstance) {
              toast.error('编辑器未就绪');
              return;
            }
            
            try {
              switch (action) {
                case 'h1':
                  // 将当前块转换为 H1
                  editorInstance.chain().focus().setHeading({ level: 1 }).run();
                  toast.success('已转换为标题');
                  break;
                case 'quote':
                  // 切换引用块
                  editorInstance.chain().focus().toggleBlockquote().run();
                  toast.success('已切换引用块');
                  break;
                case 'list':
                  // 切换无序列表
                  editorInstance.chain().focus().toggleBulletList().run();
                  toast.success('已切换列表');
                  break;
                case 'meta':
                  // 切换元数据块（代码块作为占位）
                  if (editorInstance.isActive('codeBlock')) {
                    editorInstance.chain().focus().toggleCodeBlock().run();
                    toast.success('已切换代码块');
                  } else {
                    editorInstance.chain().focus().toggleCodeBlock().run();
                    toast.success('已创建代码块');
                  }
                  break;
                default:
                  console.warn('未知操作:', action);
              }
            } catch (error) {
              console.error('执行操作失败:', error);
              toast.error(`操作失败: ${error instanceof Error ? error.message : String(error)}`);
            }
          }}
        />
      )}

      {/* 底部信息栏 */}
      <footer
        className={`h-8 flex items-center justify-between px-4 text-[9px] ${theme.uiFont} opacity-30 border-t`}
        style={{
          backgroundColor: getThemeSurfaceColor(theme),
          borderColor: getThemeBorderColor(theme),
        }}
      >
        <div className="truncate">PROJECT: NO VISITORS // ARCHIVE_STYX_OMEGA</div>
        <div className="hidden md:flex gap-4">
          <span>WORDS: {countWords(editorContent)}</span>
          <span>BRANCH: {workspaceInfo.branch || 'main'}</span>
          <span>COMMITS: {workspaceInfo.commitCount}</span>
          <span>PLANAR: STABLE</span>
        </div>
      </footer>

      <input
        ref={fileImportRef}
        type="file"
        accept=".md,text/markdown"
        className="hidden"
        onChange={handleMarkdownImport}
      />

      {/* 移动端浮动操作按钮 */}
      <div className="md:hidden fixed bottom-6 right-6 z-[60]">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-14 h-14 rounded-full border flex items-center justify-center"
            style={{
              backgroundColor: getThemeSurfaceColor(theme),
              borderColor: getThemeBorderColor(theme),
              color: getThemeAccentColor(theme),
              boxShadow: theme.glow !== 'shadow-none' ? theme.glow.replace('shadow-', '') : undefined,
            }}
          >
            {isSidebarOpen ? <X size={24} /> : <Database size={24} />}
          </button>
      </div>


      {/* 移动端：块类型选择器（底部上拉框） */}
      {showBlockSelector && (
        <BlockTypeSelector
          editor={editorInstance}
          onClose={() => setShowBlockSelector(false)}
          mode="mobile"
        />
      )}


      {/* 搜索模态框 */}
      <SearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        workspacePath={workspacePath}
        onFileSelect={handleFileSelect}
      />

      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        items={commandPaletteItems}
      />

      <HistoryTimelineModal
        isOpen={showHistoryTimeline}
        onClose={() => setShowHistoryTimeline(false)}
        workspacePath={workspacePath}
      />

      {/* 氛围协议预览模态框 */}
      <AtmospherePreviewModal
        isOpen={showAtmospherePreview}
        onClose={() => setShowAtmospherePreview(false)}
        />
    </div>
  );
}

// 导出主页面组件
export default function HomePage() {
  return <MainApp />;
}
