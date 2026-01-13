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
import { TextSelection } from 'prosemirror-state';
import { useTheme } from '@/components/ThemeProvider';
import { Sidebar } from '@/components/Sidebar';
import { Editor } from '@/components/Editor';
import { RadialMenu } from '@/components/RadialMenu';
import { BlockTypeSelector } from '@/components/BlockTypeSelector';
import { getAllThemes, getThemeIcon } from '@/lib/themes';
import { getThemeBgColor, getThemeSurfaceColor, getThemeBorderColor, getThemeAccentColor, getThemeAccentBgColor } from '@/lib/themeStyles';
import { readFile, getWorkspacePath, ensureWorkspaceInitialized } from '@/lib/api';
import { loadAtmosphereConfig } from '@/lib/atmosphere';
import { Plus, AlignCenter, AlignLeft, AlignRight, Settings } from 'lucide-react';
import Link from 'next/link';
import type { Editor as TiptapEditor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import type { EditorLayout } from '@/components/Editor';

/**
 * 计算 JSONContent 中的字数
 */
function countWords(content: JSONContent): number {
  if (!content.content) return 0;
  
  let count = 0;
  const traverse = (node: JSONContent) => {
    if (node.type === 'text' && node.text) {
      count += node.text.length;
    }
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(traverse);
    }
  };
  
  traverse(content);
  return count;
}

