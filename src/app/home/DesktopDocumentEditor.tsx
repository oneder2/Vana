'use client';

import React from 'react';
import type { JSONContent } from '@tiptap/core';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { Plus, Tag, X } from 'lucide-react';
import { Editor } from '@/components/Editor';
import type { AppState, DocumentRecord } from '@/lib/api';

export function DesktopDocumentEditor({
  currentDocument,
  currentSegments,
  content,
  documentTags,
  tagDraft,
  isSyncing,
  appState,
  surface,
  border,
  accent,
  accentBg,
  onTagDraftChange,
  onAddTag,
  onRemoveTag,
  onEditorReady,
  onContentChange,
  onPersistError,
  onPersisted,
  formatTimestamp,
  formatBytes,
}: {
  currentDocument: DocumentRecord | null;
  currentSegments: string[];
  content: JSONContent;
  documentTags: string[];
  tagDraft: string;
  isSyncing: boolean;
  appState: AppState | null;
  surface: string;
  border: string;
  accent: string;
  accentBg: string;
  onTagDraftChange: (value: string) => void;
  onAddTag: (value: string) => void;
  onRemoveTag: (tag: string) => void;
  onEditorReady: (editor: TiptapEditor | null) => void;
  onContentChange: (content: JSONContent) => void;
  onPersistError: (message: string) => void;
  onPersisted: () => void;
  formatTimestamp: (value?: string | null) => string;
  formatBytes: (value: number) => string;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shell-panel border-b px-4 py-3 sm:px-5" style={{ backgroundColor: surface, borderColor: border }}>
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs opacity-70">
          <span className="shell-label">Document</span>
          <span className="opacity-35">/</span>
          {currentSegments.length > 0 ? (
            currentSegments.map((segment, index) => (
              <React.Fragment key={`${segment}-${index}`}>
                <span className={index === currentSegments.length - 1 ? 'opacity-100' : 'opacity-65'}>{segment}</span>
                {index < currentSegments.length - 1 && <span className="opacity-35">/</span>}
              </React.Fragment>
            ))
          ) : (
            <span>Untitled</span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] opacity-72">
          <span>最近更新 {formatTimestamp(currentDocument?.updated_at)}</span>
          <span>{isSyncing ? '同步中' : `待同步 ${appState?.sync.pending_jobs ?? 0}`}</span>
          <span>同步 {appState?.sync.mode ?? 'local-only'}</span>
          {appState && (
            <span>
              存储 {formatBytes(appState.limits.current_total_storage_bytes)} / {formatBytes(appState.limits.max_total_storage_bytes)}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex min-w-[280px] flex-1 items-center gap-2 border px-3 py-2" style={{ borderColor: border }}>
            <Tag size={14} className="mt-0.5 shrink-0 opacity-60" />
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {documentTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs"
                  style={{ borderColor: border, backgroundColor: `${accentBg}40`, color: accent }}
                >
                  <span>{tag}</span>
                  <button
                    type="button"
                    className="opacity-70 transition-opacity hover:opacity-100"
                    onClick={() => onRemoveTag(tag)}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              <div className="flex min-w-[140px] flex-1 items-center gap-2">
                <input
                  value={tagDraft}
                  onChange={(event) => onTagDraftChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      onAddTag(tagDraft);
                    }
                  }}
                  placeholder="输入标签后回车"
                  className="w-full min-w-0 bg-transparent text-sm outline-none"
                />
                <button
                  type="button"
                  className="opacity-70 transition-opacity hover:opacity-100"
                  onClick={() => onAddTag(tagDraft)}
                  disabled={!tagDraft.trim()}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-0 md:p-3">
        {currentDocument && (
          <Editor
            key={currentDocument.id}
            filePath={currentDocument.id}
            initialContent={content}
            tags={documentTags}
            mobile={false}
            onEditorReady={onEditorReady}
            onContentChange={onContentChange}
            onPersistError={onPersistError}
            onPersisted={onPersisted}
          />
        )}
      </div>
    </section>
  );
}
