/**
 * No Visitors - 主题系统
 * 基于 reference.ts 提取的主题配置
 * 支持 4 种主题：arcane（奥术）、terminal（终端）、rusty（废土）、vellum（极简）
 */

import { Zap, Terminal, Flame, Book, LucideIcon } from 'lucide-react';
import { ReactElement } from 'react';

// 主题 ID 类型
export type ThemeId = 'arcane' | 'terminal' | 'rusty' | 'vellum';

// 主题配置接口
export interface Theme {
  id: ThemeId;
  name: string;
  bg: string;
  surface: string;
  border: string;
  accent: string;
  accentBg: string;
  glow: string;
  font: string;
  uiFont: string;
  iconComponent: LucideIcon;
}

// 主题配置常量（不包含 JSX，使用组件类型）
const THEMES_CONFIG: Record<ThemeId, Omit<Theme, 'iconComponent'> & { iconName: string }> = {
  arcane: {
    id: 'arcane',
    name: '奥术 (Arcane)',
    bg: 'bg-[#05040a]',
    surface: 'bg-[#13111c]',
    border: 'border-[#2e2842]',
    accent: 'text-violet-500',
    accentBg: 'bg-violet-900/20',
    glow: 'shadow-[0_0_15px_rgba(139,92,246,0.3)]',
    font: 'font-serif',
    uiFont: 'font-mono',
    iconName: 'Zap',
  },
  terminal: {
    id: 'terminal',
    name: '终端 (Terminal)',
    bg: 'bg-black',
    surface: 'bg-[#0a0a0a]',
    border: 'border-[#00ff41]/30',
    accent: 'text-[#00ff41]',
    accentBg: 'bg-[#00ff41]/10',
    glow: 'shadow-[0_0_10px_rgba(0,255,65,0.2)]',
    font: 'font-mono',
    uiFont: 'font-mono',
    iconName: 'Terminal',
  },
  rusty: {
    id: 'rusty',
    name: '废土 (Rusty)',
    bg: 'bg-[#1a1412]',
    surface: 'bg-[#2a1d19]',
    border: 'border-[#4a342e]',
    accent: 'text-orange-700',
    accentBg: 'bg-orange-900/20',
    glow: 'shadow-none',
    font: 'font-serif',
    uiFont: 'font-sans',
    iconName: 'Flame',
  },
  vellum: {
    id: 'vellum',
    name: '极简 (Vellum)',
    bg: 'bg-[#f4f1ea]',
    surface: 'bg-[#e9e4d9]',
    border: 'border-[#d3cebe]',
    accent: 'text-stone-800',
    accentBg: 'bg-stone-300',
    glow: 'shadow-none',
    font: 'font-serif',
    uiFont: 'font-sans',
    iconName: 'Book',
  },
};

// 图标映射
const ICON_MAP: Record<string, LucideIcon> = {
  Zap,
  Terminal,
  Flame,
  Book,
};

// 创建主题对象（包含图标组件）
function createTheme(id: ThemeId): Theme {
  const config = THEMES_CONFIG[id];
  return {
    ...config,
    iconComponent: ICON_MAP[config.iconName] || Zap,
  };
}

// 主题配置常量
export const THEMES: Record<ThemeId, Theme> = {
  arcane: createTheme('arcane'),
  terminal: createTheme('terminal'),
  rusty: createTheme('rusty'),
  vellum: createTheme('vellum'),
};

// 默认主题
export const DEFAULT_THEME: ThemeId = 'arcane';

// 获取主题
export function getTheme(id: ThemeId): Theme {
  return THEMES[id] || THEMES[DEFAULT_THEME];
}

// 获取所有主题列表
export function getAllThemes(): Theme[] {
  return Object.values(THEMES);
}

// 获取主题图标（返回 ReactElement）
export function getThemeIcon(theme: Theme): ReactElement {
  const Icon = theme.iconComponent;
  return <Icon size={18} />;
}