// 主应用组件（需要在 ThemeProvider 内部）
function MainApp() {
  const { theme, setTheme } = useTheme();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showRadial, setShowRadial] = useState(false);
  const [radialPos, setRadialPos] = useState({ x: 0, y: 0 });
  const [isPrivate, setIsPrivate] = useState(true);
  const [currentFilePath, setCurrentFilePath] = useState<string | undefined>();
  const [editorContent, setEditorContent] = useState<JSONContent>({ type: 'doc', content: [] });
  const [workspacePath, setWorkspacePath] = useState<string>('');
  const [showBlockSelector, setShowBlockSelector] = useState(false);
  const [editorInstance, setEditorInstance] = useState<TiptapEditor | null>(null);
  const [editorLayout, setEditorLayout] = useState<EditorLayout>('center');

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
      
      // 尝试解析为 JSON（Tiptap 格式）
      let parsedContent: JSONContent;
      try {
        parsedContent = JSON.parse(content);
        // 验证是否为有效的 Tiptap JSON 格式
        if (!parsedContent.type || parsedContent.type !== 'doc') {
          throw new Error('Invalid Tiptap JSON format');
        }
      } catch (jsonError) {
        // 如果不是 JSON，尝试作为旧格式文本解析（向后兼容）
        console.warn('文件不是 JSON 格式，尝试解析为旧格式文本:', jsonError);
        const lines = content.split('\n\n').filter((line) => line.trim());
        const contentArray: JSONContent[] = lines.map((line) => {
          if (line.startsWith('# ')) {
            return {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: line.substring(2).trim() }],
            };
          } else if (line.startsWith('> ')) {
            return {
              type: 'blockquote',
              content: [{
                type: 'paragraph',
                content: [{ type: 'text', text: line.substring(2).trim() }],
              }],
            };
          } else {
            return {
              type: 'paragraph',
              content: [{ type: 'text', text: line.trim() }],
            };
          }
        });
        
        parsedContent = {
          type: 'doc',
          content: contentArray.length > 0 ? contentArray : [{ type: 'paragraph', content: [] }],
        };
      }

      setEditorContent(parsedContent);
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
          {/* 移动端：块插入按钮 */}
          <button
            onClick={() => setShowBlockSelector(true)}
            className="md:hidden"
            style={{ color: getThemeAccentColor(theme) }}
            title="插入新块"
          >
            <Plus size={20} />
          </button>
          
          {/* 文本对齐按钮组 - 每个块独立对齐 */}
          <div className="hidden md:flex items-center gap-1 border rounded"
            style={{
              borderColor: getThemeBorderColor(theme),
              backgroundColor: getThemeSurfaceColor(theme),
            }}
          >
            <button
              onClick={() => {
                if (editorInstance) {
                  editorInstance.chain().focus().setTextAlign('left').run();
                }
              }}
              className={`p-1.5 transition-opacity ${
                editorInstance?.isActive({ textAlign: 'left' }) ? 'opacity-100' : 'opacity-50 hover:opacity-75'
              }`}
              style={{ 
                color: editorInstance?.isActive({ textAlign: 'left' }) ? getThemeAccentColor(theme) : undefined,
              }}
              title="居左对齐"
            >
              <AlignLeft size={16} />
            </button>
            <button
              onClick={() => {
                if (editorInstance) {
                  editorInstance.chain().focus().setTextAlign('center').run();
                }
              }}
              className={`p-1.5 transition-opacity ${
                editorInstance?.isActive({ textAlign: 'center' }) ? 'opacity-100' : 'opacity-50 hover:opacity-75'
              }`}
              style={{ 
                color: editorInstance?.isActive({ textAlign: 'center' }) ? getThemeAccentColor(theme) : undefined,
              }}
              title="居中对齐"
            >
              <AlignCenter size={16} />
            </button>
            <button
              onClick={() => {
                if (editorInstance) {
                  editorInstance.chain().focus().setTextAlign('right').run();
                }
              }}
              className={`p-1.5 transition-opacity ${
                editorInstance?.isActive({ textAlign: 'right' }) ? 'opacity-100' : 'opacity-50 hover:opacity-75'
              }`}
              style={{ 
                color: editorInstance?.isActive({ textAlign: 'right' }) ? getThemeAccentColor(theme) : undefined,
              }}
              title="居右对齐"
            >
              <AlignRight size={16} />
            </button>
          </div>
          
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
          <Link
            href="/settings"
            style={{ color: getThemeAccentColor(theme) }}
            className="hover:opacity-80 transition-opacity"
            title="设置"
          >
            <Settings size={18} />
          </Link>
          <button
            onClick={() => setIsPrivate(!isPrivate)}
            style={{ color: getThemeAccentColor(theme) }}
          >
            {isPrivate ? <Shield size={18} /> : <Layers size={18} />}
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* 左侧资源管理器 - 固定位置，不受滚动影响 */}
        <Sidebar
          workspacePath={workspacePath}
          onFileSelect={handleFileSelect}
          onDirectoryChange={handleDirectoryChange}
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        />

        {/* 主编辑区 - 可以滚动 */}
        <div
          className="flex-1 relative overflow-y-auto"
          onClick={(e) => {
            // 只在点击编辑器外部区域时关闭菜单，避免阻止编辑器事件
            if (e.target === e.currentTarget) {
              setShowRadial(false);
            }
            
            // 如果点击在主编辑区，但没有点击在编辑器内容上，触发 Editor 的容器点击处理
            const target = e.target as HTMLElement;
            const editorMain = target.closest('main');
            const editorContent = target.closest('.ProseMirror');
            
            // 如果点击在主编辑区容器内，但不在编辑器内容上，且编辑器实例存在
            if (!editorContent && editorInstance && editorInstance.view) {
              // 检查是否点击在 Editor 的 main 标签内
              if (editorMain) {
                // 点击在 Editor 的 main 内，但不在编辑器内容上，触发容器点击
                const { clientX, clientY } = e;
                const { view } = editorInstance;
                
                // 使用 view.posAtCoords 尝试找到点击位置
                const pos = view.posAtCoords({ left: clientX, top: clientY });
                if (pos && pos.pos !== null) {
                  const { state } = view;
                  const { doc } = state;
                  const validPos = Math.max(1, Math.min(pos.pos, doc.content.size));
                  const tr = state.tr;
                  const selection = TextSelection.create(doc, validPos);
                  tr.setSelection(selection);
                  view.dispatch(tr);
                  
                  setTimeout(() => {
                    const dom = view.dom;
                    if (dom) {
                      (dom as HTMLElement).focus();
                    }
                  }, 0);
                  return;
                }
                
                // 如果 posAtCoords 找不到位置，使用距离计算找到最近的块
                const { state } = view;
                const { doc } = state;
                
                if (doc.content.size > 0) {
                  let nearestBlock: { index: number; distance: number; pos: number } | null = null;
                  
                  for (let i = 0; i < doc.childCount; i++) {
                    const child = doc.child(i);
                    if (!child.isBlock) continue;
                    
                    try {
                      let currentPos = 1;
                      for (let j = 0; j < i; j++) {
                        currentPos += doc.child(j).nodeSize;
                      }
                      
                      const coords = view.coordsAtPos(currentPos);
                      if (!coords) continue;
                      
                      const rowDiff = Math.abs(coords.top - clientY);
                      const colDiff = Math.abs(coords.left - clientX);
                      const distance = rowDiff * 1000 + colDiff;
                      
                      if (!nearestBlock || distance < nearestBlock.distance) {
                        let bestPos = currentPos;
                        if (child.content.size > 0) {
                          bestPos = currentPos + 1;
                        }
                        
                        nearestBlock = {
                          index: i,
                          distance,
                          pos: bestPos,
                        };
                      }
                    } catch (error) {
                      continue;
                    }
                  }
                  
                  if (nearestBlock) {
                    const { state } = view;
                    const { doc } = state;
                    const tr = state.tr;
                    const selection = TextSelection.create(doc, Math.max(1, Math.min(nearestBlock.pos, doc.content.size)));
                    tr.setSelection(selection);
                    view.dispatch(tr);
                    
                    setTimeout(() => {
                      const dom = view.dom;
                      if (dom) {
                        (dom as HTMLElement).focus();
                      }
                    }, 0);
                  }
                }
              }
            }
          }}
        >
          <div className={isPrivate ? '' : 'blur-xl select-none opacity-20'}>
            <Editor
              filePath={currentFilePath}
              initialContent={editorContent}
              onContentChange={setEditorContent}
              workspacePath={workspacePath}
              onEditorReady={setEditorInstance}
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
          <span>WORDS: {countWords(editorContent)}</span>
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

      {/* 移动端：块类型选择器（底部上拉框） */}
      {showBlockSelector && (
        <BlockTypeSelector
          editor={editorInstance}
          onClose={() => setShowBlockSelector(false)}
          mode="mobile"
        />
      )}
    </div>
  );
}

// 导出主页面组件
export default function HomePage() {
  return <MainApp />;
}

