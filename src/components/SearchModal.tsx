/**
 * No Visitors - 文档搜索组件
 * 提供全文搜索功能，支持在加密文档中搜索关键词
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from './ThemeProvider';
import { getThemeBgColor, getThemeSurfaceColor, getThemeBorderColor, getThemeAccentColor } from '@/lib/themeStyles';
import { Search, X, FileText, Loader } from 'lucide-react';
import { searchFiles, type SearchResult } from '@/lib/api';
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
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  // 防抖搜索
  useEffect(() => {
    if (!isOpen || !query.trim()) {
      setResults([]);
      return;
    }

    // 清除之前的定时器
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // 设置新的定时器
    const timer = setTimeout(() => {
      performSearch(query.trim());
    }, 300); // 300ms 防抖

    setDebounceTimer(timer);

    // 清理函数
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, [query, isOpen]);

  // 执行搜索
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!workspacePath || !searchQuery) {
      return;
    }

    setIsSearching(true);
    try {
      const searchResults = await searchFiles(workspacePath, searchQuery);
      setResults(searchResults);
    } catch (error) {
      console.error('搜索失败:', error);
      toast.error(`搜索失败: ${error instanceof Error ? error.message : String(error)}`);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [workspacePath, toast]);

  // 处理文件选择
  const handleFileSelect = (filePath: string) => {
    // 移除 .enc 扩展名（如果存在）
    const cleanPath = filePath.endsWith('.enc') ? filePath.slice(0, -4) : filePath;
    onFileSelect?.(cleanPath);
    onClose();
  };

  // 高亮匹配文本
  const highlightMatch = (text: string, query: string): React.ReactNode => {
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
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
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
      }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-lg border shadow-lg"
        style={{
          backgroundColor: getThemeBgColor(theme),
          borderColor: getThemeBorderColor(theme),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b"
          style={{
            borderColor: getThemeBorderColor(theme),
          }}
        >
          <Search size={20} style={{ color: getThemeAccentColor(theme) }} />
          <input
            type="text"
            placeholder="搜索文档内容..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none"
            style={{
              color: theme.id === 'vellum' ? 'rgb(41, 37, 36)' : 'rgb(231, 229, 228)',
            }}
            autoFocus
          />
          {isSearching && <Loader size={16} className="animate-spin" style={{ color: getThemeAccentColor(theme) }} />}
          <button
            onClick={onClose}
            className="p-1 hover:opacity-80 transition-opacity"
            style={{ color: getThemeAccentColor(theme) }}
          >
            <X size={20} />
          </button>
        </div>

        {/* 结果列表 */}
        <div className="flex-1 overflow-y-auto">
          {query.trim() && !isSearching && results.length === 0 && (
            <div className="p-8 text-center opacity-60">
              <p>未找到匹配结果</p>
            </div>
          )}

          {query.trim() && totalMatches > 0 && (
            <div className="p-2 text-xs opacity-60 border-b" style={{ borderColor: getThemeBorderColor(theme) }}>
              找到 {totalMatches} 个匹配项，分布在 {results.length} 个文件中
            </div>
          )}

          {results.map((result, resultIndex) => (
            <div
              key={resultIndex}
              className="border-b cursor-pointer hover:opacity-80 transition-opacity"
              style={{
                borderColor: getThemeBorderColor(theme),
                backgroundColor: getThemeSurfaceColor(theme),
              }}
              onClick={() => handleFileSelect(result.file_path)}
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
                  {result.file_path.replace(/\.enc$/, '')}
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
          className="px-4 py-2 text-xs opacity-60 border-t text-center"
          style={{
            borderColor: getThemeBorderColor(theme),
          }}
        >
          按 ESC 关闭 | 点击结果打开文件
        </div>
      </div>
    </div>
  );
}

