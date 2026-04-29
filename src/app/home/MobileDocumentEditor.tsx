'use client';

import type { JSONContent } from '@tiptap/core';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { Editor } from '@/components/Editor';
import type { DocumentRecord } from '@/lib/api';

export function MobileDocumentEditor({
  currentDocument,
  content,
  documentTags,
  onEditorReady,
  onContentChange,
  onPersistError,
  onPersisted,
}: {
  currentDocument: DocumentRecord;
  content: JSONContent;
  documentTags: string[];
  onEditorReady: (editor: TiptapEditor | null) => void;
  onContentChange: (content: JSONContent) => void;
  onPersistError: (message: string) => void;
  onPersisted: () => void;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden p-0">
        <Editor
          filePath={currentDocument.id}
          initialContent={content}
          tags={documentTags}
          mobile
          onEditorReady={onEditorReady}
          onContentChange={onContentChange}
          onPersistError={onPersistError}
          onPersisted={onPersisted}
        />
      </div>
    </section>
  );
}
