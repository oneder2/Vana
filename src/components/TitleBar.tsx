/**
 * 自定义标题栏组件
 * 实现窗口控制：最小化、最大化/还原、关闭
 * 确保关闭按钮触发我们的退出逻辑
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Minus, Square, X, Maximize2 } from 'lucide-react';
import { getCurrentWindow, type Window } from '@tauri-apps/api/window';
import { useTheme } from '@/components/ThemeProvider';
import { getThemeSurfaceColor, getThemeBorderColor, getThemeAccentColor } from '@/lib/themeStyles';

export function TitleBar() {
  const { theme } = useTheme();
  const [isMaximized, setIsMaximized] = useState(false);
  const [appWindow, setAppWindow] = useState<Window | null>(null);

  // 初始化窗口对象（仅在 Tauri 环境中）
  useEffect(() => {
    const initWindow = async () => {
      try {
        // 检查是否在 Tauri 环境中
        if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
          const windowObj = getCurrentWindow();
          setAppWindow(windowObj);
          
          // 检查窗口是否最大化
          const maximized = await windowObj.isMaximized();
          setIsMaximized(maximized);
        } else {
          // 非 Tauri 环境，隐藏标题栏或显示占位符
          console.log('[TitleBar] 非 Tauri 环境，标题栏功能不可用');
        }
      } catch (error) {
        console.warn('[TitleBar] 无法初始化窗口对象:', error);
      }
    };

    initWindow();
  }, []);

  // 监听窗口状态变化
  useEffect(() => {
    if (!appWindow) return;

    const checkMaximized = async () => {
      try {
        const maximized = await appWindow.isMaximized();
        setIsMaximized(maximized);
      } catch (error) {
        console.warn('[TitleBar] 无法检查窗口状态:', error);
      }
    };

    // 监听窗口大小变化
    const unlistenPromise = appWindow.onResized(async () => {
      await checkMaximized();
    });

    return () => {
      unlistenPromise.then((cleanup) => cleanup()).catch(() => {});
    };
  }, [appWindow]);

  const handleMinimize = async () => {
    if (!appWindow) return;
    try {
      await appWindow.minimize();
    } catch (error) {
      console.error('[TitleBar] 最小化失败:', error);
    }
  };

  const handleMaximize = async () => {
    if (!appWindow) return;
    try {
      if (isMaximized) {
        await appWindow.unmaximize();
      } else {
        await appWindow.maximize();
      }
    } catch (error) {
      console.error('[TitleBar] 最大化/还原失败:', error);
    }
  };

  const handleClose = async () => {
    if (!appWindow) {
      // 非 Tauri 环境，使用浏览器方式关闭
      if (typeof window !== 'undefined') {
        window.close();
      }
      return;
    }
    try {
      // 触发 Tauri 的 CloseRequested 事件，这会执行我们的退出逻辑
      await appWindow.close();
    } catch (error) {
      console.error('[TitleBar] 关闭失败:', error);
    }
  };

  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between h-8 px-2 select-none"
      style={{
        backgroundColor: getThemeSurfaceColor(theme),
        borderBottom: `1px solid ${getThemeBorderColor(theme)}`,
      }}
    >
      {/* 左侧：应用标题 */}
      <div className="flex items-center gap-2 px-2">
        <span
          className="text-xs font-medium"
          style={{ color: getThemeAccentColor(theme) }}
        >
          No Visitors
        </span>
      </div>

      {/* 右侧：窗口控制按钮 */}
      <div className="flex items-center">
        {/* 最小化 */}
        <button
          onClick={handleMinimize}
          className="w-8 h-8 flex items-center justify-center hover:opacity-80 transition-opacity"
          style={{ color: getThemeAccentColor(theme) }}
          title="最小化"
        >
          <Minus size={16} />
        </button>

        {/* 最大化/还原 */}
        <button
          onClick={handleMaximize}
          className="w-8 h-8 flex items-center justify-center hover:opacity-80 transition-opacity"
          style={{ color: getThemeAccentColor(theme) }}
          title={isMaximized ? "还原" : "最大化"}
        >
          {isMaximized ? <Maximize2 size={14} /> : <Square size={14} />}
        </button>

        {/* 关闭 */}
        <button
          onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors rounded"
          style={{ color: getThemeAccentColor(theme) }}
          title="关闭"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

