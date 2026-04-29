'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/core';
import type { Editor as TiptapEditor } from '@tiptap/react';
import {
  ChevronRight,
  Clock3,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  Heart,
  Import,
  Menu,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { TitleBar } from '@/components/TitleBar';
import { AppMenuBar, type MenuAction } from '@/components/AppMenuBar';
import { Editor } from '@/components/Editor';
import { DocumentExplorerTree } from '@/components/DocumentExplorerTree';
import { ContextMenu, type ContextMenuItem } from '@/components/ContextMenu';
import { InputModal } from '@/components/InputModal';
import { SearchModal } from '@/components/SearchModal';
import { useTheme } from '@/components/ThemeProvider';
import { useToast } from '@/components/ToastProvider';
import {
  createDocument,
  ensureWorkspaceInitialized,
  getAppState,
  getDocument,
  importLegacyWorkspace,
  listDocuments,
  listTags,
  moveDocument,
  saveDocument,
  setDocumentStatus,
  toggleFavorite,
  type AppState,
  type DocumentRecord,
  type DocumentSummary,
  type TagRecord,
} from '@/lib/api';
import { exportToDOCX, exportToMarkdown, exportToPDF, saveMarkdownExport } from '@/lib/export';
import { runSupabaseSync } from '@/lib/supabaseSync';
import {
  getThemeAccentBgColor,
  getThemeAccentColor,
  getThemeBgColor,
  getThemeBorderColor,
  getThemeSurfaceColor,
} from '@/lib/themeStyles';
import { AppLink, useRouter } from '@/lib/router';
import type { ThemeId } from '@/lib/themes';

type StatusFilter = 'active' | 'recent' | 'trashed';

function parseContent(raw: string): JSONContent {
  try {
    return JSON.parse(raw) as JSONContent;
  } catch {
    return { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
  }
}

function extractPlainText(node?: JSONContent): string {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  return (node.content ?? []).map(extractPlainText).join('');
}

function replaceTextInContent(node: JSONContent, findValue: string, replaceValue: string): JSONContent {
  if (node.type === 'text' && node.text) {
    return {
      ...node,
      text: node.text.split(findValue).join(replaceValue),
    };
  }

  if (!node.content) {
    return node;
  }

  return {
    ...node,
    content: node.content.map((child) => replaceTextInContent(child, findValue, replaceValue)),
  };
}

function documentDisplaySegments(document: DocumentSummary | DocumentRecord | null): string[] {
  if (!document) return [];
  return [document.title].map((segment) => segment.trim()).filter(Boolean);
}

function documentLeafTitle(document: DocumentSummary | DocumentRecord | null): string {
  const segments = documentDisplaySegments(document);
  return segments[segments.length - 1] ?? document?.title ?? 'Untitled';
}

function formatTimestamp(value?: string | null): string {
  if (!value) return '尚未记录';
  return new Date(value).toLocaleString();
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${Math.round(value / 1024)} KB`;
  }
  return `${value} B`;
}

function collectFolderTargets(
  documents: DocumentSummary[],
  target: DocumentSummary | null
): Array<{ id: string | null; title: string; depth: number }> {
  const folders = documents.filter((document) => document.node_kind === 'folder');

  if (!target) {
    return [{ id: null, title: '根目录', depth: 0 }, ...folders.map((folder) => ({ id: folder.id, title: folder.title, depth: folder.depth }))];
  }

  const byId = new Map(documents.map((document) => [document.id, document]));
  const blocked = new Set<string>([target.id]);
  if (target.node_kind === 'folder') {
    const queue = [target.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const document of documents) {
        if (document.parent_id === current) {
          if (!blocked.has(document.id)) {
            blocked.add(document.id);
            if (document.node_kind === 'folder') {
              queue.push(document.id);
            }
          }
        }
      }
    }
  }

  return [
    { id: null, title: '根目录', depth: 0 },
    ...folders
      .filter((folder) => !blocked.has(folder.id))
      .map((folder) => {
        let safeDepth = folder.depth;
        let cursor = folder.parent_id;
        let guard = 0;
        while (cursor && guard < 16) {
          const parent = byId.get(cursor);
          if (!parent) break;
          safeDepth = parent.depth + 1;
          cursor = parent.parent_id;
          guard += 1;
        }
        return {
          id: folder.id,
          title: folder.title,
          depth: safeDepth,
        };
      }),
  ];
}

function buildTaggedTreeScope(
  documents: DocumentSummary[],
  selectedTag: string | null,
  selectedStatus: StatusFilter
): DocumentSummary[] {
  const statusMatchedDocuments = documents.filter((document) => {
    if (selectedStatus === 'active') {
      return document.status === 'active';
    }
    if (selectedStatus === 'trashed') {
      return document.status === 'trashed' || document.status === 'archived';
    }
    return document.node_kind === 'document' && document.status === 'active';
  });

  if (!selectedTag || selectedStatus === 'recent') {
    return statusMatchedDocuments;
  }

  const byId = new Map(documents.map((document) => [document.id, document]));
  const includedIds = new Set<string>();

  for (const document of statusMatchedDocuments) {
    if (document.node_kind !== 'document' || !document.tags.includes(selectedTag)) {
      continue;
    }

    includedIds.add(document.id);
    let parentId = document.parent_id;
    let guard = 0;
    while (parentId && guard < 16) {
      includedIds.add(parentId);
      parentId = byId.get(parentId)?.parent_id ?? null;
      guard += 1;
    }
  }

  return statusMatchedDocuments.filter((document) => includedIds.has(document.id));
}

function ExplorerSection({
  title,
  count,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  const accent = getThemeAccentColor(theme);
  const accentBg = getThemeAccentBgColor(theme);

  return (
    <section className="border-b px-2 py-2" style={{ borderColor: `${getThemeBorderColor(theme)}80` }}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left"
        style={{ color: accent }}
      >
        <div className="flex items-center gap-2">
          <ChevronRight size={12} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
          <span className={`text-[10px] uppercase tracking-[0.24em] opacity-60 ${theme.uiFont}`}>{title}</span>
        </div>
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] opacity-70"
          style={{ backgroundColor: `${accentBg}55`, color: accent }}
        >
          {count}
        </span>
      </button>
      {expanded && <div className="mt-1">{children}</div>}
    </section>
  );
}

export default function HomePage() {
  const { theme, setTheme } = useTheme();
  const { navigate } = useRouter();
  const toast = useToast();
  const accent = getThemeAccentColor(theme);
  const border = getThemeBorderColor(theme);
  const surface = getThemeSurfaceColor(theme);
  const background = getThemeBgColor(theme);
  const accentBg = getThemeAccentBgColor(theme);

  const [appState, setAppState] = useState<AppState | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('active');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentDocument, setCurrentDocument] = useState<DocumentRecord | null>(null);
  const [content, setContent] = useState<JSONContent>({ type: 'doc', content: [{ type: 'paragraph', content: [] }] });
  const [documentTags, setDocumentTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    favorites: true,
    explorer: true,
  });
  const [sidebarMenu, setSidebarMenu] = useState<{ x: number; y: number; items: ContextMenuItem[]; action: (action: string) => void } | null>(null);
  const [renameTarget, setRenameTarget] = useState<DocumentSummary | null>(null);
  const [moveTarget, setMoveTarget] = useState<DocumentSummary | null>(null);
  const [moveModeSource, setMoveModeSource] = useState<DocumentSummary | null>(null);
  const [editorInstance, setEditorInstance] = useState<TiptapEditor | null>(null);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
  const [replaceFindValue, setReplaceFindValue] = useState('');
  const [replaceNextValue, setReplaceNextValue] = useState('');
  const syncInFlightRef = useRef(false);
  const selectedIdRef = useRef<string | null>(null);
  const selectionIntentRef = useRef<string | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const refresh = useCallback(
    async (preferredId?: string | null) => {
      const [nextState, nextDocs, nextTags] = await Promise.all([getAppState(), listDocuments(), listTags()]);
      setAppState(nextState);
      setDocuments(nextDocs);
      setTags(nextTags);

      const desiredDocumentId = preferredId ?? selectionIntentRef.current ?? selectedIdRef.current;
      const preferredDocumentId = desiredDocumentId
        ? nextDocs.find((doc) => doc.id === desiredDocumentId && doc.node_kind === 'document')?.id ?? null
        : null;
      const fallbackId =
        preferredDocumentId ??
        nextDocs.find((doc) => doc.status === 'active' && doc.node_kind === 'document')?.id ??
        nextDocs.find((doc) => doc.node_kind === 'document')?.id ??
        null;

      if (fallbackId) {
        const detail = await getDocument(fallbackId);
        if (detail && detail.node_kind === 'document') {
          selectionIntentRef.current = detail.id;
          setSelectedId(fallbackId);
          setCurrentDocument(detail);
          setContent(parseContent(detail.content_json));
          setDocumentTags(detail.tags);
          setTagDraft('');
        }
      } else {
        selectionIntentRef.current = null;
        setSelectedId(null);
        setCurrentDocument(null);
        setContent({ type: 'doc', content: [{ type: 'paragraph', content: [] }] });
        setDocumentTags([]);
        setTagDraft('');
      }
    },
    []
  );

  const triggerAutoSync = useCallback(
    async (reason: string, force = false, preferredId?: string | null) => {
      try {
        const state = await getAppState();
        setAppState(state);

        const canSync =
          state.account_mode !== 'guest' &&
          Boolean(state.supabase.url) &&
          state.sync.auto_sync_enabled;
        if (!canSync || syncInFlightRef.current) {
          return;
        }

        const shouldPull =
          !state.sync.last_pulled_at ||
          Date.now() - new Date(state.sync.last_pulled_at).getTime() > 60_000;
        const shouldRun = force || state.sync.pending_jobs > 0 || shouldPull;
        if (!shouldRun) {
          return;
        }

        syncInFlightRef.current = true;
        setIsSyncing(true);
        const snapshot = await runSupabaseSync();
        await refresh(preferredId ?? selectedId);
        setAppState((current) => (current ? { ...current, sync: snapshot } : current));
        console.info(`[sync] ${reason} completed`);
      } catch (error) {
        console.error(`[sync] ${reason} failed`, error);
        try {
          await refresh(preferredId ?? selectedId);
        } catch (refreshError) {
          console.error('[sync] refresh after failure failed', refreshError);
        }
      } finally {
        syncInFlightRef.current = false;
        setIsSyncing(false);
      }
    },
    [refresh, selectedId]
  );

  useEffect(() => {
    const init = async () => {
      try {
        await ensureWorkspaceInitialized();
        await refresh();
      } catch (error) {
        console.error(error);
        toast.error('初始化失败');
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [refresh, toast]);

  useEffect(() => {
    if (loading) return;

    const interval = window.setInterval(() => {
      void triggerAutoSync('interval');
    }, 90_000);

    const onFocus = () => void triggerAutoSync('focus');
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void triggerAutoSync('visible');
      }
    };
    const onOnline = () => void triggerAutoSync('online', true);

    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    void triggerAutoSync('init');

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loading, triggerAutoSync]);

  const filteredDocuments = useMemo(
    () => buildTaggedTreeScope(documents, selectedTag, selectedStatus),
    [documents, selectedStatus, selectedTag]
  );

  const favoriteDocuments = useMemo(
    () => documents.filter((document) => document.node_kind === 'document' && document.is_favorite && document.status === 'active').slice(0, 6),
    [documents]
  );

  const recentDocuments = useMemo(
    () =>
      [...documents]
        .filter((document) => document.node_kind === 'document' && document.status === 'active')
        .filter((document) => (selectedTag ? document.tags.includes(selectedTag) : true))
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
        .slice(0, 12),
    [documents, selectedTag]
  );

  useEffect(() => {
    setExpandedFolders((current) => {
      if (current.size > 0) {
        return current;
      }
      return new Set(
        filteredDocuments.filter((document) => document.node_kind === 'folder').map((document) => document.id)
      );
    });
  }, [filteredDocuments]);

  const handleSelectDocument = useCallback(async (id: string) => {
    const detail = await getDocument(id);
    if (!detail || detail.node_kind !== 'document') return;
    selectionIntentRef.current = id;
    setSelectedId(id);
    setCurrentDocument(detail);
    setContent(parseContent(detail.content_json));
    setDocumentTags(detail.tags);
    setTagDraft('');
    setSidebarOpen(false);
  }, []);

  const handleCreateDocument = useCallback(
    async (parentId?: string | null) => {
      if (appState && appState.limits.current_document_count >= appState.limits.max_document_count) {
        toast.error(`已达到文档数量上限（${appState.limits.max_document_count}）`);
        return;
      }
      try {
        const created = await createDocument({ nodeKind: 'document', parentId: parentId ?? null });
        selectionIntentRef.current = created.id;
        setSelectedId(created.id);
        setCurrentDocument(created);
        setContent(parseContent(created.content_json));
        setDocumentTags(created.tags);
        setTagDraft('');
        if (created.parent_id) {
          const parentFolderId = created.parent_id;
          setExpandedFolders((current) => new Set(current).add(parentFolderId));
        }
        setSelectedStatus('active');
        toast.success('新文档已创建');
        await refresh(created.id);
        await triggerAutoSync('create', false, created.id);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      }
    },
    [appState, refresh, toast, triggerAutoSync]
  );

  const handleCreateFolder = useCallback(
    async (parentId?: string | null) => {
      try {
        const created = await createDocument({
          title: 'New Folder',
          nodeKind: 'folder',
          parentId: parentId ?? null,
        });
        toast.success('分组已创建');
        setExpandedFolders((current) => new Set(current).add(created.id));
        if (created.parent_id) {
          const parentFolderId = created.parent_id;
          setExpandedFolders((current) => new Set(current).add(parentFolderId));
        }
        await refresh(selectionIntentRef.current ?? selectedIdRef.current);
        await triggerAutoSync('folder-create', false, created.id);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      }
    },
    [refresh, toast, triggerAutoSync]
  );

  const handlePersistMetadata = useCallback(
    async (nextContent: JSONContent = content, nextTagList: string[] = documentTags) => {
      if (!currentDocument) return;
      const title =
        extractPlainText(nextContent.content?.find((node) => node.type === 'heading')) ||
        currentDocument.title ||
        'Untitled';

      const updated = await saveDocument({
        id: currentDocument.id,
        title,
        content_json: JSON.stringify(nextContent),
        plain_text: extractPlainText(nextContent),
        tags: nextTagList,
      });
      setCurrentDocument(updated);
      setDocumentTags(updated.tags);
      await refresh(updated.id);
      await triggerAutoSync('metadata', false, updated.id);
    },
    [content, currentDocument, documentTags, refresh, triggerAutoSync]
  );

  const handleMoveDocument = useCallback(
    async (id: string, status: StatusFilter) => {
      const nextStatus = status === 'trashed' ? 'trashed' : 'active';
      const updated = await setDocumentStatus(id, nextStatus);
      if (selectedId === id && updated.node_kind === 'document') {
        setCurrentDocument(updated);
      }
      toast.success(status === 'trashed' ? '已移入回收站' : '已恢复到文档库');
      await refresh(currentDocument?.id ?? null);
      await triggerAutoSync('status', false, updated.id);
    },
    [currentDocument?.id, refresh, selectedId, toast, triggerAutoSync]
  );

  const handleToggleFavorite = useCallback(
    async (document: DocumentSummary | DocumentRecord) => {
      const updated = await toggleFavorite(document.id, !document.is_favorite);
      if (selectedId === document.id && updated.node_kind === 'document') {
        setCurrentDocument(updated);
      }
      await refresh(currentDocument?.id ?? null);
      await triggerAutoSync('favorite', false, updated.id);
    },
    [currentDocument?.id, refresh, selectedId, triggerAutoSync]
  );

  const handleImportLegacy = useCallback(async () => {
    if (appState && appState.limits.current_write_ops_last_5_minutes >= appState.limits.max_write_ops_per_5_minutes) {
      toast.error(`最近 5 分钟写入次数已达到上限（${appState.limits.max_write_ops_per_5_minutes}）`);
      return;
    }
    setIsImporting(true);
    try {
      const result = await importLegacyWorkspace();
      toast.success(`导入完成：${result.imported_documents} 篇文档`);
      await refresh();
      await triggerAutoSync('legacy-import', true);
    } catch (error) {
      toast.error(`导入失败：${error}`);
    } finally {
      setIsImporting(false);
    }
  }, [appState, refresh, toast, triggerAutoSync]);

  const handleExport = useCallback(
    async (format: 'pdf' | 'docx' | 'md') => {
      if (!currentDocument) return;
      const filename = documentLeafTitle(currentDocument).trim() || 'vana-document';
      if (format === 'pdf') {
        await exportToPDF(content, theme, filename);
      } else if (format === 'docx') {
        await exportToDOCX(content, theme, filename);
      } else {
        const markdown = exportToMarkdown(content);
        await saveMarkdownExport(filename, markdown);
      }
      toast.success(`已导出 ${format.toUpperCase()}`);
    },
    [content, currentDocument, theme, toast]
  );

  const handleReplaceSubmit = useCallback(async () => {
    const findValue = replaceFindValue.trim();
    if (!currentDocument || !findValue) {
      setReplaceDialogOpen(false);
      return;
    }

    const replaced = replaceTextInContent(content, findValue, replaceNextValue);
    setContent(replaced);
    await handlePersistMetadata(replaced, documentTags);
    toast.success('替换已应用');
    setReplaceDialogOpen(false);
    setReplaceFindValue('');
    setReplaceNextValue('');
  }, [content, currentDocument, documentTags, handlePersistMetadata, replaceFindValue, replaceNextValue, toast]);

  const handleMenuAction = useCallback(
    (action: MenuAction) => {
      switch (action) {
        case 'newDocument':
          void handleCreateDocument();
          return;
        case 'newFolder':
          void handleCreateFolder();
          return;
        case 'importLegacy':
          void handleImportLegacy();
          return;
        case 'export:md':
          void handleExport('md');
          return;
        case 'export:docx':
          void handleExport('docx');
          return;
        case 'export:pdf':
          void handleExport('pdf');
          return;
        case 'copy':
        case 'paste':
        case 'cut':
          document.execCommand(action);
          return;
        case 'undo':
          if (editorInstance?.can().undo()) {
            editorInstance.chain().focus().undo().run();
          } else {
            document.execCommand('undo');
          }
          return;
        case 'redo':
          if (editorInstance?.can().redo()) {
            editorInstance.chain().focus().redo().run();
          } else {
            document.execCommand('redo');
          }
          return;
        case 'search':
          setShowSearchModal(true);
          return;
        case 'replace':
          setReplaceDialogOpen(true);
          return;
        case 'theme:arcane':
        case 'theme:terminal':
        case 'theme:rusty':
        case 'theme:vellum':
          setTheme(action.replace('theme:', '') as ThemeId);
          return;
      }
    },
    [editorInstance, handleCreateDocument, handleCreateFolder, handleExport, handleImportLegacy, setTheme]
  );

  const openDocumentMenu = useCallback(
    (event: React.MouseEvent, document: DocumentSummary) => {
      event.preventDefault();
      event.stopPropagation();

      const items: ContextMenuItem[] = [
        ...(document.node_kind === 'folder' ? [{ id: 'newChildDocument', label: '在此分组中新建文档', icon: FilePlus2 }] : []),
        ...(document.node_kind === 'folder' ? [{ id: 'newChildFolder', label: '新建子分组', icon: Folder }] : []),
        { id: 'rename', label: '重命名', icon: FileText },
        { id: 'move', label: '移动到分组', icon: FolderOpen },
        { id: 'toggleFavorite', label: document.is_favorite ? '取消收藏' : '加入收藏', icon: Heart },
        ...(document.status !== 'trashed' ? [{ id: 'trash', label: '移至回收站', icon: Trash2 }] : [{ id: 'restore', label: '从回收站恢复', icon: RefreshCw }]),
      ];

      setSidebarMenu({
        x: event.clientX,
        y: event.clientY,
        items,
        action: (action) => {
          if (action === 'newChildDocument') {
            void handleCreateDocument(document.id);
          } else if (action === 'newChildFolder') {
            void handleCreateFolder(document.id);
          } else if (action === 'rename') {
            setRenameTarget(document);
          } else if (action === 'move') {
            setMoveModeSource(document);
          } else if (action === 'toggleFavorite') {
            void handleToggleFavorite(document);
          } else if (action === 'trash') {
            void handleMoveDocument(document.id, 'trashed');
          } else if (action === 'restore') {
            void handleMoveDocument(document.id, 'active');
          }
        },
      });
    },
    [handleCreateDocument, handleCreateFolder, handleMoveDocument, handleToggleFavorite]
  );

  const openExplorerMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      setSidebarMenu({
        x: event.clientX,
        y: event.clientY,
        items: [
          { id: 'newDocument', label: '新建文档', icon: FilePlus2 },
          { id: 'newFolder', label: '新建分组', icon: Folder },
          { id: 'importLegacy', label: '导入旧库', icon: Import },
        ],
        action: (action) => {
          if (action === 'newDocument') {
            void handleCreateDocument();
          } else if (action === 'newFolder') {
            void handleCreateFolder();
          } else if (action === 'importLegacy') {
            void handleImportLegacy();
          }
        },
      });
    },
    [handleCreateDocument, handleCreateFolder, handleImportLegacy]
  );

  const currentSegments = documentDisplaySegments(currentDocument);
  const availableMoveTargets = useMemo(() => collectFolderTargets(documents, moveTarget), [documents, moveTarget]);
  const addTag = useCallback(
    async (rawValue: string) => {
      const next = rawValue.trim();
      if (!next || !currentDocument) return;
      if (documentTags.includes(next)) {
        setTagDraft('');
        return;
      }
      const nextTags = [...documentTags, next];
      setDocumentTags(nextTags);
      setTagDraft('');
      await handlePersistMetadata(content, nextTags);
    },
    [content, currentDocument, documentTags, handlePersistMetadata]
  );

  const handleDropNode = useCallback(
    async (sourceId: string, targetParentId: string | null) => {
      const dragged = documents.find((document) => document.id === sourceId) ?? null;
      if (!dragged || dragged.parent_id === (targetParentId ?? null)) {
        return;
      }

      try {
        const updated = await moveDocument(dragged.id, targetParentId);
        if (currentDocument?.id === updated.id && updated.node_kind === 'document') {
          setCurrentDocument(updated);
        }
        toast.success('节点已移动');
        await refresh(currentDocument?.id ?? updated.id);
        await triggerAutoSync('drag-move', false, updated.id);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      }
    },
    [currentDocument?.id, documents, refresh, toast, triggerAutoSync]
  );

  const handleMoveBySelection = useCallback(
    async (source: DocumentSummary, targetParentId: string | null) => {
      if (source.parent_id === (targetParentId ?? null)) {
        setMoveModeSource(null);
        return;
      }
      try {
        const updated = await moveDocument(source.id, targetParentId);
        if (currentDocument?.id === updated.id && updated.node_kind === 'document') {
          setCurrentDocument(updated);
        }
        toast.success('节点已移动');
        setMoveModeSource(null);
        await refresh(currentDocument?.id ?? updated.id);
        await triggerAutoSync('move-mode', false, updated.id);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      }
    },
    [currentDocument?.id, refresh, toast, triggerAutoSync]
  );

  const moveModeTargets = useMemo(() => collectFolderTargets(documents, moveModeSource), [documents, moveModeSource]);

  const removeTag = useCallback(
    async (tagName: string) => {
      if (!currentDocument) return;
      const nextTags = documentTags.filter((tag) => tag !== tagName);
      setDocumentTags(nextTags);
      await handlePersistMetadata(content, nextTags);
    },
    [content, currentDocument, documentTags, handlePersistMetadata]
  );

  if (loading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: background }}>
        <TitleBar />
      </div>
    );
  }

  return (
    <div
      className="shell-page flex h-screen min-h-0 flex-col overflow-hidden"
      style={{
        backgroundColor: background,
        color: accent,
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <TitleBar
        menuBar={
          <div data-tauri-drag-region className="flex h-8 w-full items-center gap-3">
            <div data-tauri-drag-region className="flex min-w-0 items-center gap-2">
              <button data-tauri-drag-region="false" className="border p-2 md:hidden" style={{ borderColor: border }} onClick={() => setSidebarOpen(true)}>
                <Menu size={16} />
              </button>
              <AppMenuBar onAction={handleMenuAction} onHelp={() => navigate('/help')} onSettings={() => navigate('/settings')} />
            </div>
          </div>
        }
      />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <aside
          className={`shell-panel absolute inset-y-0 left-0 z-40 w-[88vw] max-w-[320px] transform border-r transition-transform md:relative md:block md:h-full md:w-[308px] md:max-w-none md:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
          style={{
            backgroundColor: surface,
            borderColor: border,
          }}
        >
          <div className="flex h-full min-h-0 flex-col" onContextMenu={openExplorerMenu}>
            <div className="shrink-0 flex items-center justify-between border-b px-4 py-3" style={{ borderColor: border }}>
              <div className="min-w-0">
                <div className="shell-label">Explorer</div>
                <div className="shell-title truncate text-sm font-medium">Vana</div>
              </div>
              <button className="md:hidden" onClick={() => setSidebarOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="shrink-0 border-b px-3 py-3" style={{ borderColor: border }}>
              <button
                className="flex w-full items-center justify-center gap-2 border px-3 py-2 text-sm"
                style={{ backgroundColor: 'transparent', borderColor: border, color: accent }}
                onClick={() => void handleCreateDocument()}
              >
                <FilePlus2 size={15} />
                新建文档
              </button>
            </div>

            <div className="shrink-0 grid grid-cols-3 gap-px border-b px-3 py-3 text-xs" style={{ borderColor: border }}>
              {([
                ['active', '文档库', FileText],
                ['recent', '最近', Clock3],
                ['trashed', '回收站', Trash2],
              ] as const).map(([value, label, Icon]) => (
                <button
                  key={value}
                  onClick={() => setSelectedStatus(value)}
                  className="flex items-center gap-2 px-2 py-2 text-left"
                  style={{
                    backgroundColor: selectedStatus === value ? accentBg : 'transparent',
                    border: `1px solid ${border}`,
                  }}
                >
                  <Icon size={13} className="shrink-0 opacity-80" />
                  {label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <ExplorerSection
                title="Favorites"
                count={favoriteDocuments.length}
                expanded={expandedSections.favorites}
                onToggle={() => setExpandedSections((current) => ({ ...current, favorites: !current.favorites }))}
              >
                {favoriteDocuments.length === 0 ? (
                  <div className="px-3 py-1 text-[11px] opacity-40">还没有收藏文档</div>
                ) : (
                  <div className="space-y-0.5">
                    {favoriteDocuments.map((document) => (
                      <button
                        key={document.id}
                        type="button"
                        onClick={() => void handleSelectDocument(document.id)}
                        onContextMenu={(event) => openDocumentMenu(event, document)}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:opacity-85"
                        style={{
                          color: accent,
                          backgroundColor: document.id === selectedId ? `${accentBg}40` : 'transparent',
                        }}
                      >
                        <Heart size={12} className="shrink-0" fill="currentColor" />
                        <span className="truncate">{documentLeafTitle(document)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </ExplorerSection>

              <ExplorerSection
                title={selectedStatus === 'active' ? 'Workspace' : selectedStatus === 'recent' ? 'Recent' : 'Trash'}
                count={selectedStatus === 'recent' ? recentDocuments.length : filteredDocuments.length}
                expanded={expandedSections.explorer}
                onToggle={() => setExpandedSections((current) => ({ ...current, explorer: !current.explorer }))}
              >
                <div className="px-2 pb-2">
                {moveModeSource && (
                  <div
                    className="mb-2 rounded border px-3 py-2 text-[11px]"
                    style={{
                      borderColor: border,
                      backgroundColor: `${accentBg}35`,
                      color: accent,
                    }}
                  >
                    <div className="font-medium">移动模式</div>
                    <div className="mt-1 opacity-75">正在移动：{moveModeSource.title}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-[11px] transition-opacity hover:opacity-80"
                        style={{ borderColor: border, color: accent }}
                        onClick={() => void handleMoveBySelection(moveModeSource, null)}
                      >
                        移到根目录
                      </button>
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-[11px] transition-opacity hover:opacity-80"
                        style={{ borderColor: border, color: accent }}
                        onClick={() => setMoveModeSource(null)}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}

                <div className="mb-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedTag(null)}
                    className="border px-2 py-1 text-[10px]"
                    style={{
                      backgroundColor: selectedTag === null ? accentBg : 'transparent',
                      borderColor: border,
                    }}
                  >
                    全部
                  </button>
                  {tags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => setSelectedTag(tag.name)}
                      className="border px-2 py-1 text-[10px]"
                      style={{
                        backgroundColor: selectedTag === tag.name ? accentBg : 'transparent',
                        borderColor: border,
                      }}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>

                {selectedStatus === 'recent' ? (
                  recentDocuments.length === 0 ? (
                    <div className="px-3 py-2 text-[12px] opacity-40">最近还没有文档记录</div>
                  ) : (
                    <div className="space-y-0.5">
                      {recentDocuments.map((document) => (
                        <button
                          key={document.id}
                          type="button"
                          onClick={() => void handleSelectDocument(document.id)}
                          onContextMenu={(event) => openDocumentMenu(event, document)}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:opacity-85"
                          style={{
                            color: accent,
                            backgroundColor: document.id === selectedId ? `${accentBg}55` : 'transparent',
                            outline: document.id === selectedId ? `1px solid ${accentBg}` : 'none',
                            boxShadow: document.id === selectedId ? `inset 2px 0 0 ${accent}` : 'none',
                          }}
                        >
                          <Clock3 size={12} className="shrink-0 opacity-70" />
                          <span className="truncate">{documentLeafTitle(document)}</span>
                        </button>
                      ))}
                    </div>
                  )
                ) : filteredDocuments.length === 0 ? (
                  <div className="px-3 py-2 text-[12px] opacity-40">这一栏暂时是空的</div>
                ) : (
                  <DocumentExplorerTree
                    documents={filteredDocuments}
                    selectedId={selectedId}
                    expandedFolders={expandedFolders}
                    onToggleFolder={(folderId) =>
                      setExpandedFolders((current) => {
                        const next = new Set(current);
                        if (next.has(folderId)) {
                          next.delete(folderId);
                        } else {
                          next.add(folderId);
                        }
                        return next;
                      })
                    }
                    onSelectDocument={(id) => void handleSelectDocument(id)}
                    onNodeContextMenu={openDocumentMenu}
                    onMoveNode={handleDropNode}
                  />
                )}

                {moveModeSource && moveModeTargets.length > 1 && (
                  <div className="mt-3 border-t pt-3" style={{ borderColor: `${border}80` }}>
                    <div className="mb-2 text-[10px] uppercase tracking-[0.24em] opacity-55">选择目标分组</div>
                    <div className="space-y-1">
                      {moveModeTargets
                        .filter((candidate) => candidate.id !== null)
                        .map((candidate) => (
                          <button
                            key={candidate.id}
                            type="button"
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] transition-opacity hover:opacity-85"
                            style={{
                              color: accent,
                              paddingLeft: `${8 + candidate.depth * 14}px`,
                              backgroundColor: candidate.id === moveModeSource.parent_id ? `${accentBg}28` : 'transparent',
                            }}
                            onClick={() => void handleMoveBySelection(moveModeSource, candidate.id)}
                          >
                            <Folder size={13} className="shrink-0" />
                            <span className="truncate">{candidate.title}</span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
                </div>
              </ExplorerSection>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 min-h-0 overflow-hidden">
          {!currentDocument ? (
            <section className="h-full overflow-y-auto px-6 py-10" style={{ backgroundColor: background }}>
              <div className="flex min-h-full w-full items-center justify-center">
                <div className="w-full max-w-[760px]">
                  <div className="mx-auto max-w-[560px] text-center">
                    <div className="shell-label mb-3">Threshold</div>
                    <h1 className="shell-title text-3xl font-semibold sm:text-4xl">书页尚未翻开。</h1>
                    <p className="mx-auto mt-4 max-w-[440px] text-sm leading-7 opacity-70">
                      左侧资源区负责组织文档，右侧只在选中文档后进入编辑。这里保留为空状态入口，不再堆叠文档操作面板。
                    </p>
                  </div>

                  <div className="mx-auto mt-8 flex max-w-[520px] flex-wrap items-center justify-center gap-2">
                    <button className="border px-4 py-2 text-sm font-medium" style={{ backgroundColor: accentBg, borderColor: border }} onClick={() => void handleCreateDocument()}>
                      新建文档
                    </button>
                    <button className="border px-4 py-2 text-sm" style={{ borderColor: border }} onClick={() => void handleImportLegacy()}>
                      导入旧工作区
                    </button>
                    <AppLink href="/settings" className="border px-4 py-2 text-sm" style={{ borderColor: border }}>
                      进入设置
                    </AppLink>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <section className="flex h-full min-h-0 flex-col overflow-hidden">
              <div className="shell-panel border-b px-4 py-3 sm:px-5" style={{ backgroundColor: surface, borderColor: border }}>
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs opacity-70">
                  <span className="shell-label">Document</span>
                  <span className="opacity-35">/</span>
                  {currentSegments.length > 0 ? (
                    currentSegments.map((segment, index) => (
                      <React.Fragment key={`${segment}-${index}`}>
                        <span className={index === currentSegments.length - 1 ? 'opacity-100' : 'opacity-65'}>{segment}</span>
                        {index < currentSegments.length - 1 && <span className="opacity-35">/</span>}
                      </React.Fragment>
                    ))
                  ) : (
                    <span>Untitled</span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] opacity-72">
                  <span>最近更新 {formatTimestamp(currentDocument.updated_at)}</span>
                  <span>同步 {appState?.sync.mode ?? 'local-only'}</span>
                  <span>{isSyncing ? '同步中' : `待同步 ${appState?.sync.pending_jobs ?? 0}`}</span>
                  {appState && (
                    <span>
                      存储 {formatBytes(appState.limits.current_total_storage_bytes)} / {formatBytes(appState.limits.max_total_storage_bytes)}
                    </span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <div className="flex min-w-[280px] flex-1 items-center gap-2 border px-3 py-2" style={{ borderColor: border }}>
                    <Tag size={14} className="mt-0.5 shrink-0 opacity-60" />
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      {documentTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs"
                          style={{ borderColor: border, backgroundColor: `${accentBg}40`, color: accent }}
                        >
                          <span>{tag}</span>
                          <button
                            type="button"
                            className="opacity-70 transition-opacity hover:opacity-100"
                            onClick={() => void removeTag(tag)}
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                      <div className="flex min-w-[140px] flex-1 items-center gap-2">
                        <input
                          value={tagDraft}
                          onChange={(event) => setTagDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              void addTag(tagDraft);
                            }
                          }}
                          placeholder="输入标签后回车"
                          className="w-full min-w-0 bg-transparent text-sm outline-none"
                        />
                        <button
                          type="button"
                          className="opacity-70 transition-opacity hover:opacity-100"
                          onClick={() => void addTag(tagDraft)}
                          disabled={!tagDraft.trim()}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden p-0 md:p-3">
                <Editor
                  filePath={currentDocument.id}
                  initialContent={content}
                  tags={documentTags}
                  onEditorReady={setEditorInstance}
                  onContentChange={setContent}
                  onPersistError={(message) => toast.error(message)}
                  onPersisted={() => {
                    void triggerAutoSync('editor-save');
                  }}
                />
              </div>
            </section>
          )}
        </main>
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      <SearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        workspacePath=""
        onFileSelect={(documentId) => {
          void handleSelectDocument(documentId);
        }}
      />

      {sidebarMenu && (
        <ContextMenu
          x={sidebarMenu.x}
          y={sidebarMenu.y}
          items={sidebarMenu.items}
          onClose={() => setSidebarMenu(null)}
          onAction={(action) => sidebarMenu.action(action)}
        />
      )}

      <InputModal
        isOpen={Boolean(renameTarget)}
        title={renameTarget?.node_kind === 'folder' ? '重命名分组' : '重命名文档'}
        defaultValue={renameTarget?.title ?? ''}
        placeholder={renameTarget?.node_kind === 'folder' ? '输入分组名称' : '输入文档标题'}
        confirmText="保存"
        onCancel={() => setRenameTarget(null)}
        onConfirm={async (value) => {
          if (!renameTarget) return;
          const detail =
            currentDocument?.id === renameTarget.id
              ? currentDocument
              : await getDocument(renameTarget.id);
          if (!detail) {
            toast.error('目标节点不存在');
            setRenameTarget(null);
            return;
          }
          const updated = await saveDocument({
            id: detail.id,
            title: value,
            content_json: detail.content_json,
            plain_text: detail.plain_text,
            tags: detail.tags,
          });
          if (currentDocument?.id === updated.id && updated.node_kind === 'document') {
            setCurrentDocument(updated);
          }
          setRenameTarget(null);
          toast.success('名称已更新');
          await refresh(currentDocument?.id ?? null);
          await triggerAutoSync('rename', false, updated.id);
        }}
      />

      {replaceDialogOpen && (
        <div
          className="fixed inset-0 z-[10001] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          onClick={() => setReplaceDialogOpen(false)}
        >
          <div
            className="w-full max-w-md rounded border shadow-xl"
            style={{ backgroundColor: surface, borderColor: border }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b px-6 py-4" style={{ borderColor: border }}>
              <h2 className="text-lg font-semibold" style={{ color: accent }}>替换文本</h2>
              <p className="mt-1 text-sm opacity-70">对当前文档执行全文替换。</p>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div>
                <div className="mb-2 text-sm opacity-75">查找</div>
                <input
                  value={replaceFindValue}
                  onChange={(event) => setReplaceFindValue(event.target.value)}
                  className="w-full border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: border, backgroundColor: 'transparent', color: accent }}
                  placeholder="输入要查找的文本"
                />
              </div>
              <div>
                <div className="mb-2 text-sm opacity-75">替换为</div>
                <input
                  value={replaceNextValue}
                  onChange={(event) => setReplaceNextValue(event.target.value)}
                  className="w-full border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: border, backgroundColor: 'transparent', color: accent }}
                  placeholder="输入替换后的文本"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t px-6 py-4" style={{ borderColor: border }}>
              <button
                type="button"
                className="border px-4 py-2 text-sm"
                style={{ borderColor: border, color: accent }}
                onClick={() => setReplaceDialogOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="border px-4 py-2 text-sm"
                style={{ borderColor: border, backgroundColor: accentBg, color: accent }}
                onClick={() => void handleReplaceSubmit()}
                disabled={!replaceFindValue.trim()}
              >
                应用替换
              </button>
            </div>
          </div>
        </div>
      )}

      {moveTarget && (
        <div
          className="fixed inset-0 z-[10001] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          onClick={() => setMoveTarget(null)}
        >
          <div
            className="w-full max-w-lg rounded border shadow-xl"
            style={{ backgroundColor: surface, borderColor: border }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b px-6 py-4" style={{ borderColor: border }}>
              <h2 className="text-lg font-semibold" style={{ color: accent }}>
                移动到分组
              </h2>
              <p className="mt-1 text-sm opacity-70">
                {moveTarget.title}
              </p>
            </div>
            <div className="max-h-[50vh] overflow-y-auto px-4 py-3">
              <div className="space-y-1">
                {availableMoveTargets.map((candidate) => {
                  const active = candidate.id === (moveTarget.parent_id ?? null);
                  return (
                    <button
                      key={candidate.id ?? 'root'}
                      type="button"
                      onClick={async () => {
                        const updated = await moveDocument(moveTarget.id, candidate.id);
                        if (currentDocument?.id === updated.id && updated.node_kind === 'document') {
                          setCurrentDocument(updated);
                        }
                        setMoveTarget(null);
                        toast.success('节点已移动');
                        await refresh(currentDocument?.id ?? null);
                        await triggerAutoSync('move', false, updated.id);
                      }}
                      className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition-opacity hover:opacity-85"
                      style={{
                        color: accent,
                        backgroundColor: active ? `${accentBg}40` : 'transparent',
                        paddingLeft: `${12 + Math.max(0, candidate.depth) * 16}px`,
                      }}
                    >
                      {candidate.id ? <Folder size={14} className="shrink-0" /> : <FolderOpen size={14} className="shrink-0" />}
                      <span className="truncate">{candidate.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end border-t px-6 py-4" style={{ borderColor: border }}>
              <button
                type="button"
                onClick={() => setMoveTarget(null)}
                className="rounded border px-4 py-2 text-sm transition-opacity hover:opacity-80"
                style={{ borderColor: border, color: accent }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
