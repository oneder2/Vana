/**
 * No Visitors - 主题样式辅助函数
 * 将主题配置转换为内联样式对象，确保自定义颜色被正确应用
 */

import { Theme } from './themes';

/**
 * 从 Tailwind 类名中提取颜色值
 * 例如: 'bg-[#05040a]' -> '#05040a'
 */
function extractColorFromClass(className: string): string | null {
  const match = className.match(/\[#([0-9a-fA-F]{6})\]/);
  return match ? `#${match[1]}` : null;
}

/**
 * 从 Tailwind 类名中提取透明度
 * 例如: 'bg-violet-900/20' -> '20'
 */
function extractOpacityFromClass(className: string): number | null {
  const match = className.match(/\/(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * 获取主题的背景颜色（作为内联样式值）
 */
export function getThemeBgColor(theme: Theme): string {
  // 尝试从类名中提取颜色
  const color = extractColorFromClass(theme.bg);
  if (color) return color;

  // 回退到标准 Tailwind 颜色
  if (theme.bg === 'bg-black') return '#000000';
  if (theme.bg.includes('stone')) return '#f4f1ea'; // vellum 主题

  return '#05040a'; // 默认 arcane 颜色
}

/**
 * 获取主题的表面颜色（作为内联样式值）
 */
export function getThemeSurfaceColor(theme: Theme): string {
  const color = extractColorFromClass(theme.surface);
  if (color) return color;

  if (theme.surface === 'bg-black') return '#000000';
  if (theme.surface.includes('stone')) return '#e9e4d9';

  return '#13111c'; // 默认 arcane 颜色
}

/**
 * 获取主题的边框颜色（作为内联样式值）
 */
export function getThemeBorderColor(theme: Theme): string {
  // 先检查是否有透明度（在颜色值之后）
  const opacityMatch = theme.border.match(/\[#([0-9a-fA-F]{6})\]\/(\d+)/);
  if (opacityMatch) {
    const hexColor = opacityMatch[1];
    const opacity = parseInt(opacityMatch[2], 10);
    const r = parseInt(hexColor.slice(0, 2), 16);
    const g = parseInt(hexColor.slice(2, 4), 16);
    const b = parseInt(hexColor.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
  }

  // 检查是否有颜色值（无透明度）
  const color = extractColorFromClass(theme.border);
  if (color) return color;

  // 回退到标准 Tailwind 颜色
  if (theme.border.includes('stone')) return '#d3cebe';
  return '#2e2842'; // 默认 arcane 颜色
}

/**
 * 获取主题的强调色（作为内联样式值）
 */
export function getThemeAccentColor(theme: Theme): string {
  const color = extractColorFromClass(theme.accent);
  if (color) return color;

  // 标准 Tailwind 颜色映射
  if (theme.accent === 'text-violet-500') return '#a855f7';
  if (theme.accent === 'text-[#00ff41]') return '#00ff41';
  if (theme.accent === 'text-orange-700') return '#c2410c';
  if (theme.accent === 'text-stone-800') return '#292524';

  return '#a855f7'; // 默认 violet-500
}

/**
 * 获取主题的背景强调色（作为内联样式值）
 */
export function getThemeAccentBgColor(theme: Theme): string {
  const color = extractColorFromClass(theme.accentBg);
  if (color) {
    const opacity = extractOpacityFromClass(theme.accentBg);
    if (opacity !== null) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
    }
    return color;
  }

  if (theme.accentBg.includes('stone')) return '#d6d3d1';
  return 'rgba(139, 92, 246, 0.2)'; // 默认 violet-900/20
}

/**
 * 获取主题的完整样式对象
 */
export function getThemeStyles(theme: Theme) {
  return {
    backgroundColor: getThemeBgColor(theme),
    color: theme.id === 'vellum' ? '#292524' : '#d6d3d1',
  };
}

/**
 * 获取主题的表面样式对象
 */
export function getThemeSurfaceStyles(theme: Theme) {
  return {
    backgroundColor: getThemeSurfaceColor(theme),
    borderColor: getThemeBorderColor(theme),
  };
}

