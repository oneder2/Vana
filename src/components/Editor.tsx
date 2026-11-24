'use client';

import { letterText, readLetter, selectedExcerpt, type LetterpressRequest, type TextExcerpt } from '@/lib/letterpress/document';
import { dialogueText } from '@/lib/dialogue/model';
import { storyRollText } from '@/lib/storyRoll/model';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor as TiptapEditor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import { Bold, Copy, Clipboard, Scissors, Share2, Sparkles, Trash2, Heading1, Heading2, Italic, List, ListOrdered, MousePointer2, Quote, Underline } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { getTiptapExtensions } from '@/lib/tiptap-extensions';
import { useEditorSelection } from '@/lib/useEditorSelection';
import { useKeyboardInset } from '@/lib/useKeyboardInset';
import { usePresence } from '@/lib/usePresence';
import { getDocumentStyleCssVars } from '@/lib/documentStyles';
import { getThemeAccentColor, getThemeBorderColor, getThemeSurfaceColor } from '@/lib/themeStyles';
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
  readOnly?: boolean;
  onLetterpress?: (request: LetterpressRequest) => void;
}

function extractPlainText(node?: JSONContent): string {
  if (!node) return '';
  if (node.type === 'storyRoll') return storyRollText(node) + '\n';
  if (node.type === 'dialogue' || node.type === 'dialogueLine') return dialogueText(node);
  if (node.type === 'letterpress') return letterText(readLetter(node));
  if (node.type === 'text') return node.text ?? '';
  return (node.content ?? []).map(extractPlainText).join('');
}

