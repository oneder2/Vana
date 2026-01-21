/**
 * No Visitors - 侧边栏组件
 * 文件浏览器，显示文件夹树形结构
 * 支持点击打开文件和文件夹展开/收起
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Folder, FileText, ChevronRight, Plus } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { getThemeSurfaceColor, getThemeBorderColor, getThemeAccentColor, getThemeAccentBgColor, getThemeBgColor } from '@/lib/themeStyles';
import { getTheme } from '@/lib/themes';
import { listDirectory, type FileInfo, createFile, createDirectory, deleteFile, deleteDirectory, deleteFileWithGitSync, deleteDirectoryWithGitSync, renameFileOrDirectory, renameFileWithGitSync, copyFileOrDirectory, moveFileOrDirectory, getPatToken, getRemoteUrl } from '@/lib/api';
import type { JSONContent } from '@tiptap/core';
import { ContextMenu } from './ContextMenu';
import { saveTreeExpandedState, loadTreeExpandedState } from '@/lib/cache';
import { LoadingOverlay } from './LoadingOverlay';
import { useToast } from './ToastProvider';
import { Modal } from './Modal';
import { InputModal } from './InputModal';
import { ThemeSelectorModal } from './ThemeSelectorModal';
import { validateFileName } from '@/lib/fileValidator';
import { removeEncSuffix, ensureEncSuffix } from '@/lib/fileNameUtils';
import { FileTreeSkeleton } from './Skeleton';
import { writeAtmosphereConfig, readAtmosphereConfig } from '@/lib/api';
import { loadAtmosphereConfig } from '@/lib/atmosphere';
import type { ThemeId } from '@/lib/themes';

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
  onContextMenu,
  expandedPaths,
  onToggleExpand,
  onDrop,
  onClearRootDragOver,
  focusedItemPath,
  directoryThemeId,
}: {
  item: FileInfo;
  level?: number;
  onSelect?: (path: string) => void;
  onDirectoryChange?: (path: string) => void;
  theme: ReturnType<typeof useTheme>['theme'];
  onContextMenu?: (e: React.MouseEvent, item: FileInfo) => void;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  onDrop?: (sourcePath: string, destPath: string) => void;
  onClearRootDragOver?: () => void;
  focusedItemPath?: string | null;
  directoryThemeId?: ThemeId; // 目录的主题ID（用于显示颜色标识）
}) {
  // 从expandedPaths恢复展开状态
  const [isExpanded, setIsExpanded] = useState(expandedPaths.has(item.path));
  const [children, setChildren] = useState<FileInfo[]>([]);
  const [itemThemeId, setItemThemeId] = useState<ThemeId | undefined>(directoryThemeId);

  // 当expandedPaths改变时，同步展开状态
  useEffect(() => {
    setIsExpanded(expandedPaths.has(item.path));
  }, [expandedPaths, item.path]);

  // 加载目录的主题配置（如果未提供）
  useEffect(() => {
    if (item.is_directory && !itemThemeId) {
      readAtmosphereConfig(item.path)
        .then((config) => {
          setItemThemeId(config.theme as ThemeId);
        })
        .catch((error) => {
          // 如果目录没有 .vnode.json，不设置（使用默认主题）
        });
    }
  }, [item.path, item.is_directory, itemThemeId]);

  // 如果已展开但还没有加载子项，则加载
  // 或者当 item.path 改变时（重命名后），重新加载
  useEffect(() => {
    if (isExpanded && item.is_directory) {
      // 每次展开或路径改变时都重新加载，确保显示最新内容
      listDirectory(item.path)
        .then((items) => {
          setChildren(items);
        })
        .catch((error) => {
          console.error('加载目录失败:', error);
        });
    } else if (!isExpanded) {
      // 收起时清空子项，下次展开时重新加载
      setChildren([]);
    }
  }, [isExpanded, item.path, item.is_directory]);

  const handleClick = async () => {
    if (item.is_directory) {
      const newExpanded = !isExpanded;
      setIsExpanded(newExpanded);
      onToggleExpand(item.path);
      
      if (newExpanded && children.length === 0) {
        try {
          const items = await listDirectory(item.path);
          setChildren(items);
        } catch (error) {
          console.error('加载目录失败:', error);
        }
      }
      // 移除：点击文件夹不应该改变主题，只有点击文本文档时才改变主题
      // onDirectoryChange?.(item.path);
    } else {
      onSelect?.(item.path);
    }
  };

  const handleContextMenuEvent = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // 阻止事件冒泡，确保操作对象正确
    onContextMenu?.(e, item);
  };

  // 拖拽处理
  const [isDragging, setIsDragging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.path);
      // 设置拖拽图像（半透明预览）
      if (e.dataTransfer.setDragImage) {
        const dragImage = document.createElement('div');
        dragImage.textContent = removeEncSuffix(item.name);
      dragImage.style.position = 'absolute';
      dragImage.style.top = '-1000px';
      dragImage.style.padding = '4px 8px';
      dragImage.style.borderRadius = '4px';
      dragImage.style.backgroundColor = getThemeSurfaceColor(theme);
      dragImage.style.color = getThemeAccentColor(theme);
      dragImage.style.border = `1px solid ${getThemeBorderColor(theme)}`;
      dragImage.style.opacity = '0.8';
      dragImage.style.fontSize = '12px';
      dragImage.style.whiteSpace = 'nowrap';
      document.body.appendChild(dragImage);
      e.dataTransfer.setDragImage(dragImage, 0, 0);
      setTimeout(() => document.body.removeChild(dragImage), 0);
    }
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    // 拖拽结束时清除根目录的拖拽状态
    onClearRootDragOver?.();
  };

  const handleDragOver = (e: React.DragEvent) => {
    // 只允许拖拽到目录
    if (item.is_directory) {
      e.preventDefault();
      e.stopPropagation(); // 阻止事件冒泡到根目录
      e.dataTransfer.dropEffect = 'move';
      setIsDragOver(true);
      // 清除根目录的拖拽状态
      onClearRootDragOver?.();
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // 只有当真正离开当前元素时才清除状态
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation(); // 阻止事件冒泡到根目录
    setIsDragOver(false);
    
    if (!item.is_directory) return;
    
    const sourcePath = e.dataTransfer.getData('text/plain');
    if (!sourcePath || sourcePath === item.path) return;
    
    // 防止拖拽到自己的子目录：检查目标目录是否是源目录的子目录
    // 如果源路径是目标路径的前缀，说明目标目录在源目录内部
    if (item.path.startsWith(sourcePath + '/')) {
      // 使用toast显示错误，但不阻止操作（已通过return阻止）
      return;
    }
    
    // 防止拖拽到自身
    if (sourcePath === item.path) {
      return;
    }
    
    // 构建目标路径：目标目录路径 + 源文件名/目录名
    const sourceName = sourcePath.split('/').pop() || sourcePath;
    const destPath = `${item.path}/${sourceName}`;
    
    // 检查目标路径是否与源路径相同（防止移动到同一位置）
    if (sourcePath === destPath) {
      return;
    }
    
    onDrop?.(sourcePath, destPath);
  };

  return (
    <div className="relative">
      {/* 树状结构竖线：显示层级关系 */}
      {level > 0 && (
        <div
          className="absolute left-0 top-0 bottom-0 w-px"
          style={{
            backgroundColor: getThemeBorderColor(theme),
            opacity: 0.3,
            left: `${(level - 1) * 1 + 0.25}rem`,
          }}
        />
      )}
      
      <div
        onClick={handleClick}
        onContextMenu={handleContextMenuEvent}
        draggable={true}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-all duration-200 relative ${
          item.is_directory
            ? 'hover:bg-stone-800/20'
            : 'opacity-50 hover:opacity-100'
        } ${isDragging ? 'opacity-30 scale-95' : ''} ${isDragOver ? 'bg-stone-800/40 scale-[1.02]' : ''}`}
        style={{ 
          paddingLeft: `${level * 1 + 0.5}rem`,
          ...(isDragOver ? { 
            outline: `2px solid ${getThemeAccentColor(theme)}`,
            outlineOffset: '2px',
            backgroundColor: getThemeAccentBgColor(theme) + '60',
          } : focusedItemPath === item.path ? {
            outline: `1px solid ${getThemeAccentColor(theme)}`,
            outlineOffset: '-1px',
            backgroundColor: getThemeAccentBgColor(theme) + '40',
          } : {}),
        }}
        role={item.is_directory ? 'treeitem' : 'listitem'}
        aria-label={item.is_directory ? `文件夹 ${removeEncSuffix(item.name)}` : `文件 ${removeEncSuffix(item.name)}`}
        aria-expanded={item.is_directory ? isExpanded : undefined}
      >
        {/* 层级竖线连接点（在每个层级位置） */}
        {Array.from({ length: level }).map((_, idx) => (
          <div
            key={idx}
            className="absolute top-0 bottom-0 w-px"
            style={{
              backgroundColor: getThemeBorderColor(theme),
              opacity: 0.3,
              left: `${idx * 1 + 0.25}rem`,
            }}
          />
        ))}
        
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
        <span className="text-xs truncate flex-1">{removeEncSuffix(item.name)}</span>
        {/* 目录主题颜色标识 */}
        {item.is_directory && itemThemeId && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <div
              className="w-2 h-2 rounded-full border"
              style={{
                backgroundColor: getThemeAccentBgColor(getTheme(itemThemeId)).replace(/\/\d+/, ''),
                borderColor: getThemeBorderColor(getTheme(itemThemeId)),
              }}
              title={`主题: ${getTheme(itemThemeId).name}`}
            />
          </div>
        )}
      </div>
      {isExpanded && item.is_directory && (
        <div className="relative">
          {children.map((child, childIndex) => {
            // 尝试从父组件传入的主题映射中获取子目录的主题
            // 这里需要父组件传递一个directoryThemesMap
            // 暂时使用null，让每个FolderItem自己加载（如果性能有问题再优化）
            const childThemeId = child.is_directory ? undefined : undefined;
            const isLastChild = childIndex === children.length - 1;
            return (
              <div key={child.path} className="relative">
                {/* 连接父级和子级的竖线（仅在非最后一项时显示） */}
                {!isLastChild && (
                  <div
                    className="absolute left-0 top-0 bottom-0 w-px"
                    style={{
                      backgroundColor: getThemeBorderColor(theme),
                      opacity: 0.3,
                      left: `${level * 1 + 0.25}rem`,
                    }}
                  />
                )}
              <FolderItem
                item={child}
                level={level + 1}
                onSelect={onSelect}
                onDirectoryChange={onDirectoryChange}
                theme={theme}
                onContextMenu={onContextMenu}
                expandedPaths={expandedPaths}
                onToggleExpand={onToggleExpand}
                onDrop={onDrop}
                onClearRootDragOver={onClearRootDragOver}
                focusedItemPath={focusedItemPath}
                directoryThemeId={childThemeId}
              />
              </div>
            );
          })}
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
  const toast = useToast();
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: FileInfo | null } | null>(null);
  const [isRenaming, setIsRenaming] = useState(false); // 重命名操作进行中标志
  const [isOperationInProgress, setIsOperationInProgress] = useState(false); // 文件操作进行中标志
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; item: FileInfo | null }>({ isOpen: false, item: null });
  const [inputModal, setInputModal] = useState<{ 
    isOpen: boolean; 
    type: 'createFile' | 'createDirectory' | 'rename';
    defaultValue?: string;
    item?: FileInfo | null; // 保存要重命名的项目（避免 contextMenu 关闭后丢失）
  }>({ isOpen: false, type: 'createFile' });
  
  // 主题选择模态框状态
  const [themeSelectorModal, setThemeSelectorModal] = useState<{
    isOpen: boolean;
    directoryPath: string | null;
    currentThemeId?: ThemeId;
  }>({ isOpen: false, directoryPath: null });
  
  // 目录主题配置缓存（用于显示颜色标识）
  const [directoryThemes, setDirectoryThemes] = useState<Map<string, ThemeId>>(new Map());
  
  // 剪贴板状态管理
  const [clipboard, setClipboard] = useState<{ type: 'copy' | 'cut'; item: FileInfo } | null>(null);
  
  // 根目录拖拽状态
  const [isRootDragOver, setIsRootDragOver] = useState(false);
  
  // 使用useRef维护展开状态，避免重新渲染时丢失
  const expandedPathsRef = useRef<Set<string>>(new Set());
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  
  // 键盘导航：跟踪当前聚焦的项
  const [focusedItemPath, setFocusedItemPath] = useState<string | null>(null);
  const focusedItemRef = useRef<string | null>(null);

  // 从缓存加载展开状态
  useEffect(() => {
    const savedPaths = loadTreeExpandedState();
    const pathsSet = new Set(savedPaths);
    expandedPathsRef.current = pathsSet;
    setExpandedPaths(pathsSet);
  }, []);

  // 键盘导航支持（仅在侧边栏打开时生效，支持顶层文件项导航）
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 如果焦点在输入框或其他可编辑元素上，不处理
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // 如果右键菜单或Modal打开，不处理
      if (contextMenu || deleteModal.isOpen || inputModal.isOpen) {
        return;
      }

      // 只在顶层文件项中导航（简化实现）
      if (files.length === 0) return;

      let currentIndex = -1;
      if (focusedItemRef.current) {
        currentIndex = files.findIndex((item) => item.path === focusedItemRef.current);
      }

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const nextIndex = currentIndex < files.length - 1 ? currentIndex + 1 : 0;
          const nextItem = files[nextIndex];
          if (nextItem) {
            focusedItemRef.current = nextItem.path;
            setFocusedItemPath(nextItem.path);
          }
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : files.length - 1;
          const prevItem = files[prevIndex];
          if (prevItem) {
            focusedItemRef.current = prevItem.path;
            setFocusedItemPath(prevItem.path);
          }
          break;
        }
        case 'Enter': {
          e.preventDefault();
          if (focusedItemRef.current) {
            const item = files.find((item) => item.path === focusedItemRef.current);
            if (item) {
              if (item.is_directory) {
                handleToggleExpand(item.path);
              } else {
                onFileSelect?.(item.path);
              }
            }
          }
          break;
        }
        case 'Escape': {
          // ESC关闭右键菜单
          if (contextMenu) {
            setContextMenu(null);
          }
          focusedItemRef.current = null;
          setFocusedItemPath(null);
          break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, files, contextMenu, deleteModal.isOpen, inputModal.isOpen, onFileSelect]);

  // 切换展开状态
  const handleToggleExpand = (path: string) => {
    const newSet = new Set(expandedPathsRef.current);
    if (newSet.has(path)) {
      newSet.delete(path);
    } else {
      newSet.add(path);
    }
    expandedPathsRef.current = newSet;
    setExpandedPaths(newSet);
    // 保存到缓存
    saveTreeExpandedState(Array.from(newSet));
  };

  // 处理拖拽放置
  const handleDrop = async (sourcePath: string, destPath: string) => {
    try {
      // 再次检查边界条件（防止在异步操作前路径被修改）
      // 检查源路径和目标路径是否相同
      if (sourcePath === destPath) {
        return;
      }
      
      // 防止将目录移动到其自身或子目录中
      // 检查目标路径的父目录是否是源路径的子目录
      const destParent = destPath.substring(0, destPath.lastIndexOf('/'));
      if (destParent.startsWith(sourcePath + '/')) {
        toast.error('不能将目录移动到其自身或子目录中');
        return;
      }
      
      await moveFileOrDirectory(sourcePath, destPath);
      await refreshFiles();
    } catch (error) {
      console.error('拖拽移动失败:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // 提供更友好的错误信息
      if (errorMessage.includes('目标路径已存在')) {
        toast.error('目标位置已存在同名文件或目录');
      } else if (errorMessage.includes('不能将目录移动到其自身或子目录')) {
        toast.error('不能将目录移动到其自身或子目录中');
      } else {
        toast.error(`移动文件失败: ${errorMessage}`);
      }
    }
  };

  // 处理根目录拖拽
  const handleRootDragOver = (e: React.DragEvent) => {
    // 检查是否有文件被拖拽（通过检查 dataTransfer 的类型）
    if (e.dataTransfer.types.includes('text/plain')) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      setIsRootDragOver(true);
    }
  };

  const handleRootDragLeave = (e: React.DragEvent) => {
    // 只有当离开根目录区域且没有进入子元素时才清除状态
    const relatedTarget = e.relatedTarget as HTMLElement;
    // 如果 relatedTarget 是文件列表项，不清除状态（由文件列表项自己处理）
    if (relatedTarget && relatedTarget.closest('.space-y-1')) {
      return;
    }
    // 如果真正离开了根目录区域，清除状态
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setIsRootDragOver(false);
    }
  };

  const handleRootDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsRootDragOver(false);
    
    const sourcePath = e.dataTransfer.getData('text/plain');
    if (!sourcePath) return;
    
    // 检查源路径是否已经是根目录下的文件
    if (sourcePath.startsWith(workspacePath + '/')) {
      const relativePath = sourcePath.substring(workspacePath.length + 1);
      // 如果源路径在根目录下且没有子目录，说明已经在根目录
      if (!relativePath.includes('/')) {
        return; // 已经在根目录，不需要移动
      }
    }
    
    // 构建目标路径：根目录 + 源文件名/目录名
    const sourceName = sourcePath.split('/').pop() || sourcePath;
    const destPath = `${workspacePath}/${sourceName}`;
    
    // 检查源路径和目标路径是否相同
    if (sourcePath === destPath) {
      return;
    }
    
    await handleDrop(sourcePath, destPath);
  };

  // 刷新文件列表（保持展开状态）
  const refreshFiles = async () => {
    try {
      setLoading(true);
      const items = await listDirectory(workspacePath);
      setFiles(items);
      
      // 加载目录主题配置（用于显示颜色标识）
      const newThemes = new Map<string, ThemeId>();
      const loadDirectoryThemes = async (dirItems: FileInfo[]) => {
        for (const item of dirItems) {
          if (item.is_directory) {
            try {
              const config = await readAtmosphereConfig(item.path);
              newThemes.set(item.path, config.theme as ThemeId);
            } catch (error) {
              // 如果目录没有 .vnode.json，不设置（使用默认主题）
            }
          }
        }
      };
      
      await loadDirectoryThemes(items);
      setDirectoryThemes(newThemes);
      
      // 刷新后展开状态会自动恢复（通过expandedPaths state）
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
    e.stopPropagation();
    // 直接使用 clientX/clientY，这是相对于视口的坐标，不受滚动或 transform 影响
    // 确保菜单左上角精确对齐到点击位置
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  };


  // 处理菜单操作
  const handleMenuAction = async (action: string) => {
    // 根目录右键菜单只需要处理创建操作
    const isRootMenu = !contextMenu?.item;
    if (isRootMenu && action !== 'createFile' && action !== 'createDirectory') {
      return;
    }
    
    if (!contextMenu?.item && action !== 'paste' && action !== 'createFile' && action !== 'createDirectory') return;

    const item = contextMenu?.item;
    try {
      switch (action) {
        case 'createFile': {
          if (isOperationInProgress) break;
          // 保存当前右键的 item，以便在创建时知道父目录
          setInputModal({ isOpen: true, type: 'createFile', item: contextMenu?.item || null });
          setContextMenu(null); // 关闭右键菜单
          break;
        }
        case 'createDirectory': {
          if (isOperationInProgress) break;
          // 保存当前右键的 item，以便在创建时知道父目录
          setInputModal({ isOpen: true, type: 'createDirectory', item: contextMenu?.item || null });
          setContextMenu(null); // 关闭右键菜单
          break;
        }
        case 'copy': {
          if (!item) break;
          // 复制到剪贴板
          setClipboard({ type: 'copy', item });
          break;
        }
        case 'cut': {
          if (!item) break;
          // 剪切到剪贴板
          setClipboard({ type: 'cut', item });
          break;
        }
        case 'paste': {
          if (isOperationInProgress) break;
          // 粘贴文件
          if (!clipboard) {
            toast.error('剪贴板为空');
            break;
          }
          
          setIsOperationInProgress(true);
          try {
            // 确定目标目录
            let targetDir: string;
            if (item && item.is_directory) {
              targetDir = item.path;
            } else if (item) {
              // 如果点击的是文件，粘贴到其父目录
              targetDir = item.path.substring(0, item.path.lastIndexOf('/'));
            } else {
              // 如果没有选中项，粘贴到工作区根目录
              targetDir = workspacePath;
            }
            
            const sourcePath = clipboard.item.path;
            const destPath = `${targetDir}/${clipboard.item.name}`;
            
            if (clipboard.type === 'copy') {
              // 复制文件
              await copyFileOrDirectory(sourcePath, destPath);
            } else {
              // 移动文件
              await moveFileOrDirectory(sourcePath, destPath);
              // 移动后清空剪贴板
              setClipboard(null);
            }
            await refreshFiles();
          } catch (error) {
            console.error('粘贴失败:', error);
            toast.error(`粘贴失败: ${error instanceof Error ? error.message : String(error)}`);
          } finally {
            setIsOperationInProgress(false);
          }
          break;
        }
        case 'rename': {
          if (!item || isOperationInProgress) break;
          setInputModal({ 
            isOpen: true, 
            type: 'rename', 
            defaultValue: removeEncSuffix(item.name),
            item: item // 保存 item 到 inputModal state 中
          });
          break;
        }
        case 'setTheme': {
          if (!item || !item.is_directory) break;
          // 打开主题选择器
          // 先加载当前目录的主题配置
          try {
            const config = await readAtmosphereConfig(item.path);
            setThemeSelectorModal({
              isOpen: true,
              directoryPath: item.path,
              currentThemeId: config.theme as ThemeId,
            });
          } catch (error) {
            // 如果加载失败，使用默认主题
            setThemeSelectorModal({
              isOpen: true,
              directoryPath: item.path,
              currentThemeId: 'arcane',
            });
          }
          break;
        }
        case 'delete': {
          if (!item) break;
          // 显示删除确认对话框
          setDeleteModal({ isOpen: true, item });
          break;
        }
      }
    } catch (error) {
      console.error('操作失败:', error);
      toast.error(`操作失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // 处理主题选择
  const handleThemeSelect = async (themeId: ThemeId) => {
    if (!themeSelectorModal.directoryPath || isOperationInProgress) return;

    setIsOperationInProgress(true);
    try {
      // 保存主题配置到目录的 .vnode.json
      await writeAtmosphereConfig(themeSelectorModal.directoryPath, { theme: themeId });
      
      // 更新本地缓存
      const newThemes = new Map(directoryThemes);
      newThemes.set(themeSelectorModal.directoryPath, themeId);
      setDirectoryThemes(newThemes);
      
      // 通知父组件目录主题已更改（如果需要立即应用主题）
      onDirectoryChange?.(themeSelectorModal.directoryPath);
      
      toast.info(`主题已设置为 ${themeId}`);
      setThemeSelectorModal({ isOpen: false, directoryPath: null });
      setContextMenu(null);
    } catch (error) {
      console.error('设置主题失败:', error);
      toast.error(`设置主题失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsOperationInProgress(false);
    }
  };

  // 处理删除确认
  const handleDeleteConfirm = async () => {
    const item = deleteModal.item;
    if (!item || isOperationInProgress) return;

    setIsOperationInProgress(true);
    try {
      // 获取 PAT Token 和远程仓库 URL（用于 Git 同步）
      const patToken = await getPatToken();
      const remoteUrl = await getRemoteUrl(workspacePath, 'origin');
      
      // 如果配置了远程仓库和 PAT，使用带 Git 同步的删除
      if (remoteUrl && patToken) {
        console.log('[删除] 使用 Git 同步删除');
        if (item.is_directory) {
          await deleteDirectoryWithGitSync(
            workspacePath,
            item.path,
            'origin',
            'main',
            patToken
          );
          // 删除目录时，也清除主题缓存
          const newThemes = new Map(directoryThemes);
          newThemes.delete(item.path);
          setDirectoryThemes(newThemes);
        } else {
          await deleteFileWithGitSync(
            workspacePath,
            item.path,
            'origin',
            'main',
            patToken
          );
        }
      } else {
        // 否则只执行删除（不推送）
        console.log('[删除] 仅执行删除（未配置远程仓库或 PAT）');
        if (item.is_directory) {
          await deleteDirectory(item.path);
          // 删除目录时，也清除主题缓存
          const newThemes = new Map(directoryThemes);
          newThemes.delete(item.path);
          setDirectoryThemes(newThemes);
        } else {
          await deleteFile(item.path);
        }
      }
      await refreshFiles();
      setDeleteModal({ isOpen: false, item: null });
      setContextMenu(null);
    } catch (error) {
      console.error('删除失败:', error);
      toast.error(`删除失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsOperationInProgress(false);
    }
  };

  // 处理输入确认
  const handleInputConfirm = async (value: string) => {
    if (isOperationInProgress) return;

    // 优先从 inputModal.item 获取 item（因为 contextMenu 可能在打开 modal 后已关闭）
    // 这样可以确保在目录上右键创建文件/目录时，能正确获取父目录信息
    const item = inputModal.item || contextMenu?.item;
    const isRootMenu = !item;
    
    // 调试日志：确认 item 是否正确传递
    if (inputModal.type === 'createFile' || inputModal.type === 'createDirectory') {
      console.log(`[创建${inputModal.type === 'createFile' ? '文件' : '目录'}] item:`, item, 'isRootMenu:', isRootMenu);
    }

    setIsOperationInProgress(true);
    try {
      switch (inputModal.type) {
        case 'createFile': {
          // 确保文件名包含 .enc 后缀
          const fileName = ensureEncSuffix(value, false);
          
          let filePath: string;
          if (isRootMenu) {
            filePath = `${workspacePath}/${fileName}`;
          } else if (item) {
            filePath = item.is_directory
              ? `${item.path}/${fileName}`
              : `${item.path.substring(0, item.path.lastIndexOf('/'))}/${fileName}`;
          } else {
            setInputModal({ isOpen: false, type: 'createFile', item: null });
            return;
          }
          // 创建新文件时使用默认的 Tiptap JSON 格式
          const defaultContent: JSONContent = { type: 'doc', content: [] };
          await createFile(filePath, JSON.stringify(defaultContent, null, 2));
          await refreshFiles();
          if (isRootMenu) {
            setContextMenu(null);
          }
          // 关闭 modal
          setInputModal({ isOpen: false, type: 'createFile', item: null });
          break;
        }
        case 'createDirectory': {
          let dirPath: string;
          if (isRootMenu) {
            dirPath = `${workspacePath}/${value}`;
          } else if (item) {
            dirPath = item.is_directory
              ? `${item.path}/${value}`
              : `${item.path.substring(0, item.path.lastIndexOf('/'))}/${value}`;
          } else {
            setInputModal({ isOpen: false, type: 'createFile', item: null });
            return;
          }
          await createDirectory(dirPath);
          await refreshFiles();
          if (isRootMenu) {
            setContextMenu(null);
          }
          // 关闭 modal
          setInputModal({ isOpen: false, type: 'createFile', item: null });
          break;
        }
        case 'rename': {
          if (!item) {
            console.error('[重命名] 错误：item 为空');
            setInputModal({ isOpen: false, type: 'createFile', item: null });
            return;
          }
          
          console.log('[重命名] 开始重命名，item:', item.name, 'value:', value);
          
          // 比较时也需要去掉 .enc 后缀
          const displayName = removeEncSuffix(item.name);
          console.log('[重命名] displayName:', displayName, 'value:', value);
          
          if (value === displayName) {
            // 名称相同，直接关闭 modal
            console.log('[重命名] 名称相同，取消重命名');
            setInputModal({ isOpen: false, type: 'createFile', item: null });
            return;
          }

          // 确保新文件名包含 .enc 后缀（如果是文件）
          const newFileName = ensureEncSuffix(value, item.is_directory);
          console.log('[重命名] newFileName:', newFileName);
          
          // 构建新路径：获取原路径的目录部分 + 新文件名
          const pathParts = item.path.split('/');
          pathParts[pathParts.length - 1] = newFileName;
          const newPath = pathParts.join('/');
          
          // 获取父目录路径（用于刷新）
          const parentDir = pathParts.slice(0, -1).join('/') || workspacePath;
          
          console.log('[重命名] 旧路径:', item.path);
          console.log('[重命名] 新路径:', newPath);
          console.log('[重命名] 父目录:', parentDir);
          
          // 显示加载覆盖层
          setIsRenaming(true);
          
          try {
            // 获取 PAT Token 和远程仓库 URL（用于 Git 同步）
            const patToken = await getPatToken();
            const remoteUrl = await getRemoteUrl(workspacePath, 'origin');
            
            // 如果配置了远程仓库和 PAT，使用带 Git 同步的重命名
            if (remoteUrl && patToken) {
              console.log('[重命名] 使用 Git 同步重命名');
              await renameFileWithGitSync(
                workspacePath,
                item.path,
                newPath,
                'origin',
                'main',
                patToken
              );
              console.log('[重命名] Git 同步重命名完成');
            } else {
              // 否则只执行重命名（不推送）
              console.log('[重命名] 仅执行重命名（未配置远程仓库或 PAT）');
              await renameFileOrDirectory(item.path, newPath);
              console.log('[重命名] 重命名完成');
            }
            
            console.log('[重命名] 开始刷新文件列表');
            // 如果重命名的文件在根目录，刷新根目录
            // 如果在子目录，需要刷新父目录（但 refreshFiles 只刷新根目录）
            // 所以我们需要强制刷新整个文件树
            await refreshFiles();
            
            // 如果父目录不是根目录，需要更新展开状态以触发子目录刷新
            if (parentDir !== workspacePath) {
              // 触发父目录的重新加载
              // 通过更新 expandedPaths 来触发 FolderItem 的重新加载
              const newExpandedPaths = new Set(expandedPaths);
              if (newExpandedPaths.has(parentDir)) {
                // 先移除再添加，触发重新加载
                newExpandedPaths.delete(parentDir);
                setExpandedPaths(newExpandedPaths);
                setTimeout(() => {
                  newExpandedPaths.add(parentDir);
                  setExpandedPaths(new Set(newExpandedPaths));
                }, 100);
              }
            }
            
            console.log('[重命名] 文件列表刷新完成');
            
            // 关闭 modal
            setInputModal({ isOpen: false, type: 'createFile', item: null });
            console.log('[重命名] Modal 已关闭');
          } catch (error) {
            console.error('[重命名] 重命名失败:', error);
            toast.error(`重命名失败: ${error instanceof Error ? error.message : String(error)}`);
            // 发生错误时也关闭 modal
            setInputModal({ isOpen: false, type: 'createFile', item: null });
          } finally {
            setIsRenaming(false);
          }
          break;
        }
      }
      // 注意：每个 case 都应该自己负责关闭 modal
      // 这里不再统一关闭，避免重复关闭
    } catch (error) {
      console.error('操作失败:', error);
      toast.error(`操作失败: ${error instanceof Error ? error.message : String(error)}`);
      // 发生错误时关闭 modal
      setInputModal({ isOpen: false, type: 'createFile', item: null });
    } finally {
      setIsOperationInProgress(false);
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
      onContextMenu={(e) => {
        // 阻止 Tauri 默认右键菜单
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div 
        className="p-4 flex-1 overflow-y-auto transition-colors"
        onDragOver={handleRootDragOver}
        onDragLeave={handleRootDragLeave}
        onDrop={handleRootDrop}
        onContextMenu={(e) => {
          // 如果点击的是文件列表项，不处理（由文件列表项自己处理）
          const target = e.target as HTMLElement;
          if (target.closest('.space-y-1')) {
            return;
          }
          // 如果点击的是创建按钮，不处理（由按钮自己处理）
          if (target.closest('button[title="创建文件或文件夹"]')) {
            return;
          }
          // 显示根目录右键菜单
          e.preventDefault();
          e.stopPropagation();
          setContextMenu({ x: e.clientX, y: e.clientY, item: null });
        }}
        style={{
          ...(isRootDragOver ? {
            backgroundColor: getThemeAccentBgColor(theme) + '40',
            outline: `2px dashed ${getThemeAccentColor(theme)}`,
            outlineOffset: '-2px',
          } : {}),
        }}
      >
        <div className={`text-[10px] ${theme.uiFont} mb-4 opacity-40 uppercase tracking-widest flex items-center justify-between`}>
          <span>归档单元</span>
          {/* 创建文件/文件夹按钮 - 点击后显示根目录右键菜单 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              // 获取按钮位置
              const rect = e.currentTarget.getBoundingClientRect();
              setContextMenu({ 
                x: rect.right, 
                y: rect.top, 
                item: null 
              });
            }}
            className="w-6 h-6 rounded border flex items-center justify-center transition-opacity hover:opacity-80"
            style={{
              backgroundColor: getThemeAccentBgColor(theme),
              borderColor: getThemeBorderColor(theme),
              color: getThemeAccentColor(theme),
            }}
            title="创建文件或文件夹"
          >
            <Plus size={14} />
          </button>
        </div>
        {loading ? (
          <FileTreeSkeleton />
        ) : files.length === 0 ? (
          <div className="text-xs opacity-50">
            <div className="mb-2">目录为空</div>
            <div className="text-[10px] opacity-60">点击右上角 + 按钮创建文件或文件夹</div>
          </div>
        ) : (
          <div className="space-y-1">
            {files.map((item) => (
              <FolderItem
                key={item.path}
                item={item}
                onSelect={onFileSelect}
                onDirectoryChange={onDirectoryChange}
                theme={theme}
                onContextMenu={handleContextMenu}
                expandedPaths={expandedPaths}
                onToggleExpand={handleToggleExpand}
                onDrop={handleDrop}
                onClearRootDragOver={() => setIsRootDragOver(false)}
                focusedItemPath={focusedItemPath}
                directoryThemeId={item.is_directory ? directoryThemes.get(item.path) : undefined}
              />
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
          isFile={true}
          hasClipboard={!!clipboard}
          isRootMenu={!contextMenu.item}
          isDirectory={contextMenu.item?.is_directory || false}
        />
      )}
      
      {/* 加载覆盖层：文件操作进行中时显示 */}
      <LoadingOverlay 
        isVisible={isRenaming || isOperationInProgress} 
        message={isRenaming ? "正在重命名并同步到云端..." : "正在处理文件操作..."} 
      />

      {/* 输入对话框 */}
      <InputModal
        isOpen={inputModal.isOpen}
        title={
          inputModal.type === 'createFile'
            ? '创建文件'
            : inputModal.type === 'createDirectory'
            ? '创建目录'
            : '重命名'
        }
        placeholder={
          inputModal.type === 'createFile'
            ? '请输入文件名（不含扩展名）'
            : inputModal.type === 'createDirectory'
            ? '请输入目录名'
            : '请输入新名称'
        }
        defaultValue={inputModal.defaultValue || ''}
        confirmText="确认"
        cancelText="取消"
        validator={validateFileName}
        onConfirm={handleInputConfirm}
        onCancel={() => setInputModal({ isOpen: false, type: 'createFile', item: null })}
        isLoading={isRenaming || isOperationInProgress}
      />

      {/* 主题选择模态框 */}
      <ThemeSelectorModal
        isOpen={themeSelectorModal.isOpen}
        currentThemeId={themeSelectorModal.currentThemeId}
        onSelect={handleThemeSelect}
        onClose={() => setThemeSelectorModal({ isOpen: false, directoryPath: null })}
      />

      {/* 删除确认对话框 */}
      {deleteModal.item && (
        <Modal
          isOpen={deleteModal.isOpen}
          title={deleteModal.item.is_directory ? '删除目录' : '删除文件'}
          message={
            deleteModal.item.is_directory
              ? `确定要删除目录 "${removeEncSuffix(deleteModal.item.name)}" 吗？\n\n这将删除目录及其所有内容，此操作无法撤销。`
              : `确定要删除文件 "${removeEncSuffix(deleteModal.item.name)}" 吗？\n\n此操作无法撤销。`
          }
          confirmText="删除"
          cancelText="取消"
          type="danger"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteModal({ isOpen: false, item: null })}
        />
      )}
    </aside>
  );
}

