/**
 * No Visitors - 设置页面
 * 提供应用设置界面，包括PAT配置和二维码验证等功能
 */

'use client';

import React from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { getThemeBgColor, getThemeSurfaceColor, getThemeBorderColor, getThemeAccentColor } from '@/lib/themeStyles';
import { Settings } from 'lucide-react';
import Link from 'next/link';

/**
 * 设置页面组件
 */
export default function SettingsPage() {
  const { theme } = useTheme();

  return (
    <div
      className={`fixed inset-0 flex flex-col transition-colors duration-700 ${theme.font} ${
        theme.id === 'vellum' ? 'text-stone-800' : 'text-stone-300'
      }`}
      style={{
        backgroundColor: getThemeBgColor(theme),
      }}
    >
      {/* 顶部导航栏 */}
      <header
        className={`h-14 flex items-center justify-between px-4 z-50 border-b transition-transform duration-300`}
        style={{
          backgroundColor: getThemeSurfaceColor(theme),
          borderColor: getThemeBorderColor(theme),
        }}
      >
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            style={{ color: getThemeAccentColor(theme) }}
          >
            <Settings size={20} />
            <span className="text-sm">返回</span>
          </Link>
          <div
            className={`flex items-center gap-1 text-[10px] ${theme.uiFont} uppercase tracking-tighter opacity-60`}
          >
            <span>STYX-Ω</span>
            <span className="opacity-40">/</span>
            <span className={theme.accent}>设置</span>
          </div>
        </div>
      </header>

      {/* 主内容区域 */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 py-20">
          <h1
            className={`text-2xl mb-8 ${theme.uiFont}`}
            style={{ color: getThemeAccentColor(theme) }}
          >
            设置
          </h1>

          {/* PAT 配置区域 */}
          <section className="mb-12">
            <h2
              className={`text-lg mb-4 ${theme.uiFont}`}
              style={{ color: getThemeAccentColor(theme) }}
            >
              GitHub PAT 配置
            </h2>
            <div
              className="p-6 rounded border"
              style={{
                backgroundColor: getThemeSurfaceColor(theme),
                borderColor: getThemeBorderColor(theme),
              }}
            >
              <p className="text-sm opacity-60 mb-4">
                在此配置 GitHub Personal Access Token (PAT)，用于同步到 GitHub Private Repo。
              </p>
              <div className="space-y-4">
                <div>
                  <label
                    className="block text-sm mb-2"
                    style={{ color: getThemeAccentColor(theme) }}
                  >
                    PAT Token
                  </label>
                  <input
                    type="password"
                    placeholder="请输入 PAT Token"
                    className="w-full px-4 py-2 rounded border"
                    style={{
                      backgroundColor: getThemeBgColor(theme),
                      borderColor: getThemeBorderColor(theme),
                      color: theme.id === 'vellum' ? 'rgb(41, 37, 36)' : 'rgb(231, 229, 228)',
                    }}
                    disabled
                  />
                  <p className="text-xs opacity-40 mt-1">
                    TODO: 实现 PAT 输入和存储功能
                  </p>
                </div>
                <div>
                  <label
                    className="block text-sm mb-2"
                    style={{ color: getThemeAccentColor(theme) }}
                  >
                    二维码验证
                  </label>
                  <div
                    className="w-64 h-64 border-2 border-dashed flex items-center justify-center rounded"
                    style={{
                      borderColor: getThemeBorderColor(theme),
                      backgroundColor: getThemeBgColor(theme),
                    }}
                  >
                    <p className="text-sm opacity-40 text-center px-4">
                      TODO: 二维码显示区域
                      <br />
                      <span className="text-xs">用于手机端验证</span>
                    </p>
                  </div>
                  <p className="text-xs opacity-40 mt-2">
                    TODO: 实现二维码生成和验证功能
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 其他设置区域（预留） */}
          <section>
            <h2
              className={`text-lg mb-4 ${theme.uiFont}`}
              style={{ color: getThemeAccentColor(theme) }}
            >
              其他设置
            </h2>
            <div
              className="p-6 rounded border"
              style={{
                backgroundColor: getThemeSurfaceColor(theme),
                borderColor: getThemeBorderColor(theme),
              }}
            >
              <p className="text-sm opacity-60">
                更多设置选项将在此处添加...
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

