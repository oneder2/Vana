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
 * 从文件路径向上查找最近的氛围配置（主题继承查找）
 * 以最底层的主题设置为准：从文件所在目录开始，逐级向上查找，直到找到.vnode.json或到达根目录
 * @param filePath 文件路径
 * @returns 主题配置
 */
export async function findThemeForFile(filePath: string): Promise<Theme> {
  // 从文件所在目录开始查找（浏览器兼容的路径解析）
  let currentDir = filePath.substring(0, filePath.lastIndexOf('/'));
  
  // 向上查找，直到找到.vnode.json或到达根目录
  while (currentDir && currentDir.length > 0) {
    try {
      const config: AtmosphereConfig = await readAtmosphereConfig(currentDir);
      // 如果找到了配置且包含主题，返回该主题
      if (config.theme) {
        return getTheme(config.theme as ThemeId);
      }
    } catch (error) {
      // 如果当前目录没有.vnode.json，继续向上查找
    }
    
    // 移动到父目录
    const lastSlashIndex = currentDir.lastIndexOf('/');
    if (lastSlashIndex === -1 || lastSlashIndex === 0) {
      // 已到达根目录，停止查找
      break;
    }
    currentDir = currentDir.substring(0, lastSlashIndex);
  }
  
  // 如果所有目录都没有.vnode.json，返回默认主题
  return getTheme('arcane');
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

