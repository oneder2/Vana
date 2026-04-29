'use client';

import React from 'react';
import { Menu, RefreshCw, Settings } from 'lucide-react';
import { AppMenuBar, type MenuAction } from '@/components/AppMenuBar';
import { AppLink } from '@/lib/router';

export function MobileHomeShell({
  title,
  sidebar,
  mainContent,
  sidebarOpen,
  isSyncing,
  accent,
  border,
  surface,
  onOpenSidebar,
  onCloseSidebar,
  onManualSync,
  onMenuAction,
  onHelp,
  onSettings,
}: {
  title: string;
  sidebar: React.ReactNode;
  mainContent: React.ReactNode;
  sidebarOpen: boolean;
  isSyncing: boolean;
  accent: string;
  border: string;
  surface: string;
  onOpenSidebar: () => void;
  onCloseSidebar: () => void;
  onManualSync: () => void;
  onMenuAction: (action: MenuAction) => void;
  onHelp: () => void;
  onSettings: () => void;
}) {
  return (
    <>
      <header
        className="shell-panel z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b px-3"
        style={{ backgroundColor: surface, borderColor: border }}
      >
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border"
          style={{ borderColor: border, color: accent }}
          onClick={onOpenSidebar}
          aria-label="打开文档库"
        >
          <Menu size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="shell-label text-[9px]">Vana</div>
          <div className="truncate text-sm font-medium">{title}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-lg border"
            style={{ borderColor: border, color: accent }}
            onClick={onManualSync}
            aria-label="同步"
          >
            <RefreshCw size={17} className={isSyncing ? 'animate-spin' : ''} />
          </button>
          <AppLink
            href="/settings"
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
        <AppMenuBar onAction={onMenuAction} onHelp={onHelp} onSettings={onSettings} />
      </div>

      <div className="relative min-h-0 w-screen max-w-[100dvw] flex-1 overflow-hidden">
        {sidebarOpen && sidebar}
        {mainContent}
      </div>
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/50" onClick={onCloseSidebar} aria-hidden="true" />}
    </>
  );
}
