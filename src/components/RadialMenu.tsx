/**
 * No Visitors - 环形菜单组件
 * 右键或点击块时显示的快捷操作菜单
 * 支持 4 个方向的快捷操作：H1、引用、列表、属性
 */

'use client';

import React from 'react';
import { Type, Quote, Hash, FileText, Zap } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { getThemeSurfaceColor, getThemeBorderColor, getThemeAccentColor } from '@/lib/themeStyles';

// 环形菜单项位置
type RadialPosition = 'top' | 'right' | 'bottom' | 'left';

// 环形菜单属性
interface RadialMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onAction?: (action: string) => void;
}

/**
 * 环形菜单项组件
 */
function RadialItem({
  icon,
  label,
  pos,
  onClick,
  theme,
}: {
  icon: React.ReactNode;
  label: string;
  pos: RadialPosition;
  onClick: () => void;
  theme: ReturnType<typeof useTheme>['theme'];
}) {
  const positions = {
    top: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2',
    right: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2',
    bottom: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2',
    left: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2',
  };

  return (
    <div className={`absolute ${positions[pos]} flex flex-col items-center gap-1 group`}>
      <button
        onClick={onClick}
        className="w-10 h-10 rounded-full border flex items-center justify-center text-stone-500 group-hover:scale-110 transition-all"
        style={{
          backgroundColor: getThemeSurfaceColor(theme),
          borderColor: getThemeBorderColor(theme),
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = getThemeAccentColor(theme);
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#78716c'; // stone-500
        }}
      >
        {icon}
      </button>
      <span className={`text-[8px] ${theme.uiFont} opacity-0 group-hover:opacity-100 uppercase`}>
        {label}
      </span>
    </div>
  );
}

/**
 * 环形菜单主组件
 */
export function RadialMenu({ x, y, onClose, onAction }: RadialMenuProps) {
  const { theme } = useTheme();

  const handleAction = (action: string) => {
    onAction?.(action);
    onClose();
  };

  return (
    <div
      className="fixed z-[100] animate-in zoom-in duration-200"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        transform: 'translate(-50%, -50%)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 背景法阵装饰 */}
      <div
        className="absolute inset-0 rounded-full border-2 animate-spin-slow opacity-20"
        style={{
          borderColor: getThemeBorderColor(theme),
        }}
      ></div>

      <div className="relative w-48 h-48">
        {/* 四个方向的菜单项 */}
        <RadialItem
          icon={<Type size={18} />}
          label="H1"
          pos="top"
          onClick={() => handleAction('h1')}
          theme={theme}
        />
        <RadialItem
          icon={<Quote size={18} />}
          label="引用"
          pos="right"
          onClick={() => handleAction('quote')}
          theme={theme}
        />
        <RadialItem
          icon={<Hash size={18} />}
          label="列表"
          pos="bottom"
          onClick={() => handleAction('list')}
          theme={theme}
        />
        <RadialItem
          icon={<FileText size={18} />}
          label="属性"
          pos="left"
          onClick={() => handleAction('meta')}
          theme={theme}
        />

        {/* 中心按钮 */}
        <div
          className="absolute inset-0 m-auto w-12 h-12 rounded-full border flex items-center justify-center"
          style={{
            backgroundColor: getThemeSurfaceColor(theme),
            borderColor: getThemeBorderColor(theme),
            color: getThemeAccentColor(theme),
            boxShadow: theme.glow !== 'shadow-none' ? theme.glow.replace('shadow-', '') : undefined,
          }}
        >
          <Zap size={20} />
        </div>
      </div>

      {/* 样式定义 */}
      <style jsx>{`
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .animate-spin-slow {
          animation: spin-slow 10s linear infinite;
        }
      `}</style>
    </div>
  );
}

