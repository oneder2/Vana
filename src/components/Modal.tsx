/**
 * No Visitors - 模态对话框组件
 * 自定义确认对话框，替换原生 confirm
 * 支持键盘导航、焦点陷阱和主题系统
 */

'use client';

import React, { useEffect, useRef, ReactNode } from 'react';
import { X, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useTheme } from './ThemeProvider';
import { getThemeSurfaceColor, getThemeBorderColor, getThemeAccentColor, getThemeBgColor, getThemeAccentBgColor } from '@/lib/themeStyles';

// Modal 属性接口
export interface ModalProps {
  /** 是否打开 */
  isOpen: boolean;
  /** 标题 */
  title: string;
  /** 消息内容 */
  message: string;
  /** 确认按钮文本 */
  confirmText?: string;
  /** 取消按钮文本 */
  cancelText?: string;
  /** 确认回调 */
  onConfirm: () => void | Promise<void>;
  /** 取消回调 */
  onCancel: () => void;
  /** 对话框类型 */
  type?: 'danger' | 'warning' | 'info';
  /** 是否显示加载状态（异步操作时） */
  isLoading?: boolean;
  /** 背景遮罩点击是否关闭 */
  closeOnOverlayClick?: boolean;
}

/**
 * 模态对话框组件
 */
export function Modal({
  isOpen,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onCancel,
  type = 'info',
  isLoading = false,
  closeOnOverlayClick = false,
}: ModalProps) {
  const { theme } = useTheme();
  const modalRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // 焦点陷阱：限制焦点在对话框内
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    const modal = modalRef.current;
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) as NodeListOf<HTMLElement>;
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTabKey);

    // 初始焦点设置到确认按钮
    if (confirmButtonRef.current) {
      confirmButtonRef.current.focus();
    } else if (firstElement) {
      firstElement.focus();
    }

    return () => {
      document.removeEventListener('keydown', handleTabKey);
    };
  }, [isOpen]);

  // 键盘事件处理
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!isLoading) {
          onCancel();
        }
      } else if (e.key === 'Enter' && !isLoading) {
        // Enter 确认（只在确认按钮聚焦时）
        if (document.activeElement === confirmButtonRef.current) {
          onConfirm();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isLoading, onConfirm, onCancel]);

  // 阻止背景滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // 获取图标和标题颜色
  const getIcon = () => {
    switch (type) {
      case 'danger':
        return <AlertCircle size={24} className="text-red-500" />;
      case 'warning':
        return <AlertTriangle size={24} className="text-yellow-500" />;
      case 'info':
        return <Info size={24} className="text-blue-500" />;
    }
  };

  // 处理背景遮罩点击
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (closeOnOverlayClick && e.target === e.currentTarget && !isLoading) {
      onCancel();
    }
  };

  // 处理确认（支持异步）
  const handleConfirm = async () => {
    if (isLoading) return;
    await onConfirm();
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center p-4"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
      }}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby="modal-description"
    >
      <div
        ref={modalRef}
        className="w-full max-w-md rounded border shadow-xl"
        style={{
          backgroundColor: getThemeSurfaceColor(theme),
          borderColor: getThemeBorderColor(theme),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div
          className="flex items-center gap-3 px-6 py-4 border-b"
          style={{
            borderColor: getThemeBorderColor(theme),
          }}
        >
          <div className="flex-shrink-0">{getIcon()}</div>
          <h2
            id="modal-title"
            className="flex-1 text-lg font-semibold"
            style={{
              color: getThemeAccentColor(theme),
            }}
          >
            {title}
          </h2>
          {!isLoading && (
            <button
              onClick={onCancel}
              className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              style={{
                color: getThemeAccentColor(theme),
              }}
              aria-label="关闭对话框"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* 内容 */}
        <div className="px-6 py-4">
          <p
            id="modal-description"
            className="text-sm"
            style={{
              color: getThemeAccentColor(theme),
              opacity: 0.8,
            }}
          >
            {message}
          </p>
        </div>

        {/* 按钮 */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4 border-t"
          style={{
            borderColor: getThemeBorderColor(theme),
          }}
        >
          <button
            ref={cancelButtonRef}
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 rounded border text-sm transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: getThemeBgColor(theme),
              borderColor: getThemeBorderColor(theme),
              color: getThemeAccentColor(theme),
            }}
          >
            {cancelText}
          </button>
          <button
            ref={confirmButtonRef}
            onClick={handleConfirm}
            disabled={isLoading}
            className={`px-4 py-2 rounded border text-sm transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed ${
              type === 'danger' ? 'border-red-500' : ''
            }`}
            style={{
              backgroundColor:
                type === 'danger'
                  ? 'rgba(239, 68, 68, 0.1)'
                  : getThemeAccentBgColor(theme),
              borderColor:
                type === 'danger' ? '#ef4444' : getThemeBorderColor(theme),
              color:
                type === 'danger' ? '#ef4444' : getThemeAccentColor(theme),
            }}
          >
            {isLoading ? '处理中...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );

  // 使用 Portal 渲染到 body
  return typeof window !== 'undefined'
    ? createPortal(modalContent, document.body)
    : null;
}

