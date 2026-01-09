/**
 * No Visitors - 右键菜单组件
 * 提供复制、粘贴、剪切、全选等标准编辑操作
 */

'use client';

import React, { useEffect, useRef } from 'react';
import { Copy, Scissors, Clipboard, MousePointer2, Trash2, FileText, Folder } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { getThemeSurfaceColor, getThemeBorderColor, getThemeAccentColor } from '@/lib/themeStyles';

// 右键菜单属性
interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onAction?: (action: string) => void;
  hasSelection?: boolean;
  isBlock?: boolean;
}

/**
 * 右键菜单组件
 */
export function ContextMenu({
  x,
  y,
  onClose,
  onAction,
  hasSelection = false,
  isBlock = false,
}: ContextMenuProps) {
  const { theme } = useTheme();
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleAction = (action: string) => {
    onAction?.(action);
    onClose();
  };

  const menuItems = [
    ...(hasSelection
      ? [
          { id: 'copy', label: '复制', icon: Copy },
          { id: 'cut', label: '剪切', icon: Scissors },
        ]
      : []),
    { id: 'paste', label: '粘贴', icon: Clipboard },
    { id: 'selectAll', label: '全选', icon: MousePointer2 },
    ...(isBlock ? [{ id: 'delete', label: '删除块', icon: Trash2 }] : []),
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[150px] rounded border shadow-lg"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        backgroundColor: getThemeSurfaceColor(theme),
        borderColor: getThemeBorderColor(theme),
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {menuItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => handleAction(item.id)}
            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:opacity-80 transition-opacity text-sm"
            style={{
              color: getThemeAccentColor(theme),
            }}
          >
            <Icon size={16} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

