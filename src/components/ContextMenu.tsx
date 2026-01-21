/**
 * No Visitors - 右键菜单组件
 * 提供复制、粘贴、剪切、全选等标准编辑操作
 */

'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Scissors, Clipboard, MousePointer2, Trash2, FileText, Folder, Palette } from 'lucide-react';
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
  hasClipboard?: boolean; // 剪贴板是否有内容（用于文件操作）
  isRootMenu?: boolean; // 是否为根目录右键菜单
  isDirectory?: boolean; // 当前选中的项是否为目录（用于显示"设置主题"选项）
}

/**
 * 右键菜单组件
 * 
 * 位置计算说明：
 * 1. 接收的 x, y 是点击位置的 clientX/clientY（相对于视口的坐标）
 * 2. 菜单使用 fixed 定位，left 和 top 直接设置为 x, y
 * 3. 菜单左上角应该精确对齐到点击位置
 * 4. 只在菜单超出视口边界时才调整位置
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
  isRootMenu = false,
  isDirectory = false,
}: ContextMenuProps) {
  const { theme } = useTheme();
  const menuRef = useRef<HTMLDivElement>(null);
  // 直接使用传入的坐标，不进行任何偏移修正
  const [menuPosition, setMenuPosition] = React.useState({ x, y });

  // 更新菜单位置
  useEffect(() => {
    setMenuPosition({ x, y });
  }, [x, y]);

  // 调整菜单位置，确保不超出视口（仅在超出边界时调整）
  useEffect(() => {
    if (!menuRef.current) return;
    
    // 使用 requestAnimationFrame 确保菜单完全渲染完成后再检查边界
    const rafId = requestAnimationFrame(() => {
      if (!menuRef.current) return;
      
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      let adjustedX = menuPosition.x;
      let adjustedY = menuPosition.y;
      let needsAdjustment = false;
      
      // 如果菜单超出右边界，向左调整
      if (rect.right > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
        needsAdjustment = true;
      }
      
      // 如果菜单超出下边界，向上调整
      if (rect.bottom > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 10;
        needsAdjustment = true;
      }
      
      // 如果菜单超出左边界，向右调整
      if (adjustedX < 10) {
        adjustedX = 10;
        needsAdjustment = true;
      }
      
      // 如果菜单超出上边界，向下调整
      if (adjustedY < 10) {
        adjustedY = 10;
        needsAdjustment = true;
      }
      
      // 只在需要调整时才更新位置
      if (needsAdjustment && (adjustedX !== menuPosition.x || adjustedY !== menuPosition.y)) {
        setMenuPosition({ x: adjustedX, y: adjustedY });
      }
    });
    
    return () => cancelAnimationFrame(rafId);
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
  const fileMenuItems = isRootMenu
    ? [
        // 根目录右键菜单：只有新建文件和新建文件夹
        { id: 'createFile', label: '新建文件', icon: FileText },
        { id: 'createDirectory', label: '新建文件夹', icon: Folder },
      ]
    : [
        { id: 'createFile', label: '新建文件', icon: FileText },
        { id: 'createDirectory', label: '新建文件夹', icon: Folder },
        ...(isDirectory ? [{ id: 'setTheme', label: '设置主题', icon: Palette }] : []), // 仅在目录右键菜单中显示
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

  // 使用 Portal 将菜单渲染到 document.body，避免受父元素 transform 影响
  // 这样可以确保 fixed 定位相对于视口，而不是相对于有 transform 的父元素
  const menuContent = (
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[150px] rounded border shadow-lg overflow-hidden"
      style={{
        left: `${menuPosition.x}px`,
        top: `${menuPosition.y}px`,
        backgroundColor: getThemeSurfaceColor(theme),
        borderColor: getThemeBorderColor(theme),
        margin: 0,
        padding: 0,
        boxSizing: 'border-box',
        position: 'fixed',
        display: 'block',
        borderWidth: '1px',
        borderStyle: 'solid',
        transform: 'none', // 明确禁用任何 transform，避免影响定位
        lineHeight: 'normal', // 确保行高不影响定位
        verticalAlign: 'top', // 确保垂直对齐不影响定位
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
              lineHeight: 'normal', // 恢复按钮内的行高
            }}
            aria-label={item.label}
          >
            <Icon size={16} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );

  // 使用 Portal 渲染到 document.body，确保不受父元素 transform 影响
  if (typeof window !== 'undefined') {
    return createPortal(menuContent, document.body);
}

  return menuContent;
}
