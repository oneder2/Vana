'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { getThemeAccentBgColor, getThemeAccentColor, getThemeBorderColor } from '@/lib/themeStyles';

type MenuKey = 'file' | 'edit' | 'style';

type MenuAction =
  | 'newDocument'
  | 'newFolder'
  | 'importLegacy'
  | 'export:md'
  | 'export:docx'
  | 'export:pdf'
  | 'copy'
  | 'paste'
  | 'cut'
  | 'undo'
  | 'redo'
  | 'search'
  | 'replace'
  | 'theme:arcane'
  | 'theme:terminal'
  | 'theme:rusty'
  | 'theme:vellum';

type MenuItem = {
  id: MenuAction;
  label: string;
};

const MENU_ITEMS: Record<MenuKey, MenuItem[]> = {
  file: [
    { id: 'newDocument', label: '新建文件' },
    { id: 'newFolder', label: '新建文件夹' },
    { id: 'importLegacy', label: '导入旧工作区' },
    { id: 'export:md', label: '导出 Markdown' },
    { id: 'export:docx', label: '导出 DOCX' },
    { id: 'export:pdf', label: '导出 PDF' },
  ],
  edit: [
    { id: 'copy', label: '复制' },
    { id: 'paste', label: '粘贴' },
    { id: 'cut', label: '剪切' },
    { id: 'undo', label: '撤销' },
    { id: 'redo', label: '重做' },
    { id: 'search', label: '搜索' },
    { id: 'replace', label: '替换' },
  ],
  style: [
    { id: 'theme:arcane', label: '奥术' },
    { id: 'theme:terminal', label: '代码' },
    { id: 'theme:rusty', label: '废土' },
    { id: 'theme:vellum', label: '极简' },
  ],
};

export function AppMenuBar({
  onAction,
  onHelp,
  onSettings,
}: {
  onAction: (action: MenuAction) => void;
  onHelp: () => void;
  onSettings: () => void;
}) {
  const { theme, themeId } = useTheme();
  const accent = getThemeAccentColor(theme);
  const accentBg = getThemeAccentBgColor(theme);
  const border = getThemeBorderColor(theme);
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const menuEntries = useMemo(
    () => [
      { key: 'file' as const, label: '文件' },
      { key: 'edit' as const, label: '编辑' },
      { key: 'style' as const, label: '样式' },
    ],
    []
  );

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, []);

  return (
    <div ref={rootRef} className="flex h-8 items-center gap-1">
      {menuEntries.map((entry) => (
        <div key={entry.key} className="relative flex h-full items-center">
          <button
            type="button"
            data-tauri-drag-region="false"
            className="h-7 rounded px-3 text-sm transition-colors"
            style={{
              color: accent,
              backgroundColor: openMenu === entry.key ? `${accentBg}55` : 'transparent',
            }}
            onClick={() => {
              setOpenMenu((current) => (current === entry.key ? null : entry.key));
            }}
          >
            {entry.label}
          </button>

          {openMenu === entry.key && (
            <div className="absolute left-0 top-full z-[120] pt-1" data-tauri-drag-region="false">
              <div
                className="min-w-[208px] rounded border py-1 shadow-xl"
                style={{
                  backgroundColor: theme.id === 'vellum' ? '#f6f0e6' : '#17131f',
                  borderColor: border,
                }}
              >
                {MENU_ITEMS[entry.key].map((item) => {
                  const active = item.id === `theme:${themeId}`;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors"
                      style={{
                        color: accent,
                        backgroundColor: active ? `${accentBg}45` : 'transparent',
                      }}
                      onClick={() => {
                        setOpenMenu(null);
                        onAction(item.id);
                      }}
                    >
                      <span>{item.label}</span>
                      {active && <span className="text-[11px] opacity-65">当前</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        data-tauri-drag-region="false"
        className="h-7 rounded px-3 text-sm transition-colors"
        style={{ color: accent }}
        onClick={() => {
          setOpenMenu(null);
          onHelp();
        }}
      >
        帮助
      </button>

      <button
        type="button"
        data-tauri-drag-region="false"
        className="h-7 rounded px-3 text-sm transition-colors"
        style={{ color: accent }}
        onClick={() => {
          setOpenMenu(null);
          onSettings();
        }}
      >
        设置
      </button>
    </div>
  );
}

export type { MenuAction };
