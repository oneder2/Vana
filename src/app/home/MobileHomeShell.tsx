'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Check, Info, Menu, RefreshCw, Settings, Share2, XCircle } from 'lucide-react';
import { AppMenuBar, type MenuAction } from '@/components/AppMenuBar';
import { AppLink } from '@/lib/router';

export function MobileHomeShell({
  title,
  version,
  sidebar,
  mainContent,
  sidebarOpen,
  hasDocument,
  isSyncing,
  syncFeedback,
  accent,
  border,
  surface,
  onOpenSidebar,
  onCloseSidebar,
  onOpenProperties,
  onOpenExportMenu,
  onManualSync,
  onMenuAction,
  onHelp,
  onSettings,
  onMenuOpenChange,
  menuCloseSignal,
}: {
  title: string;
  version: string;
  sidebar: React.ReactNode;
  mainContent: React.ReactNode;
  sidebarOpen: boolean;
  hasDocument: boolean;
  isSyncing: boolean;
  syncFeedback: 'idle' | 'success' | 'error';
  accent: string;
  border: string;
  surface: string;
  onOpenSidebar: () => void;
  onCloseSidebar: () => void;
  onOpenProperties: () => void;
  onOpenExportMenu: () => void;
  onManualSync: () => void;
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

  const sidebarLayer =
    sidebarOpen && typeof document !== 'undefined'
      ? createPortal(
          <>
            <div className="fixed inset-0 z-30 bg-black/50" onClick={onCloseSidebar} aria-hidden="true" />
            {sidebar}
          </>,
          document.body,
        )
      : null;

  return (
    <>
      <header
        className="shell-panel z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b px-3"
        style={{ backgroundColor: surface, borderColor: border }}
      >
        <button
          type="button"
          data-tauri-drag-region="false"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border"
          style={{ borderColor: border, color: accent }}
          onClick={onOpenSidebar}
          aria-label="打开文档库"
        >
          <Menu size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="shell-label text-[9px]">VANA · {version}</div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2">
            <div className="truncate text-sm font-medium">{title}</div>
            {hasDocument && (
              <button
                type="button"
                data-tauri-drag-region="false"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
                style={{ borderColor: border, color: accent }}
                onClick={onOpenProperties}
                aria-label="文档属性"
              >
                <Info size={14} />
              </button>
            )}
          </div>
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
          <button
            type="button"
            data-tauri-drag-region="false"
            className="flex h-10 w-10 items-center justify-center rounded-lg border"
            style={{ borderColor: border, color: accent }}
            onClick={onManualSync}
            aria-label="同步"
          >
            {syncFeedback === 'success' && !isSyncing ? (
              <Check size={17} />
            ) : syncFeedback === 'error' && !isSyncing ? (
              <XCircle size={17} />
            ) : (
              <RefreshCw size={17} className={isSyncing ? 'animate-spin' : ''} />
            )}
          </button>
          <AppLink
            href="/settings"
            data-tauri-drag-region="false"
            className="flex h-10 w-10 items-center justify-center rounded-lg border"
            style={{ borderColor: border, color: accent }}
            aria-label="设置"
          >
            <Settings size={17} />
          </AppLink>
        </div>
      </header>

      <div
        className="shell-panel z-20 flex h-10 shrink-0 items-center overflow-visible border-b px-2"
        style={{ backgroundColor: surface, borderColor: border }}
      >
        <AppMenuBar
          onAction={onMenuAction}
          onHelp={onHelp}
          onSettings={onSettings}
          onOpenChange={onMenuOpenChange}
          closeSignal={menuCloseSignal}
        />
      </div>

      <div className="relative min-h-0 w-screen max-w-[100dvw] flex-1 overflow-hidden">
        {mainContent}
      </div>
      {sidebarLayer}
    </>
  );
}
