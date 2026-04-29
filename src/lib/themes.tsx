/**
 * Vana - 主题系统
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
  text: string;
  muted: string;
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
    surface: 'bg-[#14111f]',
    border: 'border-[#342d46]',
    text: 'text-[#d9d3e5]',
    muted: 'text-[#9a90ad]',
    accent: 'text-[#b7a3e8]',
    accentBg: 'bg-[#2a2238]',
    glow: 'shadow-[0_0_15px_rgba(126,99,185,0.24)]',
    font: 'font-serif',
    uiFont: 'font-mono',
    iconName: 'Zap',
  },
  terminal: {
    id: 'terminal',
    name: '终端 (Terminal)',
    bg: 'bg-[#060807]',
    surface: 'bg-[#0d120f]',
    border: 'border-[#2b5a3a]',
    text: 'text-[#d4ded6]',
    muted: 'text-[#8ea293]',
    accent: 'text-[#83d49b]',
    accentBg: 'bg-[#16291d]',
    glow: 'shadow-[0_0_10px_rgba(104,190,129,0.16)]',
    font: 'font-mono',
    uiFont: 'font-mono',
    iconName: 'Terminal',
  },
  rusty: {
    id: 'rusty',
    name: '废土 (Rusty)',
    bg: 'bg-[#181311]',
    surface: 'bg-[#2a211d]',
    border: 'border-[#4b3a32]',
    text: 'text-[#e0d5cb]',
    muted: 'text-[#aa9588]',
    accent: 'text-[#d99a69]',
    accentBg: 'bg-[#3a2a22]',
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
    border: 'border-[#d0c7b7]',
    text: 'text-[#342f2a]',
    muted: 'text-[#766d62]',
    accent: 'text-[#5d5146]',
    accentBg: 'bg-[#ddd5c7]',
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
