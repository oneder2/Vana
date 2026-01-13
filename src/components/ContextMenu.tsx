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
  isFile?: boolean; // 是否为文件操作菜单
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
  isFile = false,
  hasClipboard = false,
}: ContextMenuProps) {
  const { theme } = useTheme();
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = React.useState({ x, y });

  // 更新菜单位置，确保显示在点击位置
  useEffect(() => {
    setMenuPosition({ x, y });
  }, [x, y]);

  // 调整菜单位置，确保不超出视口
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      let adjustedX = menuPosition.x;
      let adjustedY = menuPosition.y;
      
      // 如果菜单超出右边界，向左调整
      if (rect.right > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
      }
      
      // 如果菜单超出下边界，向上调整
      if (rect.bottom > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 10;
      }
      
      // 确保不超出左边界和上边界
      if (adjustedX < 10) {
        adjustedX = 10;
      }
      if (adjustedY < 10) {
        adjustedY = 10;
      }
      
      if (adjustedX !== menuPosition.x || adjustedY !== menuPosition.y) {
        setMenuPosition({ x: adjustedX, y: adjustedY });
      }
    }
  }, [menuPosition.x, menuPosition.y]);

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

  // 文件操作菜单项
  const fileMenuItems = [
    { id: 'createFile', label: '新建文件', icon: FileText },
    { id: 'createDirectory', label: '新建文件夹', icon: Folder },
    { id: 'copy', label: '复制', icon: Copy },
    { id: 'cut', label: '剪切', icon: Scissors },
    ...(hasClipboard ? [{ id: 'paste', label: '粘贴', icon: Clipboard }] : []),
    { id: 'rename', label: '重命名', icon: FileText },
    { id: 'delete', label: '删除', icon: Trash2 },
  ];

  // 编辑器块操作菜单项
  const blockMenuItems = [
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

  const menuItems = isFile ? fileMenuItems : blockMenuItems;

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[150px] rounded border shadow-lg"
      style={{
        left: `${menuPosition.x}px`,
        top: `${menuPosition.y}px`,
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

