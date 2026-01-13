/**
 * No Visitors - 侧边栏组件
 * 文件浏览器，显示文件夹树形结构
 * 支持点击打开文件和文件夹展开/收起
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Folder, FileText, ChevronRight, Plus, FilePlus, FolderPlus } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { getThemeSurfaceColor, getThemeBorderColor, getThemeAccentColor, getThemeAccentBgColor } from '@/lib/themeStyles';
import { listDirectory, type FileInfo, createFile, createDirectory, deleteFile, deleteDirectory, renameFileOrDirectory, copyFileOrDirectory, moveFileOrDirectory } from '@/lib/api';
import { ContextMenu } from './ContextMenu';
import { saveTreeExpandedState, loadTreeExpandedState } from '@/lib/cache';

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
}) {
  // 从expandedPaths恢复展开状态
  const [isExpanded, setIsExpanded] = useState(expandedPaths.has(item.path));
  const [children, setChildren] = useState<FileInfo[]>([]);

  // 当expandedPaths改变时，同步展开状态
  useEffect(() => {
    setIsExpanded(expandedPaths.has(item.path));
  }, [expandedPaths, item.path]);

  // 如果已展开但还没有加载子项，则加载
  useEffect(() => {
    if (isExpanded && item.is_directory && children.length === 0) {
      listDirectory(item.path)
        .then((items) => {
          setChildren(items);
        })
        .catch((error) => {
          console.error('加载目录失败:', error);
        });
    }
  }, [isExpanded, item.path, item.is_directory, children.length]);

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
      // 通知父组件目录切换，加载氛围协议
      onDirectoryChange?.(item.path);
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
    // 设置拖拽图像
    if (e.dataTransfer.setDragImage) {
      const dragImage = document.createElement('div');
      dragImage.textContent = item.name;
      dragImage.style.position = 'absolute';
      dragImage.style.top = '-1000px';
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
      alert('不能将目录移动到其自身或子目录中');
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
    <div>
      <div
        onClick={handleClick}
        onContextMenu={handleContextMenuEvent}
        draggable={true}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
          item.is_directory
            ? 'hover:bg-stone-800/20'
            : 'opacity-50 hover:opacity-100'
        } ${isDragging ? 'opacity-50' : ''} ${isDragOver ? 'bg-stone-800/40' : ''}`}
        style={{ 
          paddingLeft: `${level * 1 + 0.5}rem`,
          ...(isDragOver ? { 
            outline: `2px solid ${getThemeAccentColor(theme)}`,
            outlineOffset: '2px',
          } : {}),
        }}
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
              onContextMenu={onContextMenu}
              expandedPaths={expandedPaths}
              onToggleExpand={onToggleExpand}
              onDrop={onDrop}
              onClearRootDragOver={onClearRootDragOver}
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
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const createMenuRef = useRef<HTMLDivElement>(null);
  
  // 剪贴板状态管理
  const [clipboard, setClipboard] = useState<{ type: 'copy' | 'cut'; item: FileInfo } | null>(null);
  
  // 根目录拖拽状态
  const [isRootDragOver, setIsRootDragOver] = useState(false);
  
  // 使用useRef维护展开状态，避免重新渲染时丢失
  const expandedPathsRef = useRef<Set<string>>(new Set());
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  // 从缓存加载展开状态
  useEffect(() => {
    const savedPaths = loadTreeExpandedState();
    const pathsSet = new Set(savedPaths);
    expandedPathsRef.current = pathsSet;
    setExpandedPaths(pathsSet);
  }, []);

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
        alert('不能将目录移动到其自身或子目录中');
        return;
      }
      
      await moveFileOrDirectory(sourcePath, destPath);
      await refreshFiles();
    } catch (error) {
      console.error('拖拽移动失败:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // 提供更友好的错误信息
      if (errorMessage.includes('目标路径已存在')) {
        alert('目标位置已存在同名文件或目录');
      } else if (errorMessage.includes('不能将目录移动到其自身或子目录')) {
        alert('不能将目录移动到其自身或子目录中');
      } else {
        alert(`移动文件失败: ${errorMessage}`);
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
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  };

  // 处理创建文件
  const handleCreateFile = async () => {
    const fileName = prompt('请输入文件名（不含扩展名）:');
    if (fileName) {
      try {
        await createFile(`${workspacePath}/${fileName}`, '');
        await refreshFiles();
        setShowCreateMenu(false);
      } catch (error) {
        console.error('创建文件失败:', error);
        alert(`创建文件失败: ${error}`);
      }
    }
  };

  // 处理创建文件夹
  const handleCreateDirectory = async () => {
    const dirName = prompt('请输入目录名:');
    if (dirName) {
      try {
        await createDirectory(`${workspacePath}/${dirName}`);
        await refreshFiles();
        setShowCreateMenu(false);
      } catch (error) {
        console.error('创建文件夹失败:', error);
        alert(`创建文件夹失败: ${error}`);
      }
    }
  };

  // 点击外部关闭创建菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (createMenuRef.current && !createMenuRef.current.contains(e.target as Node)) {
        setShowCreateMenu(false);
      }
    };

    if (showCreateMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showCreateMenu]);

  // 处理菜单操作
  const handleMenuAction = async (action: string) => {
    if (!contextMenu?.item && action !== 'paste') return;

    const item = contextMenu?.item;
    try {
      switch (action) {
        case 'createFile': {
          if (!item) break;
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
          if (!item) break;
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
          // 粘贴文件
          if (!clipboard) {
            alert('剪贴板为空');
            break;
          }
          
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
          
          try {
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
            alert(`粘贴失败: ${error}`);
          }
          break;
        }
        case 'rename': {
          if (!item) break;
          const newName = prompt('请输入新名称:', item.name);
          if (newName && newName !== item.name) {
            const newPath = item.path.replace(item.name, newName);
            await renameFileOrDirectory(item.path, newPath);
            await refreshFiles();
          }
          break;
        }
        case 'delete': {
          if (!item) break;
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
          {/* 创建文件/文件夹按钮 */}
          <div className="relative" ref={createMenuRef}>
            <button
              onClick={() => setShowCreateMenu(!showCreateMenu)}
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
            {/* 创建菜单下拉框 */}
            {showCreateMenu && (
              <div
                className="absolute right-0 top-8 min-w-[160px] rounded border shadow-lg z-50"
                style={{
                  backgroundColor: getThemeSurfaceColor(theme),
                  borderColor: getThemeBorderColor(theme),
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={handleCreateFile}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:opacity-80 transition-opacity text-sm rounded-t"
                  style={{
                    color: getThemeAccentColor(theme),
                  }}
                >
                  <FilePlus size={16} />
                  <span>新建文件</span>
                </button>
                <button
                  onClick={handleCreateDirectory}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:opacity-80 transition-opacity text-sm rounded-b border-t"
                  style={{
                    color: getThemeAccentColor(theme),
                    borderColor: getThemeBorderColor(theme),
                  }}
                >
                  <FolderPlus size={16} />
                  <span>新建文件夹</span>
                </button>
              </div>
            )}
          </div>
        </div>
        {loading ? (
          <div className="text-xs opacity-50">加载中...</div>
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
        />
      )}
    </aside>
  );
}

