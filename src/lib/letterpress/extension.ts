import { Node } from '@tiptap/core';
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
    return ({ node }) => {
      let current = node, destroyed = false, revision = 0;
      const dom = document.createElement('figure');
      dom.className = 'vana-letter-block'; dom.contentEditable = 'false';
      const canvas = document.createElement('canvas');
      canvas.setAttribute('role', 'img');
      const fallback = document.createElement('figcaption');
      fallback.className = 'vana-letter-fallback';
      const actions = document.createElement('div'); actions.className = 'vana-letter-actions';
      const open = document.createElement('button'); open.type = 'button'; open.textContent = '调整信稿';
      open.addEventListener('click', () => {
        if (!destroyed) this.options.onOpen?.({ purpose: 'embed', design: readLetter(current.toJSON()), blockId: current.attrs.id });
      });
      const share = document.createElement('button'); share.type = 'button'; share.textContent = '分享图片';
      share.addEventListener('click', () => {
        if (!destroyed) this.options.onOpen?.({ purpose: 'share', design: readLetter(current.toJSON()), blockId: current.attrs.id });
      });
      actions.append(open, share); dom.append(canvas, fallback, actions);
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
      actions.hidden = !this.options.onOpen;
      void draw();
      return {
        dom,
        update(next) { if (next.type !== current.type) return false; current = next; canvas.hidden = false; void draw(); return true; },
        stopEvent(event) { return actions.contains(event.target as globalThis.Node); },
        ignoreMutation() { return true; },
        destroy() { destroyed = true; revision++; },
        selectNode() { dom.classList.add('ProseMirror-selectednode'); },
        deselectNode() { dom.classList.remove('ProseMirror-selectednode'); },
      };
    };
  },
});
