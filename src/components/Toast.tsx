/**
 * No Visitors - Toast 通知组件
 * 显示非阻塞式消息提示
 * 支持成功、错误、警告、信息四种类型
 * 自动消失和手动关闭
 */

'use client';

import React, { useEffect, useState } from 'react';
import { X, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { getThemeSurfaceColor, getThemeBorderColor, getThemeAccentColor, getThemeBgColor } from '@/lib/themeStyles';
import { useToast, type ToastItem } from './ToastProvider';

/**
 * 单个 Toast 项组件
 */
function ToastItemComponent({ toast }: { toast: ToastItem }) {
  const { theme } = useTheme();
  const { removeToast } = useToast();
  const [isVisible, setIsVisible] = useState(false);

  // 淡入动画
  useEffect(() => {
    setTimeout(() => setIsVisible(true), 10);
  }, []);

  // 获取图标和颜色
  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle size={20} className="text-green-500" />;
      case 'error':
        return <XCircle size={20} className="text-red-500" />;
      case 'warning':
        return <AlertTriangle size={20} className="text-yellow-500" />;
      case 'info':
        return <Info size={20} className="text-blue-500" />;
    }
  };

  // 处理关闭
  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => {
      removeToast(toast.id);
    }, 200); // 等待淡出动画完成
  };

  return (
    <div
      className={`transition-all duration-200 ${
        isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'
      }`}
      style={{
        transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
      }}
    >
      <div
        className="min-w-[300px] max-w-md px-4 py-3 rounded border shadow-lg flex items-start gap-3 mb-2"
        style={{
          backgroundColor: getThemeSurfaceColor(theme),
          borderColor: getThemeBorderColor(theme),
        }}
      >
        {/* 图标 */}
        <div className="flex-shrink-0 mt-0.5">{getIcon()}</div>

        {/* 消息内容 */}
        <div className="flex-1 min-w-0">
          <p
            className="text-sm"
            style={{
              color: getThemeAccentColor(theme),
            }}
          >
            {toast.message}
          </p>
        </div>

        {/* 关闭按钮 */}
        <button
          onClick={handleClose}
          className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          style={{
            color: getThemeAccentColor(theme),
          }}
          aria-label="关闭通知"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

/**
 * Toast 容器组件
 * 显示所有 Toast 消息
 */
export function Toast() {
  const { toasts } = useToast();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed top-4 right-4 z-[10000] pointer-events-none"
      role="region"
      aria-live="polite"
      aria-atomic="true"
      aria-label="通知消息"
    >
      <div className="pointer-events-auto space-y-2">
        {toasts.map((toast) => (
          <ToastItemComponent key={toast.id} toast={toast} />
        ))}
      </div>
    </div>
  );
}