const toolbarLabels: Record<string, string> = { bold: '加粗', italic: '斜体', underline: '下划线', h1: '一级标题', h2: '二级标题', quote: '引用', bullet: '无序列表', ordered: '有序列表' };

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
  readOnly = false,
  onLetterpress,
}: EditorProps) {
  const { theme } = useTheme();
  const latestTags = useRef(tags);
  const acceptedGeneration = useRef((filePath ? documentDrafts.get(filePath, accountScope)?.content_generation : undefined) ?? contentGeneration);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; excerpt?: TextExcerpt } | null>(null);
  const letterHandler = useRef(onLetterpress);
  letterHandler.current = onLetterpress;
  const hasLetterHandler = Boolean(onLetterpress);

  const extensions = useMemo(() => getTiptapExtensions(theme.id, hasLetterHandler ? request => letterHandler.current?.(request) : undefined, accountScope), [theme.id, hasLetterHandler, accountScope]);
  const restoredContent = useMemo(() => {
    const draft = filePath ? documentDrafts.get(filePath, accountScope) : undefined;
    return draft ? JSON.parse(draft.content_json) as JSONContent : undefined;
  }, [filePath, accountScope]);

  useEffect(() => {
    latestTags.current = tags;
  }, [tags]);

  const editor = useEditor({
    extensions,
    content: restoredContent ?? initialContent ?? { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
    immediatelyRender: false,
    autofocus: false,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      if (!editor.isEditable) return;
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
      handleKeyDown: (view, event) => {
        const selection = window.getSelection();
        const element = selection?.anchorNode?.parentElement;
        const lockedModule = element?.closest('[data-module-editing=false]');
        if (view.editable && !lockedModule) return false;
        // ProseMirror keymaps can run even when its DOM is not contenteditable.
        // Keep selection/navigation/copy, block undo, paste and formatting mutations.
        const key = event.key.toLowerCase();
        if ((event.ctrlKey || event.metaKey) && ['a', 'c', 'f'].includes(key)) return false;
        return !['tab', 'escape', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown',
          'home', 'end', 'pageup', 'pagedown', 'shift', 'control', 'alt', 'meta'].includes(key);
      },
      handlePaste: (view) => !view.editable || !!window.getSelection()?.anchorNode?.parentElement?.closest('[data-module-editing=false]'),
      handleDOMEvents: {
        beforeinput: (view, event) => {
          if (view.editable && !window.getSelection()?.anchorNode?.parentElement?.closest('[data-module-editing=false]')) return false;
          event.preventDefault();
          return true;
        },
      },
      attributes: {
        class: `tiptap-editor focus:outline-none ${mobile ? 'min-h-[calc(100dvh-116px)] px-4 py-5' : 'min-h-[360px] px-5 py-6 sm:px-8'}`,
        role: 'textbox',
        'aria-label': '文档正文',
        'data-vana-letterpress-actions': hasLetterHandler ? 'true' : 'false',
        'aria-multiline': 'true',
        'aria-readonly': readOnly ? 'true' : 'false',
      },
    },
  });

  useEffect(() => {
    if (editor && editor.isEditable !== !readOnly) {
      editor.setEditable(!readOnly, false);
      // Notify embedded controls without producing a document update or save.
      editor.commands.setMeta('vana:editability', !readOnly);
    }
  }, [editor, readOnly]);

  const scrollRoot = useRef<HTMLDivElement>(null);
  const selectionVisible = useEditorSelection(editor, mobile && !readOnly);
  const toolbarPresent = usePresence(selectionVisible);
  const keyboardInset = useKeyboardInset(mobile);


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
  }, [editor, initialContent, filePath, contentGeneration, accountScope]);

  useEffect(() => documentDrafts.subscribe((event) => {
    if (event.id !== filePath || event.account_scope !== accountScope) return;
    if (event.type === 'saved' && event.clean) {
      onUnsavedChangesChange?.(false);
      onPersisted?.();
    }
  }), [filePath, accountScope, onUnsavedChangesChange, onPersisted, onPersistError]);

  useEffect(() => {
    const nativeAction = (event: Event) => {
      if (!editor || !letterHandler.current) return;
      const action = (event as CustomEvent).detail;
      if (action !== 'embed' && action !== 'share') return;
      const excerpt = selectedExcerpt(editor);
      if (excerpt?.text.trim()) letterHandler.current({ purpose: action, excerpt });
    };
    window.addEventListener('vana:selection-action', nativeAction);
    return () => window.removeEventListener('vana:selection-action', nativeAction);
  }, [editor]);

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    // Preserve WebView's native selection handles, Floating ActionMode and OEM
    // copy/process-text actions. A page menu at the touch point obscures them.
    if (mobile || event.nativeEvent instanceof PointerEvent && event.nativeEvent.pointerType === 'touch') return;
    if ((event.target as HTMLElement).closest('[data-vana-module], input, textarea, select, button, summary')) return;
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, excerpt: editor ? selectedExcerpt(editor) : undefined });
  }, [mobile, editor]);

  const handleMenuAction = useCallback((action: string) => {
    if (!editor) return;
    const excerpt = contextMenu?.excerpt;
    if (action === 'share' || action === 'embed') {
      if (excerpt?.text.trim()) letterHandler.current?.({ purpose: action, excerpt });
      return;
    }
    if (action === 'selectAll') {
      if (editor.isEditable) editor.chain().focus().selectAll().run();
      else {
        const range = document.createRange(); range.selectNodeContents(editor.view.dom);
        const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
      }
      return;
    }
    if (action === 'copy' || action === 'cut') {
      const text = excerpt?.text;
      if (!text) return;
      // Menu buttons preserve the DOM range for execCommand on older WebViews.
      const copy = navigator.clipboard?.writeText ? navigator.clipboard.writeText(text) : Promise.resolve(document.execCommand('copy'));
      void copy.then(() => {
        if (action === 'cut' && editor.isEditable && excerpt) editor.chain().focus().deleteRange(excerpt).run();
      }).catch(() => document.execCommand('copy'));
      return;
    }
    if (!editor.isEditable) return;
    if (action === 'delete' && excerpt) editor.chain().focus().deleteRange(excerpt).run();
    if (action === 'paste') { editor.chain().focus().run(); document.execCommand('paste'); }
  }, [editor, contextMenu]);

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
      className="document-surface flex h-full min-h-0 flex-col border overflow-hidden"
      style={{
        backgroundColor: getThemeSurfaceColor(theme),
        borderColor: getThemeBorderColor(theme),
        ...getDocumentStyleCssVars(theme),
      }}
    >
      {!readOnly && (!mobile || toolbarPresent) && <div
        className={`document-format-bar ${mobile ? 'mobile-format-bar flex items-center overflow-x-auto whitespace-nowrap' : 'flex flex-wrap items-center border-b'}`}
        data-visible={mobile ? selectionVisible : true} data-editor-format aria-hidden={mobile && !selectionVisible}
        role="toolbar" aria-label="正文格式"
        style={{ borderColor: border, ...(mobile ? { bottom: `calc(${keyboardInset}px + env(safe-area-inset-bottom) + 8px)` } : {}) }}
        onPointerDown={event => event.preventDefault()}
      >
        {toolbarButtons.map((button) => (
          <button
            key={button.key}
            type="button"
            aria-label={toolbarLabels[button.key]}
            aria-pressed={button.active}
            title={toolbarLabels[button.key]}
            tabIndex={mobile && !selectionVisible ? -1 : 0}
            onClick={button.action}
            className={`shrink-0 transition-colors ${mobile ? 'min-h-11 min-w-11 px-2 py-2' : 'px-2 py-1'}`}
            style={{
              color: accent,
            }}
          >
            {button.icon}
          </button>
        ))}
      </div>}

      <div ref={scrollRoot} className={`editor-scroll min-h-0 flex-1 overflow-y-auto relative ${mobile ? "is-mobile" : ""}`} onContextMenu={handleContextMenu}>
        <EditorContent editor={editor} />
      </div>

      <ContextMenu
          open={!!contextMenu}
          x={contextMenu?.x ?? 0}
          y={contextMenu?.y ?? 0}
          onClose={() => setContextMenu(null)}
          onAction={handleMenuAction}
          items={[
            ...(contextMenu?.excerpt?.text ? [
              { id: 'copy', label: '复制', icon: Copy },
              ...(!readOnly ? [{ id: 'cut', label: '剪切', icon: Scissors }] : []),
              ...(hasLetterHandler ? [
                { id: 'share', label: '文段分享', icon: Share2 },
                { id: 'embed', label: '制作信稿', icon: Sparkles },
              ] : []),
            ] : []),
            ...(!readOnly ? [{ id: 'paste', label: '粘贴', icon: Clipboard }] : []),
            { id: 'selectAll', label: '全选', icon: MousePointer2 },
            ...(!readOnly && contextMenu?.excerpt ? [{ id: 'delete', label: '删除选区', icon: Trash2 }] : []),
          ]}
        />
    </div>
  );
}
