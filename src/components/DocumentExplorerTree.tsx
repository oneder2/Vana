'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, FileText, Folder, FolderOpen, Heart } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import type { DocumentSummary } from '@/lib/api';
import {
  getThemeAccentBgColor,
  getThemeAccentColor,
  getThemeBorderColor,
  getThemeSurfaceColor,
} from '@/lib/themeStyles';

type TreeNode = {
  id: string;
  name: string;
  type: 'folder' | 'file';
  children?: TreeNode[];
  document: DocumentSummary;
};

type DragTarget = string | null | undefined;

type DragState = {
  source: DocumentSummary;
  phase: 'pending' | 'dragging';
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  targetParentId: DragTarget;
};

function buildDocumentTree(documents: DocumentSummary[]): TreeNode[] {
  const byParent = new Map<string | null, DocumentSummary[]>();
  for (const document of documents) {
    const parentId = document.parent_id ?? null;
    const bucket = byParent.get(parentId) ?? [];
    bucket.push(document);
    byParent.set(parentId, bucket);
  }

  const sortNodes = (nodes: TreeNode[]): TreeNode[] =>
    [...nodes]
      .sort((left, right) => {
        if (left.type !== right.type) {
          return left.type === 'folder' ? -1 : 1;
        }
        return left.name.localeCompare(right.name, 'zh-Hans-CN');
      })
      .map((node) => ({
        ...node,
        children: node.children ? sortNodes(node.children) : undefined,
      }));

  const buildLevel = (parentId: string | null): TreeNode[] => {
    const siblings = byParent.get(parentId) ?? [];
    return sortNodes(
      siblings.map((document) => ({
        id: document.id,
        name: document.title || (document.node_kind === 'folder' ? 'Untitled Folder' : 'Untitled'),
        type: document.node_kind === 'folder' ? 'folder' : 'file',
        document,
        children: document.node_kind === 'folder' ? buildLevel(document.id) : undefined,
      }))
    );
  };

  return buildLevel(null);
}

function isDescendantOf(
  sourceId: string,
  targetParentId: string | null,
  byId: Map<string, DocumentSummary>
): boolean {
  let cursor = targetParentId;
  let guard = 0;

  while (cursor && guard < 32) {
    if (cursor === sourceId) {
      return true;
    }
    cursor = byId.get(cursor)?.parent_id ?? null;
    guard += 1;
  }

  return false;
}

function resolveDropTarget(
  clientX: number,
  clientY: number,
  source: DocumentSummary,
  documentsById: Map<string, DocumentSummary>
): DragTarget {
  const elements = document.elementsFromPoint(clientX, clientY) as HTMLElement[];

  for (const element of elements) {
    const folderCandidate = element.closest('[data-drop-folder-id]') as HTMLElement | null;
    if (folderCandidate) {
      const folderId = folderCandidate.dataset.dropFolderId;
      if (!folderId || folderId === source.id) {
        continue;
      }
      if (isDescendantOf(source.id, folderId, documentsById)) {
        continue;
      }
      if (source.parent_id === folderId) {
        return undefined;
      }
      return folderId;
    }

    const rootCandidate = element.closest('[data-drop-root="true"]') as HTMLElement | null;
    if (rootCandidate) {
      if (source.parent_id === null) {
        return undefined;
      }
      return null;
    }
  }

  return undefined;
}

type TreeItemProps = {
  node: TreeNode;
  level: number;
  selectedId: string | null;
  expandedFolders: Set<string>;
  draggingSourceId: string | null;
  dragTargetId: DragTarget;
  onToggleFolder: (folderId: string) => void;
  onSelectDocument: (id: string) => void;
  onNodeContextMenu: (event: React.MouseEvent, document: DocumentSummary) => void;
  onPointerStart: (event: React.MouseEvent, document: DocumentSummary, isFolder: boolean) => void;
};

