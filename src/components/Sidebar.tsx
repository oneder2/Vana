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
  };

  const handleDragOver = (e: React.DragEvent) => {
    // 只允许拖拽到目录
    if (item.is_directory) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (!item.is_directory) return;
    
    const sourcePath = e.dataTransfer.getData('text/plain');
    if (!sourcePath || sourcePath === item.path) return;
    
    // 防止拖拽到自己的子目录
    if (sourcePath.startsWith(item.path + '/')) {
      alert('不能将目录移动到其自身或子目录中');
      return;
    }
    
    const destPath = `${item.path}/${sourcePath.split('/').pop()}`;
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
      await moveFileOrDirectory(sourcePath, destPath);
      await refreshFiles();
    } catch (error) {
      console.error('拖拽移动失败:', error);
      alert(`移动文件失败: ${error}`);
    }
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
      <div className="p-4 flex-1 overflow-y-auto">
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

