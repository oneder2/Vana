/**
 * No Visitors - 主页面
 * 集成所有组件的主应用界面
 * 包含顶部导航、侧边栏、编辑器和底部状态栏
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
  Menu,
  ChevronRight,
  Shield,
  Layers,
  Database,
  X,
} from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { Sidebar } from '@/components/Sidebar';
import { Editor } from '@/components/Editor';
import { RadialMenu } from '@/components/RadialMenu';
import { getAllThemes, getThemeIcon } from '@/lib/themes';
import { getThemeBgColor, getThemeSurfaceColor, getThemeBorderColor, getThemeAccentColor, getThemeAccentBgColor } from '@/lib/themeStyles';
import { BlockData } from '@/components/BlockRenderer';
import { readFile, getWorkspacePath, ensureWorkspaceInitialized } from '@/lib/api';
import { loadAtmosphereConfig } from '@/lib/atmosphere';

// 主应用组件（需要在 ThemeProvider 内部）
function MainApp() {
  const { theme, setTheme } = useTheme();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showRadial, setShowRadial] = useState(false);
  const [radialPos, setRadialPos] = useState({ x: 0, y: 0 });
  const [isPrivate, setIsPrivate] = useState(true);
  const [currentFilePath, setCurrentFilePath] = useState<string | undefined>();
  const [blocks, setBlocks] = useState<BlockData[]>([]);
  const [workspacePath, setWorkspacePath] = useState<string>('');

  // 初始化工作区
  useEffect(() => {
    const initWorkspace = async () => {
      try {
        // 获取工作区路径
        const path = await getWorkspacePath();
        setWorkspacePath(path);
        
        // 确保工作区已初始化
        await ensureWorkspaceInitialized();
      } catch (error) {
        console.error('初始化工作区失败:', error);
      }
    };
    
    initWorkspace();
  }, []);

  // 加载文件
  const handleFileSelect = async (path: string) => {
    try {
      // 关闭旧文件时触发 Tier 2 提交（如果有旧文件）
      if (currentFilePath && currentFilePath !== path) {
        // Tier 2 提交会在 Editor 组件中处理
      }

      const content = await readFile(path);
      // 简单的文本解析（可以改进）
      const parsedBlocks: BlockData[] = content
        .split('\n\n')
        .filter((line) => line.trim())
        .map((line, index) => {
          let type: BlockData['type'] = 'p';
          let content = line.trim();

          if (line.startsWith('# ')) {
            type = 'h1';
            content = line.substring(2);
          } else if (line.startsWith('> ')) {
            type = 'quote';
            content = line.substring(2);
          }

          return {
            id: `${index}-${Date.now()}`,
            type,
            content,
          };
        });

      setBlocks(parsedBlocks);
      setCurrentFilePath(path);
    } catch (error) {
      console.error('加载文件失败:', error);
    }
  };

  // 处理块点击（显示环形菜单）
  const handleBlockClick = (e: React.MouseEvent) => {
    setRadialPos({ x: e.clientX, y: e.clientY });
    setShowRadial(true);
  };

  // 处理目录切换，加载氛围协议
  const handleDirectoryChange = async (path: string) => {
    try {
      const theme = await loadAtmosphereConfig(path);
      setTheme(theme.id);
    } catch (error) {
      console.error('加载氛围协议失败:', error);
    }
  };

  return (
    <div
      className={`fixed inset-0 flex flex-col transition-colors duration-700 ${theme.font} ${
        theme.id === 'vellum' ? 'text-stone-800' : 'text-stone-300'
      }`}
      style={{
        backgroundColor: getThemeBgColor(theme),
      }}
    >
      {/* 顶部导航栏 (The Deck) */}
      <header
        className={`h-14 flex items-center justify-between px-4 z-50 border-b transition-transform duration-300`}
        style={{
          backgroundColor: getThemeSurfaceColor(theme),
          borderColor: getThemeBorderColor(theme),
        }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="hidden md:block"
          >
            <Menu size={20} style={{ color: getThemeAccentColor(theme) }} />
          </button>
          <div
            className={`flex items-center gap-1 text-[10px] ${theme.uiFont} uppercase tracking-tighter opacity-60`}
          >
            <span>STYX-Ω</span>
            <ChevronRight size={10} />
            <span className={theme.accent}>Unit_01</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span
              className={`text-[9px] ${theme.uiFont} opacity-40 hidden sm:block`}
            >
              SYNC_STABLE
            </span>
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                theme.accent === 'text-stone-800' ? 'bg-green-600' : 'bg-emerald-500'
              } ${theme.glow}`}
            ></div>
          </div>
          <button
            onClick={() => setIsPrivate(!isPrivate)}
            style={{ color: getThemeAccentColor(theme) }}
          >
            {isPrivate ? <Shield size={18} /> : <Layers size={18} />}
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* 左侧资源管理器 */}
        <Sidebar
          workspacePath={workspacePath}
          onFileSelect={handleFileSelect}
          onDirectoryChange={handleDirectoryChange}
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        />

        {/* 主编辑区 */}
        <div
          className="flex-1 relative"
          onClick={() => setShowRadial(false)}
        >
          <div className={isPrivate ? '' : 'blur-xl select-none opacity-20'}>
            <Editor
              filePath={currentFilePath}
              initialBlocks={blocks}
              onContentChange={setBlocks}
              workspacePath={workspacePath}
            />
          </div>
        </div>
      </div>

      {/* 环形菜单 */}
      {showRadial && (
        <RadialMenu
          x={radialPos.x}
          y={radialPos.y}
          onClose={() => setShowRadial(false)}
          onAction={(action) => {
            console.log('执行操作:', action);
            // TODO: 实现操作逻辑
          }}
        />
      )}

      {/* 底部信息栏 */}
      <footer
        className={`h-8 flex items-center justify-between px-4 text-[9px] ${theme.uiFont} opacity-30 border-t`}
        style={{
          backgroundColor: getThemeSurfaceColor(theme),
          borderColor: getThemeBorderColor(theme),
        }}
      >
        <div>PROJECT: NO VISITORS // ARCHIVE_STYX_OMEGA</div>
        <div className="flex gap-4">
          <span>WORDS: {blocks.reduce((sum, b) => sum + b.content.length, 0)}</span>
          <span>PLANAR: STABLE</span>
        </div>
      </footer>

      {/* 移动端浮动操作按钮 */}
      <div className="md:hidden fixed bottom-6 right-6 z-[60]">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-14 h-14 rounded-full border flex items-center justify-center"
            style={{
              backgroundColor: getThemeSurfaceColor(theme),
              borderColor: getThemeBorderColor(theme),
              color: getThemeAccentColor(theme),
              boxShadow: theme.glow !== 'shadow-none' ? theme.glow.replace('shadow-', '') : undefined,
            }}
          >
            {isSidebarOpen ? <X size={24} /> : <Database size={24} />}
          </button>
      </div>

      {/* 氛围协议选择器（在侧边栏底部，这里简化显示） */}
      <div 
        className={`fixed bottom-20 left-4 z-50 border rounded p-2`}
        style={{
          backgroundColor: getThemeSurfaceColor(theme),
          borderColor: getThemeBorderColor(theme),
        }}
      >
        <div className={`text-[9px] ${theme.uiFont} mb-3 opacity-30 uppercase`}>
          氛围协议
        </div>
        <div className="flex justify-between gap-2">
          {getAllThemes().map((t) => {
            const isActive = theme.id === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className="p-2 rounded transition-all"
                style={{
                  backgroundColor: isActive ? getThemeAccentBgColor(theme) : 'transparent',
                  color: isActive ? getThemeAccentColor(theme) : '#78716c',
                }}
              >
                {getThemeIcon(t)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// 导出主页面组件
export default function HomePage() {
  return <MainApp />;
}

