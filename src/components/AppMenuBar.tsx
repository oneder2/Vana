'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ActionMenu } from './ActionMenu';
import {
  Dice5, CircleHelp, ClipboardPaste, Copy, FileCode2, FileDown, FilePlus2, FileText, FolderInput,
  FolderPlus, MessagesSquare, Palette, Plus, Redo2, Replace, Search, Scissors,
  ScrollText, Settings2, SquarePen, Terminal, Undo2, UserRound, WandSparkles, Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { getThemeAccentBgColor, getThemeAccentColor } from '@/lib/themeStyles';

type MenuKey = 'file' | 'edit' | 'insert' | 'style';

type MenuAction =
  | 'newDocument'
  | 'newFolder'
  | 'importLegacy'
  | 'export:md'
  | 'export:docx'
  | 'export:pdf'
  | 'letterpress'
  | 'dialogue'
  | 'storyRoll'
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
  icon: LucideIcon;
};

const MENU_ITEMS: Record<MenuKey, MenuItem[]> = {
  file: [
    { id: 'newDocument', label: '新建文件', icon: FilePlus2 },
    { id: 'newFolder', label: '新建文件夹', icon: FolderPlus },
    { id: 'importLegacy', label: '导入旧工作区', icon: FolderInput },
    { id: 'export:md', label: '导出 Markdown', icon: FileCode2 },
    { id: 'export:docx', label: '导出 DOCX', icon: FileText },
    { id: 'export:pdf', label: '导出 PDF', icon: FileDown },
  ],
  insert: [
    { id: 'letterpress', label: '文字冲印与信稿', icon: ScrollText },
    { id: 'dialogue', label: '角色对话卡', icon: MessagesSquare },
    { id: 'storyRoll', label: '剧情判定', icon: Dice5 },
  ],
  edit: [
    { id: 'copy', label: '复制', icon: Copy },
    { id: 'paste', label: '粘贴', icon: ClipboardPaste },
    { id: 'cut', label: '剪切', icon: Scissors },
    { id: 'undo', label: '撤销', icon: Undo2 },
    { id: 'redo', label: '重做', icon: Redo2 },
    { id: 'search', label: '搜索', icon: Search },
    { id: 'replace', label: '替换', icon: Replace },
  ],
  style: [
    { id: 'theme:arcane', label: '奥术', icon: WandSparkles },
    { id: 'theme:terminal', label: '代码', icon: Terminal },
    { id: 'theme:rusty', label: '废土', icon: Wrench },
    { id: 'theme:vellum', label: '极简', icon: FileText },
  ],
};

const MENU_ENTRIES = [
  { key: 'file', label: '文件', icon: FileText },
  { key: 'edit', label: '编辑', icon: SquarePen },
  { key: 'insert', label: '插入', icon: Plus },
  { key: 'style', label: '样式', icon: Palette },
] satisfies Array<{ key: MenuKey; label: string; icon: LucideIcon }>;

export function AppMenuBar({ onAction, onHelp, onSettings, onAccount, onOpenChange, closeSignal = 0, mobile = false, hasDocument = true }: {
  onAction: (action: MenuAction) => void; onHelp: () => void; onSettings: () => void; onAccount?: () => void;
  onOpenChange?: (open: boolean) => void; closeSignal?: number; mobile?: boolean; hasDocument?: boolean;
}) {
  const { theme, themeId } = useTheme();
  const accent = getThemeAccentColor(theme), accentBg = getThemeAccentBgColor(theme);
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);
  const menuId = useId();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null), [focusMenu, setFocusMenu] = useState(false);
  const lastMenu = useRef<MenuKey>('file'); if (openMenu) lastMenu.current = openMenu;
  useEffect(() => { onOpenChange?.(openMenu !== null); }, [onOpenChange, openMenu]);
  useEffect(() => { setOpenMenu(null); }, [closeSignal]);
  const triggerClass = 'app-menu-trigger rounded px-3 text-sm transition-colors';
  return <div className={`app-menu-bar flex items-center gap-0.5 ${mobile ? 'is-mobile' : ''}`} data-letterpress-menu>
    {MENU_ENTRIES.map(entry => <button key={entry.key} type="button" data-menu-key={entry.key} aria-expanded={openMenu === entry.key}
      aria-haspopup="menu" aria-controls={openMenu === entry.key ? menuId : undefined} data-tauri-drag-region="false" className={triggerClass}
      style={{ color: accent, backgroundColor: openMenu === entry.key ? accentBg : undefined }}
      onClick={event => { setAnchor(event.currentTarget); setFocusMenu(event.detail === 0); setOpenMenu(current => current === entry.key ? null : entry.key); }}
      onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setAnchor(event.currentTarget); setFocusMenu(true); setOpenMenu(entry.key); } }}>
      <entry.icon size={14} aria-hidden="true" />{entry.label}</button>)}
    <button type="button" className={triggerClass} style={{ color: accent }} onClick={() => { setOpenMenu(null); onHelp(); }}><CircleHelp size={14} aria-hidden="true" />帮助</button>
    {onAccount && <button type="button" className={triggerClass} style={{ color: accent }} onClick={() => { setOpenMenu(null); onAccount(); }}><UserRound size={14} aria-hidden="true" />账号</button>}
    <button type="button" className={triggerClass} style={{ color: accent }} onClick={() => { setOpenMenu(null); onSettings(); }}><Settings2 size={14} aria-hidden="true" />设置</button>
    <ActionMenu open={!!openMenu} anchor={anchor} onClose={() => setOpenMenu(null)} id={menuId} label="顶部操作" className="app-menu-popover"
      focusFirst={focusMenu} preserveSelection items={MENU_ITEMS[lastMenu.current].map(item => ({ ...item, checked: item.id === `theme:${themeId}`, disabled: !hasDocument && (lastMenu.current === 'insert' || lastMenu.current === 'edit' || item.id.startsWith('export:')) }))}
      onAction={id => onAction(id as MenuAction)} />
  </div>;
}
export type { MenuAction };
