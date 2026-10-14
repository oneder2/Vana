'use client';

import React from 'react';
import { TitleBar } from '@/components/TitleBar';
import { AppMenuBar, type MenuAction } from '@/components/AppMenuBar';

export function DesktopHomeShell({
  sidebar,
  mainContent,
  sidebarOpen,
  onCloseSidebar,
  onMenuAction,
  onHelp,
  onSettings,
  onAccount,
}: {
  sidebar: React.ReactNode;
  mainContent: React.ReactNode;
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
  onMenuAction: (action: MenuAction) => void;
  onHelp: () => void;
  onSettings: () => void;
  onAccount: () => void;
}) {
  return (
    <>
      <TitleBar
        menuBar={
          <div data-tauri-drag-region className="flex h-8 w-full items-center gap-3">
            <div data-tauri-drag-region className="flex min-w-0 items-center gap-2">
              <AppMenuBar onAction={onMenuAction} onHelp={onHelp} onSettings={onSettings} onAccount={onAccount} />
            </div>
          </div>
        }
      />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {sidebar}
        {mainContent}
      </div>
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={onCloseSidebar} aria-hidden="true" />
      )}
    </>
  );
}
