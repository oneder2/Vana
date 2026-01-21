/**
 * No Visitors - 主题选择模态框组件
 * 用于选择并设置目录的主题
 */

'use client';

import React from 'react';
import { X } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { getAllThemes, getThemeIcon, type ThemeId } from '@/lib/themes';
import { getThemeSurfaceColor, getThemeBorderColor, getThemeAccentColor, getThemeAccentBgColor, getThemeBgColor } from '@/lib/themeStyles';

interface ThemeSelectorModalProps {
  isOpen: boolean;
  currentThemeId?: ThemeId;
  onSelect: (themeId: ThemeId) => void | Promise<void>;
  onClose: () => void;
}

/**
 * 主题选择模态框
 */
export function ThemeSelectorModal({
  isOpen,
  currentThemeId,
  onSelect,
  onClose,
}: ThemeSelectorModalProps) {
  const { theme } = useTheme();
  const themes = getAllThemes();

  if (!isOpen) return null;

  const handleThemeSelect = async (themeId: ThemeId) => {
    await onSelect(themeId);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
    >
      <div
        className="rounded-lg border shadow-lg max-w-md w-full mx-4"
        style={{
          backgroundColor: getThemeSurfaceColor(theme),
          borderColor: getThemeBorderColor(theme),
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="theme-selector-title"
        aria-modal="true"
      >
        {/* 标题栏 */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: getThemeBorderColor(theme) }}
        >
          <h2
            id="theme-selector-title"
            className="text-lg font-semibold"
            style={{ color: getThemeAccentColor(theme) }}
          >
            选择主题
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:opacity-80 transition-opacity"
            style={{ color: getThemeAccentColor(theme) }}
            aria-label="关闭"
          >
            <X size={20} />
          </button>
        </div>

        {/* 主题列表 */}
        <div className="p-4 space-y-2">
          {themes.map((t) => {
            const isSelected = t.id === currentThemeId;
            return (
              <button
                key={t.id}
                onClick={() => handleThemeSelect(t.id)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded border transition-all text-left"
                style={{
                  backgroundColor: isSelected ? getThemeAccentBgColor(theme) : 'transparent',
                  borderColor: isSelected ? getThemeAccentColor(theme) : getThemeBorderColor(theme),
                  color: getThemeAccentColor(theme),
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = getThemeAccentBgColor(theme) + '40';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                {/* 主题图标 */}
                <div className="flex-shrink-0">{getThemeIcon(t)}</div>
                
                {/* 主题信息 */}
                <div className="flex-1">
                  <div className="font-medium">{t.name}</div>
                </div>

                {/* 主题颜色预览 */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <div
                    className="w-4 h-4 rounded-full border"
                    style={{
                      backgroundColor: getThemeBgColor(t),
                      borderColor: getThemeBorderColor(t),
                    }}
                    title={`背景色: ${t.bg}`}
                  />
                  <div
                    className="w-4 h-4 rounded-full border"
                    style={{
                      backgroundColor: getThemeAccentBgColor(t).replace(/\/\d+/, ''),
                      borderColor: getThemeBorderColor(t),
                    }}
                    title={`强调色: ${t.accent}`}
                  />
                </div>

                {/* 选中标记 */}
                {isSelected && (
                  <div
                    className="flex-shrink-0 text-xs"
                    style={{ color: getThemeAccentColor(theme) }}
                  >
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* 底部提示 */}
        <div
          className="px-4 py-2 border-t text-xs opacity-60"
          style={{
            borderColor: getThemeBorderColor(theme),
            color: getThemeAccentColor(theme),
          }}
        >
          主题将应用到当前目录及其子目录（除非子目录有自定义主题）
        </div>
      </div>
    </div>
  );
}


