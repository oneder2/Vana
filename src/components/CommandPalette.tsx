'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Command, Search } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { getThemeAccentColor, getThemeBgColor, getThemeBorderColor, getThemeSurfaceColor } from '@/lib/themeStyles';

export interface CommandPaletteItem {
  id: string;
  title: string;
  subtitle?: string;
  group: string;
  keywords?: string[];
  onSelect: () => void | Promise<void>;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  items: CommandPaletteItem[];
}

export function CommandPalette({ isOpen, onClose, items }: CommandPaletteProps) {
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) => {
      const haystack = [
        item.title,
        item.subtitle || '',
        item.group,
        ...(item.keywords || []),
      ].join(' ').toLowerCase();
      return haystack.includes(normalized);
    });
  }, [items, query]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = async (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredItems.length - 1));
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const current = filteredItems[selectedIndex];
        if (current) {
          await current.onSelect();
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [filteredItems, isOpen, onClose, selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10001] bg-black/50 flex items-start justify-center p-2 pt-4 md:p-4 md:pt-[12vh]">
      <div
        className="w-full max-w-2xl rounded border shadow-xl overflow-hidden max-h-[calc(100dvh-1rem)] md:max-h-[72vh]"
        style={{
          backgroundColor: getThemeSurfaceColor(theme),
          borderColor: getThemeBorderColor(theme),
        }}
      >
        <div
          className="flex items-center gap-3 px-4 py-3 border-b"
          style={{ borderColor: getThemeBorderColor(theme) }}
        >
          <Command size={18} style={{ color: getThemeAccentColor(theme) }} />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="输入命令或搜索文档..."
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: getThemeAccentColor(theme) }}
          />
          <button
            onClick={onClose}
            className="text-xs opacity-70 hover:opacity-100"
            style={{ color: getThemeAccentColor(theme) }}
          >
            关闭
          </button>
        </div>

        <div className="max-h-[calc(100dvh-5rem)] overflow-y-auto md:max-h-[60vh]">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-8 text-sm opacity-60">没有匹配的命令。</div>
          ) : (
            filteredItems.map((item, index) => (
              <button
                key={item.id}
                onClick={async () => {
                  await item.onSelect();
                  onClose();
                }}
                className="w-full px-4 py-3 text-left border-b transition-colors"
                style={{
                  borderColor: getThemeBorderColor(theme),
                  backgroundColor: index === selectedIndex ? getThemeBgColor(theme) : 'transparent',
                  color: getThemeAccentColor(theme),
                }}
              >
                <div className="text-xs uppercase opacity-50">{item.group}</div>
                <div className="text-sm mt-1">{item.title}</div>
                {item.subtitle && (
                  <div className="text-xs opacity-60 mt-1">{item.subtitle}</div>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
