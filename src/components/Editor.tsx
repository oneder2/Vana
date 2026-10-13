'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor as TiptapEditor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import { Bold, Heading1, Heading2, Italic, List, ListOrdered, Quote, Underline } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { getTiptapExtensions } from '@/lib/tiptap-extensions';
import { getDocumentStyleCssVars } from '@/lib/documentStyles';
import { getThemeAccentBgColor, getThemeAccentColor, getThemeBorderColor, getThemeSurfaceColor } from '@/lib/themeStyles';
import { documentDrafts } from '@/lib/documentDrafts';
import { ContextMenu } from './ContextMenu';

export type EditorLayout = 'center' | 'left' | 'right';

interface EditorProps {
  filePath?: string;
  accountScope: string;
  contentGeneration: number;
  initialContent?: JSONContent;
  onContentChange?: (content: JSONContent) => void;
  workspacePath?: string;
  onEditorReady?: (editor: TiptapEditor | null) => void;
  layout?: EditorLayout;
  onUnsavedChangesChange?: (hasChanges: boolean) => void;
  onPersisted?: () => void;
  onPersistError?: (message: string) => void;
  tags?: string[];
  mobile?: boolean;
}

function extractPlainText(node?: JSONContent): string {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  return (node.content ?? []).map(extractPlainText).join('');
}

export function Editor({
  filePath,
  accountScope,
  contentGeneration,
  initialContent,
  onContentChange,
  onEditorReady,
  onUnsavedChangesChange,
  onPersisted,
  onPersistError,
  tags = [],
  mobile = false,
}: EditorProps) {
  const { theme } = useTheme();
  const latestTags = useRef(tags);
  const acceptedGeneration = useRef((filePath ? documentDrafts.get(filePath, accountScope)?.content_generation : undefined) ?? contentGeneration);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const extensions = useMemo(() => getTiptapExtensions(theme.id), [theme.id]);
  const restoredContent = useMemo(() => {
    const draft = filePath ? documentDrafts.get(filePath, accountScope) : undefined;
    return draft ? JSON.parse(draft.content_json) as JSONContent : undefined;
  }, [filePath]);

  useEffect(() => {
    latestTags.current = tags;
  }, [tags]);

  const editor = useEditor({
    extensions,
    content: restoredContent ?? initialContent ?? { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
    immediatelyRender: false,
    autofocus: true,
    onUpdate: ({ editor }) => {
      const content = editor.getJSON();
      const title =
        extractPlainText(content.content?.find((node) => node.type === 'heading')) ||
        extractPlainText(content).slice(0, 48) ||
        'Untitled';

      onContentChange?.(content);
      onUnsavedChangesChange?.(true);

      if (!filePath) return;
      documentDrafts.queue({
        id: filePath,
        account_scope: accountScope,
        content_generation: acceptedGeneration.current,
        title,
        content_json: JSON.stringify(content),
        plain_text: extractPlainText(content),
        tags: documentDrafts.get(filePath, accountScope)?.tags ?? [...latestTags.current],
      });
    },
    editorProps: {
      attributes: {
        class: `tiptap-editor focus:outline-none ${mobile ? 'min-h-[calc(100dvh-210px)] px-4 py-5' : 'min-h-[360px] px-5 py-6 sm:px-8'}`,
      },
    },
  });

  useEffect(() => {
    onEditorReady?.(editor);
    return () => onEditorReady?.(null);
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (!editor || !initialContent) return;
    if (filePath && documentDrafts.isDirty(filePath, accountScope)) return;
    acceptedGeneration.current = contentGeneration;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(initialContent);
    if (current !== next) {
      editor.commands.setContent(initialContent, { emitUpdate: false });
    }
  }, [editor, initialContent, filePath, contentGeneration]);

  useEffect(() => documentDrafts.subscribe((event) => {
    if (event.id !== filePath || event.account_scope !== accountScope) return;
    if (event.type === 'saved' && event.clean) {
      onUnsavedChangesChange?.(false);
      onPersisted?.();
    }
  }), [filePath, onUnsavedChangesChange, onPersisted, onPersistError]);

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  }, []);

  const handleMenuAction = useCallback(
    (action: string) => {
      if (!editor) return;

      const focusEditor = () => {
        editor.chain().focus().run();
      };

      switch (action) {
        case 'copy':
          focusEditor();
          document.execCommand('copy');
          break;
        case 'cut':
          focusEditor();
          document.execCommand('cut');
          break;
        case 'paste':
          focusEditor();
          document.execCommand('paste');
          break;
        case 'selectAll':
          focusEditor();
          editor.commands.selectAll();
          break;
        case 'delete':
          focusEditor();
          editor.commands.deleteSelection();
          break;
        default:
          break;
      }
    },
    [editor]
  );

  if (!editor) {
    return (
      <div
        className="min-h-[360px] border"
        style={{
          backgroundColor: getThemeSurfaceColor(theme),
          borderColor: getThemeBorderColor(theme),
        }}
      />
    );
  }

  const accent = getThemeAccentColor(theme);
  const accentBg = getThemeAccentBgColor(theme);
  const border = getThemeBorderColor(theme);

  const toolbarButtons = [
    { key: 'bold', icon: <Bold size={14} />, active: editor.isActive('bold'), action: () => editor.chain().focus().toggleBold().run() },
    { key: 'italic', icon: <Italic size={14} />, active: editor.isActive('italic'), action: () => editor.chain().focus().toggleItalic().run() },
    { key: 'underline', icon: <Underline size={14} />, active: editor.isActive('underline'), action: () => editor.chain().focus().toggleUnderline().run() },
    { key: 'h1', icon: <Heading1 size={14} />, active: editor.isActive('heading', { level: 1 }), action: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
    { key: 'h2', icon: <Heading2 size={14} />, active: editor.isActive('heading', { level: 2 }), action: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { key: 'quote', icon: <Quote size={14} />, active: editor.isActive('blockquote'), action: () => editor.chain().focus().toggleBlockquote().run() },
    { key: 'bullet', icon: <List size={14} />, active: editor.isActive('bulletList'), action: () => editor.chain().focus().toggleBulletList().run() },
    { key: 'ordered', icon: <ListOrdered size={14} />, active: editor.isActive('orderedList'), action: () => editor.chain().focus().toggleOrderedList().run() },
  ];

  return (
    <div
      className="flex h-full min-h-0 flex-col border overflow-hidden"
      style={{
        backgroundColor: getThemeSurfaceColor(theme),
        borderColor: getThemeBorderColor(theme),
        ...getDocumentStyleCssVars(theme),
      }}
    >
      <div
        className={`border-b px-3 py-2 ${mobile ? 'flex items-center gap-1 overflow-x-auto whitespace-nowrap' : 'flex flex-wrap items-center gap-1'}`}
        style={{ borderColor: border }}
      >
        {toolbarButtons.map((button) => (
          <button
            key={button.key}
            type="button"
            onClick={button.action}
            className={`shrink-0 border transition-colors ${mobile ? 'min-h-9 min-w-9 px-2 py-2' : 'px-2 py-1'}`}
            style={{
              borderColor: border,
              backgroundColor: button.active ? accentBg : 'transparent',
              color: accent,
            }}
          >
            {button.icon}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto relative" onContextMenu={handleContextMenu}>
        <EditorContent editor={editor} />
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onAction={handleMenuAction}
          hasSelection={!editor.state.selection.empty}
          isBlock
        />
      )}
    </div>
  );
}
