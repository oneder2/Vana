/**
 * No Visitors - 输入模态对话框组件
 * 用于替换原生 prompt，支持文本输入
 * 包含验证和错误提示
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from './ThemeProvider';
import { getThemeSurfaceColor, getThemeBorderColor, getThemeAccentColor, getThemeBgColor, getThemeAccentBgColor } from '@/lib/themeStyles';

// 输入Modal属性接口
export interface InputModalProps {
  /** 是否打开 */
  isOpen: boolean;
  /** 标题 */
  title: string;
  /** 提示文本 */
  placeholder?: string;
  /** 默认值 */
  defaultValue?: string;
  /** 确认按钮文本 */
  confirmText?: string;
  /** 取消按钮文本 */
  cancelText?: string;
  /** 确认回调（返回输入值） */
  onConfirm: (value: string) => void | Promise<void>;
  /** 取消回调 */
  onCancel: () => void;
  /** 输入验证函数（可选） */
  validator?: (value: string) => { valid: boolean; error?: string };
  /** 是否显示加载状态 */
  isLoading?: boolean;
}

/**
 * 输入模态对话框组件
 */
export function InputModal({
  isOpen,
  title,
  placeholder = '',
  defaultValue = '',
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onCancel,
  validator,
  isLoading = false,
}: InputModalProps) {
  const { theme } = useTheme();
  const [inputValue, setInputValue] = useState(defaultValue);
  const [error, setError] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // 当Modal打开时，重置状态并聚焦输入框
  useEffect(() => {
    if (isOpen) {
      setInputValue(defaultValue);
      setError('');
      // 延迟聚焦，确保DOM已渲染
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [isOpen, defaultValue]);

  // 焦点陷阱
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
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTabKey);
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
        handleConfirm();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isLoading, inputValue, validator]);

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

  // 处理确认
  const handleConfirm = async () => {
    if (isLoading) return;

    const trimmedValue = inputValue.trim();

    // 如果为空
    if (trimmedValue.length === 0) {
      setError('输入不能为空');
      inputRef.current?.focus();
      return;
    }

    // 如果有验证器，进行验证
    if (validator) {
      const validation = validator(trimmedValue);
      if (!validation.valid) {
        setError(validation.error || '输入无效');
        inputRef.current?.focus();
        return;
      }
    }

    // 清除错误并调用确认回调
    setError('');
    await onConfirm(trimmedValue);
  };

  // 处理输入变化
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    // 清除错误
    if (error) {
      setError('');
    }
  };

  // 处理背景遮罩点击
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isLoading) {
      onCancel();
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center p-4"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
      }}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="input-modal-title"
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
          className="px-6 py-4 border-b"
          style={{
            borderColor: getThemeBorderColor(theme),
          }}
        >
          <h2
            id="input-modal-title"
            className="text-lg font-semibold"
            style={{
              color: getThemeAccentColor(theme),
            }}
          >
            {title}
          </h2>
        </div>

        {/* 内容 */}
        <div className="px-6 py-4 space-y-3">
          <div>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              placeholder={placeholder}
              disabled={isLoading}
              className="w-full px-3 py-2 rounded border text-sm transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: getThemeBgColor(theme),
                borderColor: error ? '#ef4444' : getThemeBorderColor(theme),
                color: theme.id === 'vellum' ? 'rgb(41, 37, 36)' : 'rgb(231, 229, 228)',
              }}
            />
            {error && (
              <p className="mt-2 text-xs text-red-500">{error}</p>
            )}
          </div>
        </div>

        {/* 按钮 */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4 border-t"
          style={{
            borderColor: getThemeBorderColor(theme),
          }}
        >
          <button
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
            className="px-4 py-2 rounded border text-sm transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: getThemeAccentBgColor(theme),
              borderColor: getThemeBorderColor(theme),
              color: getThemeAccentColor(theme),
            }}
          >
            {isLoading ? '处理中...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof window !== 'undefined'
    ? createPortal(modalContent, document.body)
    : null;
}

