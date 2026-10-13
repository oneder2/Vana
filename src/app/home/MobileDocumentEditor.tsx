'use client';

import type { ReactNode } from 'react';
import type { JSONContent } from '@tiptap/core';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { Editor } from '@/components/Editor';
import { DocumentAttachments } from '@/components/DocumentAttachments';
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
}) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      {navigation}
      <DocumentAttachments key={`${currentDocument.account_scope}:${currentDocument.id}`} scope={currentDocument.account_scope} documentId={currentDocument.id} generation={currentDocument.content_generation} readOnly={readOnly} />
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
          onEditorReady={onEditorReady}
          onContentChange={onContentChange}
          onPersistError={onPersistError}
          onPersisted={onPersisted}
        />
      </div>
    </section>
  );
}
