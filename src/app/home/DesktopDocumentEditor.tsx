'use client';

import React from 'react';
import type { JSONContent } from '@tiptap/core';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { Plus, Tag, X } from 'lucide-react';
import { Editor } from '@/components/Editor';
import type { AppState, DocumentRecord } from '@/lib/api';

export function DesktopDocumentEditor({
  currentDocument,
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
  navigation,
  readOnly,
}: {
  currentDocument: DocumentRecord | null;
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
  navigation: React.ReactNode;
  readOnly: boolean;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      {navigation}
      <div className="shell-panel border-b px-4 py-3 sm:px-5" style={{ backgroundColor: surface, borderColor: border }}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] opacity-72">
          <span>最近更新 {formatTimestamp(currentDocument?.updated_at)}</span>
          <span>{isSyncing ? '同步中' : `待同步 ${appState?.sync.pending_jobs ?? 0}`}</span>
          <span>同步 {appState?.sync.mode ?? 'local-only'}</span>
          {appState && (
            <span>
              存储 {formatBytes(appState.limits.current_total_storage_bytes)}{appState.limits.max_total_storage_bytes > 0 ? ` / ${formatBytes(appState.limits.max_total_storage_bytes)}` : ''}
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
                  {!readOnly && <button
                    type="button"
                    className="opacity-70 transition-opacity hover:opacity-100"
                    onClick={() => onRemoveTag(tag)}
                  >
                    <X size={12} />
                  </button>}
                </span>
              ))}
              {!readOnly && <div className="flex min-w-[140px] flex-1 items-center gap-2">
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
              </div>}
              {readOnly && !documentTags.length && <span className="text-xs opacity-60">无标签</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-0 md:p-3">
        {currentDocument && (
          <Editor
            key={`${currentDocument.account_scope}:${currentDocument.id}`}
            filePath={currentDocument.id}
            accountScope={currentDocument.account_scope}
            contentGeneration={currentDocument.content_generation}
            initialContent={content}
            tags={documentTags}
            mobile={false}
            readOnly={readOnly}
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
