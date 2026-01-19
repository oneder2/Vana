/**
 * No Visitors - 骨架屏组件
 * 在内容加载时显示占位符
 * 支持主题系统样式
 */

'use client';

import React from 'react';
import { useTheme } from './ThemeProvider';
import { getThemeBgColor, getThemeBorderColor, getThemeSurfaceColor } from '@/lib/themeStyles';

// 骨架屏属性接口
interface SkeletonProps {
  /** 骨架屏类型 */
  variant?: 'text' | 'rectangular' | 'circular';
  /** 宽度（CSS值，如 '100%', '200px'） */
  width?: string | number;
  /** 高度（CSS值，如 '100%', '20px'） */
  height?: string | number;
  /** 是否显示动画 */
  animated?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * 单个骨架屏组件
 */
export function Skeleton({
  variant = 'rectangular',
  width,
  height,
  animated = true,
  className = '',
}: SkeletonProps) {
  const { theme } = useTheme();

  const baseStyle: React.CSSProperties = {
    width: width || (variant === 'circular' ? '40px' : '100%'),
    height: height || (variant === 'circular' ? '40px' : '20px'),
    backgroundColor: getThemeSurfaceColor(theme),
    borderRadius: variant === 'circular' ? '50%' : variant === 'text' ? '4px' : '4px',
    opacity: 0.3,
  };

  return (
    <div
      className={`${animated ? 'animate-pulse' : ''} ${className}`}
      style={baseStyle}
      aria-hidden="true"
    />
  );
}

/**
 * 文件树骨架屏组件
 * 用于侧边栏文件列表加载时显示
 */
export function FileTreeSkeleton() {
  const { theme } = useTheme();

  // 使用固定的宽度值数组，避免 hydration mismatch
  const widths = ['65%', '80%', '72%', '90%'];

  return (
    <div className="space-y-1" aria-label="加载中...">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-center gap-2 p-2"
          style={{ paddingLeft: `${i % 2 === 0 ? 1.5 : 0.5}rem` }}
        >
          <Skeleton
            variant="rectangular"
            width="12px"
            height="12px"
          />
          <Skeleton
            variant="rectangular"
            width="16px"
            height="16px"
          />
          <Skeleton
            variant="text"
            width={widths[i - 1]}
            height="14px"
          />
        </div>
      ))}
    </div>
  );
}

/**
 * 编辑器内容骨架屏组件
 * 用于编辑器加载时显示
 */
export function EditorSkeleton() {
  const { theme } = useTheme();

  return (
    <div className="space-y-4 max-w-4xl mx-auto px-8 py-20" aria-label="加载编辑器...">
      <Skeleton variant="text" width="60%" height="32px" />
      <Skeleton variant="text" width="100%" height="20px" />
      <Skeleton variant="text" width="100%" height="20px" />
      <Skeleton variant="text" width="90%" height="20px" />
      <div className="mt-6 space-y-3">
        <Skeleton variant="text" width="80%" height="20px" />
        <Skeleton variant="text" width="100%" height="20px" />
        <Skeleton variant="text" width="95%" height="20px" />
      </div>
    </div>
  );
}

