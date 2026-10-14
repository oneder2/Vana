'use client';

import type { ReactNode } from 'react';
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
  navigation,
  readOnly,
  onReadingClick,
}: {
  currentDocument: DocumentRecord;
  content: JSONContent;
  documentTags: string[];
  onEditorReady: (editor: TiptapEditor | null) => void;
  onContentChange: (content: JSONContent) => void;
  onPersistError: (message: string) => void;
  onPersisted: () => void;
  navigation: ReactNode;
  readOnly: boolean;
  onReadingClick: () => void;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      {navigation}
      <div className="min-h-0 flex-1 overflow-hidden p-0">
        <Editor
          key={`${currentDocument.account_scope}:${currentDocument.id}`}
          filePath={currentDocument.id}
          accountScope={currentDocument.account_scope}
          contentGeneration={currentDocument.content_generation}
          initialContent={content}
          tags={documentTags}
          mobile
          readOnly={readOnly}
          onReadingClick={onReadingClick}
          onEditorReady={onEditorReady}
          onContentChange={onContentChange}
          onPersistError={onPersistError}
          onPersisted={onPersisted}
        />
      </div>
    </section>
  );
}
