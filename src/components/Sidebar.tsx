/**
 * No Visitors - 侧边栏组件
 * 文件浏览器，显示文件夹树形结构
 * 支持点击打开文件和文件夹展开/收起
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Folder, FileText, ChevronRight } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { getThemeSurfaceColor, getThemeBorderColor } from '@/lib/themeStyles';
import { listDirectory, type FileInfo, createFile, createDirectory, deleteFile, deleteDirectory, renameFileOrDirectory } from '@/lib/api';
import { ContextMenu } from './ContextMenu';

// 侧边栏属性
interface SidebarProps {
  workspacePath: string;
  onFileSelect?: (path: string) => void;
  onDirectoryChange?: (path: string) => void;
  isOpen?: boolean;
  onToggle?: () => void;
}

/**
 * 文件夹项组件
 */
function FolderItem({
  item,
  level = 0,
  onSelect,
  onDirectoryChange,
  theme,
}: {
  item: FileInfo;
  level?: number;
  onSelect?: (path: string) => void;
  onDirectoryChange?: (path: string) => void;
  theme: ReturnType<typeof useTheme>['theme'];
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [children, setChildren] = useState<FileInfo[]>([]);

  const handleClick = async () => {
    if (item.is_directory) {
      setIsExpanded(!isExpanded);
      if (!isExpanded && children.length === 0) {
        try {
          const items = await listDirectory(item.path);
          setChildren(items);
        } catch (error) {
          console.error('加载目录失败:', error);
        }
      }
      // 通知父组件目录切换，加载氛围协议
      onDirectoryChange?.(item.path);
    } else {
      onSelect?.(item.path);
    }
  };

  return (
    <div>
      <div
        onClick={handleClick}
        className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
          item.is_directory
            ? 'hover:bg-stone-800/20'
            : 'opacity-50 hover:opacity-100'
        }`}
        style={{ paddingLeft: `${level * 1 + 0.5}rem` }}
      >
        {item.is_directory ? (
          <>
            <ChevronRight
              size={12}
              className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            />
            <Folder size={16} />
          </>
        ) : (
          <>
            <div className="w-4" /> {/* 占位符对齐 */}
            <FileText size={16} />
          </>
        )}
        <span className="text-xs truncate">{item.name}</span>
      </div>
      {isExpanded && item.is_directory && (
        <div>
          {children.map((child) => (
            <FolderItem
              key={child.path}
              item={child}
              level={level + 1}
              onSelect={onSelect}
              onDirectoryChange={onDirectoryChange}
              theme={theme}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 侧边栏主组件
 */
export function Sidebar({
  workspacePath,
  onFileSelect,
  onDirectoryChange,
  isOpen = true,
  onToggle,
}: SidebarProps) {
  const { theme } = useTheme();
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: FileInfo | null } | null>(null);

  // 刷新文件列表
  const refreshFiles = async () => {
    try {
      setLoading(true);
      const items = await listDirectory(workspacePath);
      setFiles(items);
    } catch (error) {
      console.error('加载文件列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 加载根目录内容
  useEffect(() => {
    if (workspacePath) {
      refreshFiles();
    }
  }, [workspacePath]);

  // 处理右键菜单
  const handleContextMenu = (e: React.MouseEvent, item: FileInfo) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  };

  // 处理菜单操作
  const handleMenuAction = async (action: string) => {
    if (!contextMenu?.item) return;

    const item = contextMenu.item;
    try {
      switch (action) {
        case 'createFile': {
          const fileName = prompt('请输入文件名（不含扩展名）:');
          if (fileName) {
            const filePath = item.is_directory
              ? `${item.path}/${fileName}`
              : `${item.path.substring(0, item.path.lastIndexOf('/'))}/${fileName}`;
            await createFile(filePath, '');
            await refreshFiles();
          }
          break;
        }
        case 'createDirectory': {
          const dirName = prompt('请输入目录名:');
          if (dirName) {
            const dirPath = item.is_directory
              ? `${item.path}/${dirName}`
              : `${item.path.substring(0, item.path.lastIndexOf('/'))}/${dirName}`;
            await createDirectory(dirPath);
            await refreshFiles();
          }
          break;
        }
        case 'rename': {
          const newName = prompt('请输入新名称:', item.name);
          if (newName && newName !== item.name) {
            const newPath = item.path.replace(item.name, newName);
            await renameFileOrDirectory(item.path, newPath);
            await refreshFiles();
          }
          break;
        }
        case 'delete': {
          if (confirm(`确定要删除 "${item.name}" 吗？`)) {
            if (item.is_directory) {
              await deleteDirectory(item.path);
            } else {
              await deleteFile(item.path);
            }
            await refreshFiles();
          }
          break;
        }
      }
    } catch (error) {
      console.error('操作失败:', error);
      alert(`操作失败: ${error}`);
    }
  };

  return (
    <aside
      className={`
        ${isOpen ? 'translate-x-0 w-64' : '-translate-x-full w-0'} 
        fixed md:relative z-40 h-full border-r 
        transition-all duration-300 ease-in-out flex flex-col
      `}
      style={{
        backgroundColor: getThemeSurfaceColor(theme),
        borderColor: getThemeBorderColor(theme),
      }}
    >
      <div className="p-4 flex-1 overflow-y-auto">
        <div className={`text-[10px] ${theme.uiFont} mb-4 opacity-40 uppercase tracking-widest`}>
          归档单元
        </div>
        {loading ? (
          <div className="text-xs opacity-50">加载中...</div>
        ) : (
          <div className="space-y-1">
            {files.map((item) => (
              <div
                key={item.path}
                onContextMenu={(e) => handleContextMenu(e, item)}
              >
                <FolderItem
                  item={item}
                  onSelect={onFileSelect}
                  onDirectoryChange={onDirectoryChange}
                  theme={theme}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onAction={handleMenuAction}
          isBlock={false}
        />
      )}
    </aside>
  );
}

