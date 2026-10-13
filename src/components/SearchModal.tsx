/**
 * Vana - 文档搜索组件
 * 搜索当前账号空间中的有效文档内容
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from './ThemeProvider';
import { getThemeBgColor, getThemeSurfaceColor, getThemeBorderColor, getThemeAccentColor, getThemeAccentBgColor } from '@/lib/themeStyles';
import { Search, X, FileText, Loader } from 'lucide-react';
import { searchFiles, type SearchResult } from '@/lib/api';
import { splitLiteralMatches } from '@/lib/searchHighlight';
import { useToast } from './ToastProvider';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspacePath: string;
  onFileSelect?: (filePath: string) => void;
}

/**
 * 搜索模态框组件
 */
export function SearchModal({ isOpen, onClose, workspacePath, onFileSelect }: SearchModalProps) {
  const { theme } = useTheme();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchIntent = useRef(0);
  const [selectedIndex, setSelectedIndex] = useState(-1); // 当前选中的结果索引
  const inputRef = React.useRef<HTMLInputElement>(null);
  const resultsRef = React.useRef<HTMLDivElement>(null);

  // 重置选中索引
  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(-1);
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    const intent = ++searchIntent.current;
    if (!isOpen || !query.trim()) { setResults([]); setSelectedIndex(-1); setIsSearching(false); return; }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const hits = await searchFiles(workspacePath, query.trim());
        if (searchIntent.current === intent) { setResults(hits); setSelectedIndex(-1); }
      } catch (error) {
        if (searchIntent.current === intent) { toast.error(`搜索失败: ${String(error)}`); setResults([]); }
      } finally { if (searchIntent.current === intent) setIsSearching(false); }
    }, 300);
    return () => { clearTimeout(timer); ++searchIntent.current; };
  }, [query, isOpen, workspacePath, toast]);

  // 阻止背景滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleFileSelect = (result: SearchResult) => {
    onFileSelect?.(result.document_id);
    onClose();
  };

  // 键盘导航处理
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const maxIndex = results.length - 1;
        setSelectedIndex((prev) => (prev < maxIndex ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
      } else if (e.key === 'Enter' && selectedIndex >= 0 && selectedIndex < results.length) {
        e.preventDefault();
        handleFileSelect(results[selectedIndex]);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, results, selectedIndex, onClose]);

  // 滚动到选中的结果
  useEffect(() => {
    if (selectedIndex >= 0 && resultsRef.current) {
      const selectedElement = resultsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  // 高亮匹配文本
  const highlightMatch = (text: string, query: string): React.ReactNode => {
    const parts = splitLiteralMatches(text, query);
    return (
      <>
        {parts.map((part, index) => 
          part.toLowerCase() === query.toLowerCase() ? (
            <mark
              key={index}
              style={{
                backgroundColor: getThemeAccentColor(theme),
                color: theme.id === 'vellum' ? '#FFFFFF' : undefined,
                padding: '0 2px',
              }}
            >
              {part}
            </mark>
          ) : (
            <span key={index}>{part}</span>
          )
        )}
      </>
    );
  };

  if (!isOpen) {
    return null;
  }

  const totalMatches = results.reduce((sum, result) => sum + result.matches.length, 0);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-2 md:p-4"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="search-modal-title"
    >
      <div
        className="w-full max-w-2xl max-h-[calc(100dvh-1rem)] md:max-h-[80vh] flex flex-col rounded-lg border shadow-lg"
        style={{
          backgroundColor: getThemeBgColor(theme),
          borderColor: getThemeBorderColor(theme),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div
          className="flex items-center gap-3 px-3 py-3 md:px-4 border-b"
          style={{
            borderColor: getThemeBorderColor(theme),
          }}
        >
          <Search size={20} style={{ color: getThemeAccentColor(theme) }} aria-hidden="true" />
          <h2 id="search-modal-title" className="sr-only">搜索文档</h2>
          <input
            ref={inputRef}
            type="text"
            placeholder="搜索文档内容..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent rounded"
            style={{
              color: theme.id === 'vellum' ? 'rgb(41, 37, 36)' : 'rgb(231, 229, 228)',
            }}
            autoFocus
            aria-label="搜索文档内容"
          />
          {isSearching && <Loader size={16} className="animate-spin" style={{ color: getThemeAccentColor(theme) }} />}
          <button
            onClick={onClose}
            className="p-1 hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent rounded"
            style={{ color: getThemeAccentColor(theme) }}
            aria-label="关闭搜索"
          >
            <X size={20} />
          </button>
        </div>

        {/* 结果列表 */}
        <div ref={resultsRef} className="flex-1 overflow-y-auto" role="listbox" aria-label="搜索结果">
          {query.trim() && !isSearching && results.length === 0 && (
            <div className="p-8 text-center opacity-60" role="status">
              <p>未找到匹配结果</p>
            </div>
          )}

          {query.trim() && totalMatches > 0 && (
            <div className="p-2 text-xs opacity-60 border-b" style={{ borderColor: getThemeBorderColor(theme) }} role="status">
              找到 {totalMatches} 个匹配项，分布在 {results.length} 个文件中
            </div>
          )}

          {results.map((result, resultIndex) => (
            <div
              key={resultIndex}
              role="option"
              aria-selected={selectedIndex === resultIndex}
              className={`border-b cursor-pointer transition-all ${
                selectedIndex === resultIndex
                  ? 'opacity-100'
                  : 'hover:opacity-80'
              }`}
              style={{
                borderColor: getThemeBorderColor(theme),
                backgroundColor: selectedIndex === resultIndex 
                  ? getThemeAccentBgColor(theme) 
                  : getThemeSurfaceColor(theme),
                outline: selectedIndex === resultIndex 
                  ? `2px solid ${getThemeAccentColor(theme)}` 
                  : 'none',
                outlineOffset: selectedIndex === resultIndex ? '2px' : '0',
              }}
                      onClick={() => handleFileSelect(result)}
              onMouseEnter={() => setSelectedIndex(resultIndex)}
            >
              {/* 文件路径 */}
              <div
                className="px-4 py-2 flex items-center gap-2"
                style={{
                  backgroundColor: getThemeSurfaceColor(theme),
                }}
              >
                <FileText size={16} style={{ color: getThemeAccentColor(theme) }} />
                <span
                  className="text-sm font-medium flex-1"
                  style={{ color: getThemeAccentColor(theme) }}
                >
                  {result.title}
                </span>
                <span className="text-xs opacity-60">
                  {result.matches.length} 个匹配
                </span>
              </div>

              {/* 匹配项列表 */}
              <div className="px-4 pb-2">
                {result.matches.slice(0, 3).map((match, matchIndex) => (
                  <div
                    key={matchIndex}
                    className="text-xs py-1 font-mono opacity-80"
                    style={{
                      color: theme.id === 'vellum' ? 'rgb(41, 37, 36)' : 'rgb(231, 229, 228)',
                    }}
                  >
                    <span className="opacity-60">第 {match.line} 行: </span>
                    {highlightMatch(match.context.split('\n')[0] || '', query)}
                  </div>
                ))}
                {result.matches.length > 3 && (
                  <div className="text-xs opacity-60 py-1">
                    ...还有 {result.matches.length - 3} 个匹配项
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 底部提示 */}
        <div
          className="px-3 py-2 text-[11px] md:text-xs opacity-60 border-t text-center"
          style={{
            borderColor: getThemeBorderColor(theme),
          }}
          role="status"
        >
          按 ESC 关闭 | ↑↓ 选择 | Enter 打开 | 点击结果打开文件
        </div>
      </div>
    </div>
  );
}
