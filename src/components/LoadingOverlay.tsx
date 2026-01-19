/**
 * No Visitors - 加载覆盖层组件
 * 在 Git 操作进行时显示半透明加载覆盖层，防止 UI 阻塞
 */

'use client';

import React from 'react';
import { useTheme } from './ThemeProvider';
import { getThemeBgColor, getThemeAccentColor } from '@/lib/themeStyles';
import { Loader } from 'lucide-react';

interface LoadingOverlayProps {
  /** 是否显示加载覆盖层 */
  isVisible: boolean;
  /** 加载提示文本 */
  message?: string;
}

/**
 * 加载覆盖层组件
 * 在全屏显示半透明加载层，显示 Git 操作状态
 */
export function LoadingOverlay({ isVisible, message = '正在同步...' }: LoadingOverlayProps) {
  const { theme } = useTheme();

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.5)', // 半透明黑色背景
      }}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <div
        className="px-6 py-4 rounded-lg flex items-center gap-3 shadow-lg"
        style={{
          backgroundColor: getThemeBgColor(theme),
          border: `1px solid ${getThemeAccentColor(theme)}`,
        }}
      >
        <Loader
          size={20}
          className="animate-spin"
          style={{ color: getThemeAccentColor(theme) }}
        />
        <span
          className="text-sm font-medium"
          style={{ color: getThemeAccentColor(theme) }}
        >
          {message}
        </span>
      </div>
    </div>
  );
}

