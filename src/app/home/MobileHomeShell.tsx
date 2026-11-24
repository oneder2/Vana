'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Info, Menu, UserRound, Share2, ArrowLeft, ChevronRight } from 'lucide-react';
import { AppMenuBar, type MenuAction } from '@/components/AppMenuBar';
import type { DocumentPathItem } from '@/lib/documentNavigation';
import { usePresence } from '@/lib/usePresence';
import { AppLink } from '@/lib/router';

export function MobileHomeShell({
  title,
  path,
  onOpenFolder,
  sidebar,
  mainContent,
  sidebarOpen,
  hasDocument,
  accent,
  border,
  surface,
  onOpenSidebar,
  onCloseSidebar,
  onOpenProperties,
  onOpenExportMenu,
  onMenuAction,
  onHelp,
  onSettings,
  onMenuOpenChange,
  menuCloseSignal,
}: {
  title: string;
  path: DocumentPathItem[];
  onOpenFolder: (id: string | null) => void;
  sidebar: React.ReactNode;
  mainContent: React.ReactNode;
  sidebarOpen: boolean;
  hasDocument: boolean;
  accent: string;
  border: string;
  surface: string;
  onOpenSidebar: () => void;
  onCloseSidebar: () => void;
  onOpenProperties: () => void;
  onOpenExportMenu: () => void;
  onMenuAction: (action: MenuAction) => void;
  onHelp: () => void;
  onSettings: () => void;
  onMenuOpenChange?: (open: boolean) => void;
  menuCloseSignal?: number;
}) {
  const openExportMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenExportMenu();
  };

  const sidebarPresent = usePresence(sidebarOpen);
  const sidebarLayer =
    sidebarPresent && typeof document !== 'undefined'
      ? createPortal(
          <div className="mobile-library-layer" data-open={sidebarOpen} inert={!sidebarOpen}>
            <div className="mobile-library-scrim fixed inset-0 z-30 bg-black/50" onClick={onCloseSidebar} aria-hidden="true" />
            {sidebar}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <header
        className="shell-panel mobile-document-header z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-b px-3"
        style={{ backgroundColor: surface, borderColor: border }}
      >
        <button
          type="button"
          data-tauri-drag-region="false"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border"
          style={{ borderColor: border, color: accent }}
          onClick={hasDocument ? () => onOpenFolder(path.at(-1)?.parent_id ?? null) : onOpenSidebar}
          aria-label={hasDocument ? "返回所在分组" : "打开文档库"}
        >
          {hasDocument ? <ArrowLeft size={18} /> : <Menu size={18} />}
        </button>
        <div className="min-w-0 flex-1">
          {hasDocument && <div className="mobile-document-location">
            <button onClick={onOpenSidebar}>{path.length > 1 ? path.at(-2)?.title : '文档库'}</button><ChevronRight size={10} />
          </div>}
          <button type="button" disabled={!hasDocument} className="flex min-h-8 w-full min-w-0 items-center gap-2 text-left" onClick={onOpenProperties} aria-label={hasDocument ? '文档属性' : undefined}>
            <span className="truncate text-sm font-medium">{title}</span>
            {hasDocument && <Info size={14} className="shrink-0 opacity-50" />}
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasDocument && (
            <button
              type="button"
              data-tauri-drag-region="false"
              className="flex h-10 w-10 items-center justify-center rounded-lg border"
              style={{ borderColor: border, color: accent }}
              onClick={openExportMenu}
              aria-label="分享文档"
            >
              <Share2 size={17} />
            </button>
          )}
          <AppLink
            href="/account"
            data-tauri-drag-region="false"
            className="flex h-10 w-10 items-center justify-center rounded-lg border"
            style={{ borderColor: border, color: accent }}
            aria-label="账号"
          >
            <UserRound size={17} />
          </AppLink>
        </div>
      </header>

      <div
        className="shell-panel mobile-menu-row z-20 flex shrink-0 items-center overflow-visible border-b px-2"
        style={{ backgroundColor: surface, borderColor: border }}
      >
        <AppMenuBar mobile hasDocument={hasDocument}
          onAction={onMenuAction}
          onHelp={onHelp}
          onSettings={onSettings}
          onOpenChange={onMenuOpenChange}
          closeSignal={menuCloseSignal}
        />
      </div>

      <div className="mobile-document-stage relative min-h-0 w-screen max-w-[100dvw] flex-1 overflow-hidden">
        {mainContent}
      </div>
      {sidebarLayer}
    </>
  );
}
