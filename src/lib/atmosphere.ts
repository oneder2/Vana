/**
 * No Visitors - 氛围协议实现
 * 负责加载和应用目录的 .vnode.json 配置
 * 实现动态主题切换和氛围加载
 */

import { readAtmosphereConfig, type AtmosphereConfig } from './api';
import { getTheme, type Theme, type ThemeId } from './themes';

/**
 * 从目录路径加载氛围配置
 * @param path 目录路径
 * @returns 主题配置
 */
export async function loadAtmosphereConfig(path: string): Promise<Theme> {
  try {
    const config: AtmosphereConfig = await readAtmosphereConfig(path);
    const themeId = (config.theme || 'arcane') as ThemeId;
    return getTheme(themeId);
  } catch (error) {
    console.error('加载氛围配置失败:', error);
    // 返回默认主题
    return getTheme('arcane');
  }
}

/**
 * 应用主题到 DOM
 * 通过设置 CSS 变量来应用主题样式
 * @param theme 主题配置
 */
export function applyTheme(theme: Theme): void {
  // 将主题应用到 document root
  const root = document.documentElement;
  
  // 提取颜色值（从 Tailwind 类名中提取）
  // 这里可以扩展为更详细的 CSS 变量设置
  root.setAttribute('data-theme', theme.id);
  
  // 添加主题类到 body
  document.body.className = document.body.className
    .replace(/theme-\w+/g, '')
    .concat(` theme-${theme.id}`);
}

