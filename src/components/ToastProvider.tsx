/**
 * Vana - Toast 通知提供者组件
 * 使用 React Context 管理全局 Toast 消息队列
 * 支持多个消息同时显示，自动消失和手动关闭
 */

'use client';

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';

// Toast 项接口
export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

// Toast 上下文类型
interface ToastContextType {
  addToast: (toast: Omit<ToastItem, 'id'>) => void;
  removeToast: (id: string) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

// 创建 Toast 上下文
const ToastContext = createContext<ToastContextType | undefined>(undefined);
const ToastListContext = createContext<ToastItem[]>([]);

/**
 * Toast 提供者组件属性
 */
interface ToastProviderProps {
  children: ReactNode;
}

/**
 * Toast 提供者组件
 * 管理全局 Toast 消息队列
 */
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // 添加 Toast
  const addToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newToast: ToastItem = {
      id,
      ...toast,
      duration: toast.duration ?? 3000,
    };
    setToasts((prev) => [...prev, newToast]);

    // 自动移除（如果设置了duration）
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, newToast.duration);
    }
  }, [removeToast]);

  // 便捷方法
  const success = useCallback((message: string, duration?: number) => {
    addToast({ type: 'success', message, duration });
  }, [addToast]);

  const error = useCallback((message: string, duration?: number) => {
    addToast({ type: 'error', message, duration });
  }, [addToast]);

  const warning = useCallback((message: string, duration?: number) => {
    addToast({ type: 'warning', message, duration });
  }, [addToast]);

  const info = useCallback((message: string, duration?: number) => {
    addToast({ type: 'info', message, duration });
  }, [addToast]);

  const actions = useMemo(() => ({ addToast, removeToast, success, error, warning, info }),
    [addToast, removeToast, success, error, warning, info]);

  return (
    <ToastContext.Provider value={actions}>
      <ToastListContext.Provider value={toasts}>{children}</ToastListContext.Provider>
    </ToastContext.Provider>
  );
}

export function useToastList() { return useContext(ToastListContext); }

/**
 * 使用 Toast 的 Hook
 */
export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
