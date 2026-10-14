/**
 * Vana - 主题提供者组件
 * 使用 React Context 管理当前主题状态
 * 支持主题切换和氛围协议自动应用
 */

'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Theme, ThemeId, getTheme, DEFAULT_THEME, THEMES } from '@/lib/themes';
import { applyTheme } from '@/lib/atmosphere';
import { getThemeAccentColor, getThemeBgColor, getThemeBorderColor, getThemeMutedColor, getThemeSurfaceColor, getThemeTextColor } from '@/lib/themeStyles';

// 主题上下文类型
interface ThemeContextType {
  theme: Theme;
  themeId: ThemeId;
  setTheme: (themeId: ThemeId) => void;
}

// 创建主题上下文
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// 主题提供者组件属性
interface ThemeProviderProps {
  children: ReactNode;
  initialTheme?: ThemeId;
}

/**
 * 主题提供者组件
 * 管理全局主题状态并应用到 DOM
 */
export function ThemeProvider({ children, initialTheme = DEFAULT_THEME }: ThemeProviderProps) {
  const [themeId, setThemeId] = useState<ThemeId>(() => {
    try {
      const saved = localStorage.getItem('vana-theme');
      if (saved && Object.hasOwn(THEMES, saved)) return saved as ThemeId;
    } catch { /* A blocked preference store must not prevent writing. */ }
    return initialTheme;
  });
  const theme = getTheme(themeId);

  // 当主题 ID 改变时，更新主题对象并应用到 DOM
  useEffect(() => {
    const newTheme = getTheme(themeId);
    applyTheme(newTheme);
    const tokens = { bg: getThemeBgColor(newTheme), surface: getThemeSurfaceColor(newTheme), border: getThemeBorderColor(newTheme), accent: getThemeAccentColor(newTheme), text: getThemeTextColor(newTheme), muted: getThemeMutedColor(newTheme) };
    for (const [name, value] of Object.entries(tokens)) document.documentElement.style.setProperty(`--ui-${name}`, value);
    try { localStorage.setItem('vana-theme', themeId); } catch { /* Session-only theme remains usable. */ }
  }, [themeId]);

  // 设置主题
  const setTheme = (newThemeId: ThemeId) => {
    setThemeId(newThemeId);
  };

  return (
    <ThemeContext.Provider value={{ theme, themeId, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * 使用主题的 Hook
 * 在组件中获取当前主题和切换函数
 */
export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
