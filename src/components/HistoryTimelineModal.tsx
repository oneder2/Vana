'use client';

import React, { useEffect, useState } from 'react';
import { GitCommit, Loader2 } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { Modal } from '@/components/Modal';
import { getCommitHistory, type CommitInfo } from '@/lib/api';
import { getThemeAccentColor, getThemeBgColor, getThemeBorderColor, getThemeSurfaceColor } from '@/lib/themeStyles';

interface HistoryTimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspacePath: string;
}

export function HistoryTimelineModal({
  isOpen,
  onClose,
  workspacePath,
}: HistoryTimelineModalProps) {
  const { theme } = useTheme();
  const [history, setHistory] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !workspacePath) return;

    setLoading(true);
    setError(null);
    getCommitHistory(workspacePath, 30)
      .then((items) => setHistory(items))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [isOpen, workspacePath]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center p-2 md:p-4 bg-black/50">
      <div
        className="w-full max-w-3xl max-h-[calc(100dvh-1rem)] md:max-h-[80vh] rounded border shadow-xl overflow-hidden"
        style={{
          backgroundColor: getThemeSurfaceColor(theme),
          borderColor: getThemeBorderColor(theme),
        }}
      >
        <div
          className="px-4 py-3 md:px-6 md:py-4 border-b flex items-center justify-between gap-3"
          style={{ borderColor: getThemeBorderColor(theme) }}
        >
          <div className="flex items-center gap-3">
            <GitCommit size={18} style={{ color: getThemeAccentColor(theme) }} />
            <h2 style={{ color: getThemeAccentColor(theme) }}>文档历史时间线</h2>
          </div>
          <button
            onClick={onClose}
            className="text-sm opacity-70 hover:opacity-100"
            style={{ color: getThemeAccentColor(theme) }}
          >
            关闭
          </button>
        </div>

        <div className="p-4 md:p-6 overflow-y-auto max-h-[calc(100dvh-5rem)] md:max-h-[calc(80vh-72px)]">
          {loading && (
            <div className="flex items-center gap-2 text-sm opacity-70">
              <Loader2 size={16} className="animate-spin" />
              <span>正在加载提交历史...</span>
            </div>
          )}

          {!loading && error && (
            <div className="text-sm text-red-500">无法读取提交历史: {error}</div>
          )}

          {!loading && !error && history.length === 0 && (
            <div className="text-sm opacity-60">当前工作区还没有提交记录。</div>
          )}

          {!loading && !error && history.length > 0 && (
            <div className="space-y-4">
              {history.map((item) => (
                <div
                  key={item.sha}
                  className="rounded border p-4"
                  style={{
                    borderColor: getThemeBorderColor(theme),
                    backgroundColor: getThemeBgColor(theme),
                  }}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
                    <div className="min-w-0">
                      <div
                        className="font-medium truncate"
                        style={{ color: getThemeAccentColor(theme) }}
                      >
                        {item.message}
                      </div>
                      <div className="text-xs opacity-60 mt-1">
                        {item.author}
                      </div>
                    </div>
                    <div className="text-right text-xs opacity-60 shrink-0">
                      <div>{item.time}</div>
                      <div className="font-mono mt-1">{item.sha.slice(0, 7)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
