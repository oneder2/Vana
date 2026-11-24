import { Node } from '@tiptap/core';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Copy, Files, FileText, Pencil, Share2, Trash2 } from 'lucide-react';
import { LetterModuleMenu } from '@/components/LetterModuleMenu';
import { closeHistory } from '@tiptap/pm/history';
import { parseLetter } from './model';
import { letterText, readLetter, type LetterpressRequest } from './document';
import './embedded.css';

export const LetterpressBlock = Node.create<{ onOpen?: (request: LetterpressRequest) => void }>({
  name: 'letterpress', group: 'block', atom: true, selectable: true, draggable: true,
  addOptions() { return { onOpen: undefined }; },
  addAttributes() { return { id: { default: null }, design: { default: null } }; },
  parseHTML() {
    return [{ tag: 'figure[data-vana-letterpress]', getAttrs: element => {
      try { return { id: crypto.randomUUID(), design: parseLetter(element.getAttribute('data-vana-letterpress') ?? '') }; }
      catch { return false; }
    } }];
  },
  renderHTML({ node }) {
    const design = readLetter(node.toJSON());
    return ['figure', { 'data-vana-letterpress': JSON.stringify(design), 'aria-label': '信稿' }, ['figcaption', {}, letterText(design)]];
  },
  renderText({ node }) { return letterText(readLetter(node.toJSON())); },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      let current = node, destroyed = false, revision = 0;
      const dom = document.createElement('figure');
      dom.className = 'vana-letter-block'; dom.contentEditable = 'false'; dom.dataset.vanaModule = 'letterpress'; dom.dataset.moduleEditing = 'false'; dom.tabIndex = 0;
      const canvas = document.createElement('canvas');
      canvas.setAttribute('role', 'img');
      const fallback = document.createElement('figcaption');
      fallback.className = 'vana-letter-fallback';
      const actions = document.createElement('div'); actions.className = 'module-actions';
      dom.append(canvas, fallback, actions);
      const root = createRoot(actions);
      const menu = () => {
        if (!this.options.onOpen) return;
        root.render(createElement(LetterModuleMenu, { host: dom, design: readLetter(current.toJSON()), items: [
          ...(editor.isEditable ? [{ id: 'edit', label: '编辑信稿', icon: Pencil }] : []),
          { id: 'copy', label: '复制文字', icon: Copy }, { id: 'share', label: '分享图片', icon: Share2 },
          ...(editor.isEditable ? [{ id: 'duplicate', label: '复制模块', icon: Files }, { id: 'convert', label: '转为普通正文', icon: FileText }, { id: 'delete', label: '删除模块', icon: Trash2, danger: true, separator: true }] : []),
        ], onAction: (id: string) => {
          if (id === 'edit') { this.options.onOpen?.({ purpose: 'embed', design: readLetter(current.toJSON()), blockId: current.attrs.id }); return; }
          const pos = getPos(); if (!editor.isEditable || typeof pos !== 'number') return;
          if (id === 'duplicate') { const copy = current.toJSON(); copy.attrs = { ...copy.attrs, id: crypto.randomUUID() }; editor.chain().focus().command(({ tr }) => { closeHistory(tr); return true; }).insertContentAt(pos + current.nodeSize, copy).run(); }
          if (id === 'delete') editor.chain().focus().command(({ tr }) => { closeHistory(tr); return true; }).deleteRange({ from: pos, to: pos + current.nodeSize }).run();
          if (id === 'convert') editor.chain().focus().command(({ tr }) => { closeHistory(tr); return true; }).insertContentAt({ from: pos, to: pos + current.nodeSize }, letterText(readLetter(current.toJSON())).split('\n').map(text => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }))).run();
        } }));
      };
      const draw = async () => {
        const n = ++revision;
        try {
          const design = readLetter(current.toJSON());
          fallback.textContent = letterText(design);
          canvas.setAttribute('aria-label', letterText(design));
          canvas.style.aspectRatio = design.format === 'square' ? '1' : design.format === 'tall' ? '9 / 16' : '3 / 4';
          const { loadLetterFonts, renderLetter } = await import('./render');
          await loadLetterFonts(design.font);
          if (destroyed || n !== revision) return;
          renderLetter(canvas, design, 720, { transparentBackground: true });
          fallback.hidden = true;
        } catch {
          if (!destroyed && n === revision) { fallback.hidden = false; canvas.hidden = true; }
        }
      };
      // History previews have no callback and remain passive.
      menu(); void draw();
      return {
        dom,
        update(next) { if (next.type !== current.type) return false; current = next; canvas.hidden = false; menu(); void draw(); return true; },
        stopEvent(event) { return actions.contains(event.target as globalThis.Node); },
        ignoreMutation() { return true; },
        destroy() { destroyed = true; revision++; queueMicrotask(() => root.unmount()); },
        selectNode() { dom.classList.add('ProseMirror-selectednode'); },
        deselectNode() { dom.classList.remove('ProseMirror-selectednode'); },
      };
    };
  },
});
