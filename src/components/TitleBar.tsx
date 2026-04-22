/**
 * 自定义标题栏组件
 * 实现窗口控制：最小化、最大化/还原、关闭
 * 确保关闭按钮触发我们的退出逻辑
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Minus, Square, X, Maximize2 } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { getThemeSurfaceColor, getThemeBorderColor, getThemeAccentColor } from '@/lib/themeStyles';
import { isMobile } from '@/lib/platform';
import { getCurrentTauriWindow, type TauriWindowHandle } from '@/lib/tauriWindow';

export function TitleBar({ menuBar }: { menuBar?: React.ReactNode }) {
  const { theme } = useTheme();
  const [isMaximized, setIsMaximized] = useState(false);
  const [appWindow, setAppWindow] = useState<TauriWindowHandle | null>(null);
  const [shouldHide, setShouldHide] = useState(false);

  // 初始化窗口对象（仅在 Tauri 环境中）
  useEffect(() => {
    const initWindow = async () => {
      try {
        const mobile = await isMobile().catch(() => false);
        if (mobile) {
          setShouldHide(true);
          return;
        }

        // 检查是否在 Tauri 环境中
        const windowObj = await getCurrentTauriWindow();
        if (windowObj) {
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
    if (shouldHide || !appWindow) return;

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
  }, [appWindow, shouldHide]);

  if (shouldHide) {
    if (!menuBar) {
      return null;
    }
    return (
      <div
        className="select-none"
        style={{
          backgroundColor: getThemeSurfaceColor(theme),
          borderBottom: `1px solid ${getThemeBorderColor(theme)}`,
        }}
      >
        <div className="flex h-8 items-center px-2">{menuBar}</div>
      </div>
    );
  }

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
      className="select-none"
      style={{
        backgroundColor: getThemeSurfaceColor(theme),
        borderBottom: `1px solid ${getThemeBorderColor(theme)}`,
      }}
    >
      <div data-tauri-drag-region className="flex h-8 items-center justify-between px-2">
        <div data-tauri-drag-region className="flex min-w-0 flex-1 items-center gap-3 px-2">
          <div data-tauri-drag-region className="flex h-full min-w-[72px] items-center">
            <span className="shrink-0 text-xs font-medium" style={{ color: getThemeAccentColor(theme) }}>
              Vana
            </span>
          </div>
          {menuBar && (
            <div data-tauri-drag-region className="flex min-w-0 flex-1 items-center">
              {menuBar}
            </div>
          )}
          <div data-tauri-drag-region className="min-w-[96px] flex-1 h-full" />
        </div>

        <div className="flex items-center" data-tauri-drag-region="false">
          <button
            onClick={handleMinimize}
            className="w-8 h-8 flex items-center justify-center hover:opacity-80 transition-opacity"
            style={{ color: getThemeAccentColor(theme) }}
            title="最小化"
          >
            <Minus size={16} />
          </button>

          <button
            onClick={handleMaximize}
            className="w-8 h-8 flex items-center justify-center hover:opacity-80 transition-opacity"
            style={{ color: getThemeAccentColor(theme) }}
            title={isMaximized ? "还原" : "最大化"}
          >
            {isMaximized ? <Maximize2 size={14} /> : <Square size={14} />}
          </button>

          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
            style={{ color: getThemeAccentColor(theme) }}
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