function TreeItem({
  node,
  level,
  selectedId,
  expandedFolders,
  draggingSourceId,
  dragTargetId,
  onToggleFolder,
  onSelectDocument,
  onNodeContextMenu,
  onPointerStart,
}: TreeItemProps) {
  const { theme } = useTheme();
  const accent = getThemeAccentColor(theme);
  const accentBg = getThemeAccentBgColor(theme);

  const isFolder = node.type === 'folder';
  const isExpanded = isFolder && expandedFolders.has(node.id);
  const isSelected = !isFolder && node.document.id === selectedId;
  const isDragging = draggingSourceId === node.id;
  const isDropTarget = isFolder && dragTargetId === node.id;

  const handleActivate = () => {
    if (isFolder) {
      onToggleFolder(node.id);
      return;
    }
    onSelectDocument(node.document.id);
  };

  return (
    <div className="relative">
      <div
        data-drop-folder-id={isFolder ? node.id : undefined}
        onMouseDown={(event) => onPointerStart(event, node.document, isFolder)}
        onContextMenu={(event) => onNodeContextMenu(event, node.document)}
        className="flex w-full select-none items-center gap-1.5 rounded px-2 py-1.5 text-left text-[13px] transition-opacity hover:opacity-85"
        style={{
          paddingLeft: `${8 + level * 14}px`,
          color: accent,
          backgroundColor: isDropTarget ? `${accentBg}4d` : isSelected ? `${accentBg}55` : 'transparent',
          outline: isDropTarget ? `1px solid ${accent}` : isSelected ? `1px solid ${accentBg}` : 'none',
          boxShadow: isSelected ? `inset 2px 0 0 ${accent}` : 'none',
          opacity: isDragging ? 0.45 : 1,
          cursor: isDragging ? 'grabbing' : 'pointer',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
        role="treeitem"
        aria-expanded={isFolder ? isExpanded : undefined}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') {
            return;
          }
          event.preventDefault();
          handleActivate();
        }}
      >
        {isFolder ? (
          <>
            <ChevronRight size={14} className={`shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            {isExpanded ? <FolderOpen size={14} className="shrink-0" /> : <Folder size={14} className="shrink-0" />}
          </>
        ) : (
          <>
            <div className="w-[14px] shrink-0" />
            <FileText size={13} className="shrink-0 opacity-80" />
          </>
        )}
        <span className="truncate">{node.name}</span>
        {node.document.is_favorite && <Heart size={12} className="ml-auto shrink-0 opacity-80" fill="currentColor" />}
      </div>

      {isFolder && isExpanded && node.children && (
        <div className="space-y-0.5">
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              expandedFolders={expandedFolders}
              draggingSourceId={draggingSourceId}
              dragTargetId={dragTargetId}
              onToggleFolder={onToggleFolder}
              onSelectDocument={onSelectDocument}
              onNodeContextMenu={onNodeContextMenu}
              onPointerStart={onPointerStart}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function DocumentExplorerTree({
  documents,
  selectedId,
  expandedFolders,
  onToggleFolder,
  onSelectDocument,
  onNodeContextMenu,
  onMoveNode,
}: {
  documents: DocumentSummary[];
  selectedId: string | null;
  expandedFolders: Set<string>;
  onToggleFolder: (folderId: string) => void;
  onSelectDocument: (id: string) => void;
  onNodeContextMenu: (event: React.MouseEvent, document: DocumentSummary) => void;
  onMoveNode: (sourceId: string, targetParentId: string | null) => Promise<void>;
}) {
  const { theme } = useTheme();
  const accent = getThemeAccentColor(theme);
  const accentBg = getThemeAccentBgColor(theme);
  const border = getThemeBorderColor(theme);
  const surface = getThemeSurfaceColor(theme);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const tree = useMemo(() => buildDocumentTree(documents), [documents]);
  const documentsById = useMemo(() => new Map(documents.map((document) => [document.id, document])), [documents]);

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      setDragState((current) => {
        if (!current) {
          return current;
        }

        const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
        const phase = current.phase === 'pending' && distance > 6 ? 'dragging' : current.phase;
        const targetParentId =
          phase === 'dragging'
            ? resolveDropTarget(event.clientX, event.clientY, current.source, documentsById)
            : undefined;

        return {
          ...current,
          phase,
          currentX: event.clientX,
          currentY: event.clientY,
          targetParentId,
        };
      });
    };

    const handleMouseUp = () => {
      const current = dragState;
      setDragState(null);

      if (current.phase === 'pending') {
        if (current.source.node_kind === 'folder') {
          onToggleFolder(current.source.id);
        } else {
          onSelectDocument(current.source.id);
        }
        return;
      }

      if (current.targetParentId === undefined) {
        return;
      }

      void onMoveNode(current.source.id, current.targetParentId);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp, { once: true });

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [documentsById, dragState, onMoveNode, onSelectDocument, onToggleFolder]);

  const rootDropActive = dragState?.phase === 'dragging' && dragState.targetParentId === null;
  const draggingSourceId = dragState?.phase === 'dragging' ? dragState.source.id : null;
  const dragTargetId = dragState?.phase === 'dragging' ? dragState.targetParentId : undefined;

  return (
    <div className="relative">
      <div
        data-drop-root="true"
        className="mb-2 rounded border border-dashed px-3 py-2 text-[11px] transition-colors"
        style={{
          borderColor: rootDropActive ? accent : border,
          backgroundColor: rootDropActive ? `${accentBg}4d` : 'transparent',
          color: accent,
          opacity: dragState?.phase === 'dragging' ? 1 : 0.72,
        }}
      >
        拖到这里移回根目录
      </div>

      {dragState?.phase === 'dragging' && (
        <div
          className="pointer-events-none fixed z-[10020] rounded border px-2 py-1 text-[12px] shadow-lg"
          style={{
            left: `${dragState.currentX + 14}px`,
            top: `${dragState.currentY + 14}px`,
            backgroundColor: surface,
            borderColor: border,
            color: accent,
          }}
        >
          {dragState.source.title}
        </div>
      )}

      <div className="space-y-0.5">
        {tree.map((node) => (
          <TreeItem
            key={node.id}
            node={node}
            level={0}
            selectedId={selectedId}
            expandedFolders={expandedFolders}
            draggingSourceId={draggingSourceId}
            dragTargetId={dragTargetId}
            onToggleFolder={onToggleFolder}
            onSelectDocument={onSelectDocument}
            onNodeContextMenu={onNodeContextMenu}
            onPointerStart={(event, document) => {
              if (event.button !== 0) {
                return;
              }
              event.preventDefault();
              setDragState({
                source: document,
                phase: 'pending',
                startX: event.clientX,
                startY: event.clientY,
                currentX: event.clientX,
                currentY: event.clientY,
                targetParentId: undefined,
              });
            }}
          />
        ))}
      </div>
    </div>
  );
}
