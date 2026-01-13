/**
 * No Visitors - 面包屑导航组件
 * 显示当前文件的路径，支持点击导航到父目录
 */

'use client';

import React from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { getThemeSurfaceColor, getThemeBorderColor, getThemeAccentColor } from '@/lib/themeStyles';

interface BreadcrumbProps {
  filePath?: string;
  workspacePath?: string;
  onPathClick?: (path: string) => void;
}

/**
 * 面包屑导航组件
 */
export function Breadcrumb({ filePath, workspacePath, onPathClick }: BreadcrumbProps) {
  const { theme } = useTheme();

  // 如果没有文件路径，显示提示
  if (!filePath) {
    return (
      <div
        className="px-6 py-3 border-b flex items-center gap-2 text-sm opacity-50"
        style={{
          backgroundColor: getThemeSurfaceColor(theme),
          borderColor: getThemeBorderColor(theme),
          color: getThemeAccentColor(theme),
        }}
      >
        <FileText size={16} />
        <span>未打开文件</span>
      </div>
    );
  }

  // 解析路径为面包屑项
  const parsePath = (): Array<{ name: string; path: string }> => {
    if (!workspacePath) return [];

    // 移除 .enc 扩展名用于显示
    const displayPath = filePath.replace(/\.enc$/, '');
    
    // 获取相对于工作区的路径
    const relativePath = displayPath.startsWith(workspacePath)
      ? displayPath.substring(workspacePath.length)
      : displayPath;

    // 分割路径
    const parts = relativePath.split('/').filter(p => p.length > 0);
    
    // 构建面包屑项
    const breadcrumbs: Array<{ name: string; path: string }> = [
      { name: 'workspace', path: workspacePath },
    ];

    let currentPath = workspacePath;
    for (const part of parts) {
      currentPath = `${currentPath}/${part}`;
      breadcrumbs.push({ name: part, path: currentPath });
    }

    return breadcrumbs;
  };

  const breadcrumbs = parsePath();

  return (
    <div
      className="px-6 py-3 border-b flex items-center gap-2 text-sm overflow-x-auto"
      style={{
        backgroundColor: getThemeSurfaceColor(theme),
        borderColor: getThemeBorderColor(theme),
        color: getThemeAccentColor(theme),
      }}
    >
      <FileText size={16} className="flex-shrink-0" />
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return (
            <React.Fragment key={crumb.path}>
              {index > 0 && (
                <ChevronRight size={14} className="flex-shrink-0 opacity-40" />
              )}
              <button
                onClick={() => {
                  if (!isLast && onPathClick) {
                    onPathClick(crumb.path);
                  }
                }}
                className={`flex-shrink-0 transition-opacity ${
                  isLast
                    ? 'opacity-100 font-medium'
                    : onPathClick
                    ? 'opacity-60 hover:opacity-100 cursor-pointer'
                    : 'opacity-60'
                }`}
                style={{
                  color: getThemeAccentColor(theme),
                }}
                disabled={isLast || !onPathClick}
                title={isLast ? '当前文件' : `导航到: ${crumb.name}`}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

