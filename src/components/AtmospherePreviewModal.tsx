/**
 * No Visitors - 氛围协议预览模态框组件
 * 允许用户预览所有可用的主题样式
 */

'use client';

import React, { useState } from 'react';
import { X, Zap, Terminal, Flame, Book } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { getAllThemes, getThemeIcon, type ThemeId } from '@/lib/themes';
import { getThemeSurfaceColor, getThemeBorderColor, getThemeAccentColor, getThemeAccentBgColor, getThemeBgColor } from '@/lib/themeStyles';

interface AtmospherePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * 氛围协议预览模态框
 * 显示所有可用主题的预览，并注明仅供预览
 */
export function AtmospherePreviewModal({
  isOpen,
  onClose,
}: AtmospherePreviewModalProps) {
  const { theme } = useTheme();
  const themes = getAllThemes();
  const [previewThemeId, setPreviewThemeId] = useState<ThemeId | null>(null);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}
      onClick={onClose}
    >
      <div
        className="rounded-lg border shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: getThemeSurfaceColor(theme),
          borderColor: getThemeBorderColor(theme),
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="atmosphere-preview-title"
        aria-modal="true"
      >
        {/* 标题栏 */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b sticky top-0"
          style={{ 
            borderColor: getThemeBorderColor(theme),
            backgroundColor: getThemeSurfaceColor(theme),
            zIndex: 1,
          }}
        >
          <div>
            <h2
              id="atmosphere-preview-title"
              className="text-xl font-semibold mb-1"
              style={{ color: getThemeAccentColor(theme) }}
            >
              氛围协议预览
            </h2>
            <p className="text-xs opacity-60" style={{ color: getThemeAccentColor(theme) }}>
              此样式仅供预览，不会应用到实际文件
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded hover:opacity-80 transition-opacity"
            style={{ color: getThemeAccentColor(theme) }}
            aria-label="关闭"
          >
            <X size={20} />
          </button>
        </div>

        {/* 主题预览列表 */}
        <div className="p-6 space-y-6">
          {themes.map((t) => {
            const isPreviewing = previewThemeId === t.id;
            return (
              <div
                key={t.id}
                className="rounded-lg border p-6 transition-all"
                style={{
                  backgroundColor: isPreviewing ? getThemeAccentBgColor(theme) + '20' : 'transparent',
                  borderColor: isPreviewing ? getThemeAccentColor(theme) : getThemeBorderColor(theme),
                }}
                onMouseEnter={() => setPreviewThemeId(t.id)}
                onMouseLeave={() => setPreviewThemeId(null)}
              >
                {/* 主题头部 */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex-shrink-0">
                    {getThemeIcon(t)}
                  </div>
                  <div className="flex-1">
                    <h3
                      className="text-lg font-semibold mb-1"
                      style={{ color: getThemeAccentColor(theme) }}
                    >
                      {t.name}
                    </h3>
                    <p className="text-xs opacity-60" style={{ color: getThemeAccentColor(theme) }}>
                      主题 ID: {t.id}
                    </p>
                  </div>
                </div>

                {/* 主题预览区域 */}
                <div
                  className="rounded border p-4 space-y-3"
                  style={{
                    backgroundColor: getThemeBgColor(t),
                    borderColor: getThemeBorderColor(t),
                  }}
                >
                  {/* 预览文本块 */}
                  <div
                    className="rounded p-3 border"
                    style={{
                      backgroundColor: getThemeSurfaceColor(t),
                      borderColor: getThemeBorderColor(t),
                    }}
                  >
                    <p
                      className="text-sm mb-2"
                      style={{
                        color: getThemeAccentColor(t),
                        fontFamily: t.font === 'font-serif' ? 'serif' : t.font === 'font-mono' ? 'monospace' : 'sans-serif',
                      }}
                    >
                      这是一段预览文本，展示主题的字体样式和颜色。
                    </p>
                    <div
                      className="text-xs opacity-60"
                      style={{
                        color: getThemeAccentColor(t),
                        fontFamily: t.uiFont === 'font-serif' ? 'serif' : t.uiFont === 'font-mono' ? 'monospace' : 'sans-serif',
                      }}
                    >
                      UI 字体预览：界面元素使用的字体样式
                    </div>
                  </div>

                  {/* 颜色预览 */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div
                      className="px-3 py-1 rounded text-xs border"
                      style={{
                        backgroundColor: getThemeAccentBgColor(t),
                        borderColor: getThemeBorderColor(t),
                        color: getThemeAccentColor(t),
                      }}
                    >
                      强调色
                    </div>
                    <div
                      className="px-3 py-1 rounded text-xs border"
                      style={{
                        backgroundColor: getThemeSurfaceColor(t),
                        borderColor: getThemeBorderColor(t),
                        color: getThemeAccentColor(t),
                      }}
                    >
                      表面色
                    </div>
                    <div
                      className="px-3 py-1 rounded text-xs border"
                      style={{
                        backgroundColor: getThemeBgColor(t),
                        borderColor: getThemeBorderColor(t),
                        color: getThemeAccentColor(t),
                      }}
                    >
                      背景色
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 底部提示 */}
        <div
          className="px-6 py-4 border-t text-xs opacity-60 text-center"
          style={{
            borderColor: getThemeBorderColor(theme),
            color: getThemeAccentColor(theme),
          }}
        >
        </div>
      </div>
    </div>
  );
}

