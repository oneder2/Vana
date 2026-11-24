import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Node, type Editor } from '@tiptap/core';
import type { Node as DocumentNode } from '@tiptap/pm/model';
import { closeHistory } from '@tiptap/pm/history';
import { Check, Copy, Dice5, Files, FileText, Pencil, Trash2 } from 'lucide-react';
import { ModuleMenu } from '@/components/ModuleMenu';
import { Disclosure } from '@/components/Disclosure';
import { SelectField } from '@/components/SelectField';
import { copyText } from '../clipboard';
import { isModuleEditing, lineIsEditing, setModuleEditing } from '../moduleEditing';
import { DiceLocks, TextStylePresets } from '@/components/TextStylePresets';
import { TEXT_FONTS as FONTS } from '../textFonts';
import { DIALOGUE_LOCKS, rollDialogue } from '../textPlugins/dice';
import { DIALOGUE_LAYOUTS, MAX_DIALOGUE_LINES, dialogueLine, dialogueText, dialogueToParagraphs, parseDialogueStyle, type DialogueStyle } from './model';
import './style.css';

interface ControlsProps {
  node: DocumentNode; editor: Editor; getPos: () => number | undefined;
  updateAttributes: (attrs: Partial<DialogueStyle> & { title?: string }) => void; scope: string; editable: boolean;
}

function DialogueControls({ node, editor, getPos, updateAttributes, scope, editable, host }: ControlsProps & { host: HTMLElement }) {
  const style = parseDialogueStyle(node.attrs);
  const [locks, setLocks] = useState<Partial<Record<keyof DialogueStyle, boolean>>>({});
  const [notice, setNotice] = useState('');
  useEffect(() => { void import('../letterpress/render').then(m => m.loadLetterFonts(style.font)).catch(() => {}); }, [style.font]);
  const apply = (next: DialogueStyle) => { if (editor.isEditable) updateAttributes(next); };
  const convert = () => {
    const pos = getPos();
    if (editor.isEditable && typeof pos === 'number') editor.chain().focus().command(({ tr }) => { closeHistory(tr); return true; }).insertContentAt({ from: pos, to: pos + node.nodeSize }, dialogueToParagraphs(node.toJSON())).run();
  };
  const action = (id: string) => {
    const pos = getPos();
    if (id === 'copy') { void copyText(dialogueText(node.toJSON())).then(() => setNotice('文字已复制')).catch(e => setNotice(String(e))); return; }
    if (!editor.isEditable || typeof pos !== 'number') return;
    if (id === 'edit') { setModuleEditing(editor, node.attrs.id); return; }
    if (id === 'done') { setModuleEditing(editor); return; }
    if (id === 'convert') { convert(); return; }
    if (id === 'duplicate') { const copy = node.toJSON(); copy.attrs = { ...copy.attrs, id: crypto.randomUUID() }; editor.chain().focus().command(({ tr }) => { closeHistory(tr); return true; }).insertContentAt(pos + node.nodeSize, copy).run(); }
    if (id === 'delete') editor.chain().focus().command(({ tr }) => { closeHistory(tr); return true; }).deleteRange({ from: pos, to: pos + node.nodeSize }).run();
  };
  return <><ModuleMenu host={host} label="对话卡" onAction={action} items={[
    ...(editor.isEditable ? [{ id: editable ? 'done' : 'edit', label: editable ? '完成编辑' : '编辑对话卡', icon: editable ? Check : Pencil }] : []),
    { id: 'copy', label: '复制文字', icon: Copy },
    ...(editor.isEditable ? [{ id: 'duplicate', label: '复制模块', icon: Files }, { id: 'convert', label: '转为普通正文', icon: FileText }, { id: 'delete', label: '删除模块', icon: Trash2, danger: true, separator: true }] : []),
  ]} />{editable ? <div className="dialogue-tools">
      <div className="module-edit-heading"><span>编辑对话卡</span><button type="button" onClick={() => setModuleEditing(editor)}><Check size={15} />完成</button></div>
      <input className="dialogue-title-input" aria-label="对话标题" placeholder="对话标题（可留空）" maxLength={120} value={node.attrs.title} onChange={e => updateAttributes({ title: e.target.value })} />
      <Disclosure title="样式与预设"><div className="dialogue-settings">
        <div className="dialogue-style-fields"><label>形式<SelectField label="对话形式" value={style.layout} onChange={layout => apply({ ...style, layout: layout as DialogueStyle['layout'] })} options={Object.entries(DIALOGUE_LAYOUTS).map(([value, label]) => ({ value, label }))} /></label>
          <label>字体<SelectField label="对话字体" value={style.font} onChange={font => apply({ ...style, font: font as DialogueStyle['font'] })} options={Object.entries(FONTS).map(([value, font]) => ({ value, label: font.name }))} /></label>
          <label>间距<SelectField label="对话间距" value={style.density} onChange={density => apply({ ...style, density: density as DialogueStyle['density'] })} options={[{ value: 'compact', label: '紧凑' }, { value: 'relaxed', label: '舒展' }]} /></label></div>
        <TextStylePresets scope={scope} kind="dialogue" style={style} onApply={apply} />
        <DiceLocks options={DIALOGUE_LOCKS} locks={locks} onChange={setLocks} />
        <button type="button" disabled={Object.keys(DIALOGUE_LOCKS).every(k => locks[k as keyof DialogueStyle])} onClick={() => { apply(rollDialogue(style, crypto.getRandomValues(new Uint32Array(1))[0], locks)); setNotice('样式已更换，角色与台词保持原样，可通过撤销恢复。'); }}><Dice5 size={16} />灵感骰子</button>
        <button type="button" onClick={convert}><FileText size={16} />转为普通正文</button>
        <p className="tp-note" role="status">{notice || '直接在卡片里写台词，样式不会改变文字。'}</p>
      </div></Disclosure>
    </div> : node.attrs.title ? <p className="dialogue-title">{node.attrs.title}</p> : null}{notice && !editable && <span className="module-notice" role="status">{notice}</span>}</>;
}

export const DialogueBlock = Node.create<{ accountScope: string }>({
  name: 'dialogue', group: 'block', content: 'dialogueLine+', defining: true, isolating: true,
  addOptions() { return { accountScope: 'guest' }; },
  addAttributes() { return { id: { default: null }, title: { default: '' }, layout: { default: 'chat' }, font: { default: 'sans' }, density: { default: 'relaxed' } }; },
  parseHTML() { return [{ tag: 'section[data-vana-dialogue]', contentElement: '.vana-dialogue-lines', getAttrs: element => {
    try { return { id: crypto.randomUUID(), title: (element.getAttribute('data-title') ?? '').slice(0, 120), ...parseDialogueStyle({ layout: element.getAttribute('data-layout'), font: element.getAttribute('data-font'), density: element.getAttribute('data-density') }) }; } catch { return false; }
  } }]; },
  renderHTML({ node }) { return ['section', { 'data-vana-dialogue': '1', 'data-title': node.attrs.title, 'data-layout': node.attrs.layout, 'data-font': node.attrs.font, 'data-density': node.attrs.density },
    ...(node.attrs.title ? [['p', {}, node.attrs.title]] : []), ['div', { class: 'vana-dialogue-lines' }, 0]]; },
  renderText({ node }) { return dialogueText(node.toJSON()); },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      let current = node, destroyed = false;
      const dom = document.createElement('section'); dom.className = 'vana-dialogue';
      dom.dataset.vanaModule = 'dialogue'; dom.tabIndex = 0;
      const controls = document.createElement('div'); controls.contentEditable = 'false';
      const contentDOM = document.createElement('div'); contentDOM.className = 'vana-dialogue-lines';
      const footer = document.createElement('div'); footer.className = 'dialogue-footer'; footer.contentEditable = 'false';
      const add = document.createElement('button'); add.type = 'button'; add.textContent = '＋ 添加台词';
      const hint = document.createElement('span');
      footer.append(add, hint); dom.append(controls, contentDOM, footer);
      const root = createRoot(controls);
      const updateAttributes = (attrs: Partial<DialogueStyle> & { title?: string }) => {
        const pos = getPos();
        if (!destroyed && editor.isEditable && typeof pos === 'number') editor.commands.command(({ tr }) => {
          if ('layout' in attrs || 'font' in attrs || 'density' in attrs) closeHistory(tr);
          tr.setNodeMarkup(pos, undefined, { ...current.attrs, ...attrs }); return true;
        });
      };
      const sync = () => {
        if (destroyed) return;
        const style = parseDialogueStyle(current.attrs);
        dom.dataset.layout = style.layout; dom.dataset.density = style.density;
        dom.style.setProperty('--dialogue-font', FONTS[style.font].family);
        const editing = isModuleEditing(editor, current.attrs.id);
        dom.dataset.moduleEditing = String(editing); contentDOM.contentEditable = String(editing);
        footer.hidden = !editing; add.disabled = current.childCount >= MAX_DIALOGUE_LINES;
        hint.textContent = add.disabled ? `已达到 ${MAX_DIALOGUE_LINES} 条台词上限` : '';
        root.render(<DialogueControls host={dom} node={current} editor={editor} getPos={getPos} updateAttributes={updateAttributes} scope={this.options.accountScope} editable={editing} />);
      };
      add.addEventListener('click', () => {
        const pos = getPos(), last = current.lastChild?.attrs;
        if (destroyed || !editor.isEditable || typeof pos !== 'number' || current.childCount >= MAX_DIALOGUE_LINES) return;
        editor.chain().focus().command(({ tr }) => { closeHistory(tr); return true; }).insertContentAt(pos + current.nodeSize - 1, dialogueLine(last?.side === 'left' ? '角色乙' : '角色甲', '', last?.side === 'left' ? 'right' : 'left')).run();
      });
      editor.on('transaction', sync); editor.on('update', sync); sync();
      return {
        dom, contentDOM,
        update(next) { if (next.type !== current.type) return false; current = next; sync(); return true; },
        stopEvent(event) { return controls.contains(event.target as globalThis.Node) || footer.contains(event.target as globalThis.Node) || (!isModuleEditing(editor, current.attrs.id) && contentDOM.contains(event.target as globalThis.Node)); },
        ignoreMutation(mutation) { return mutation.type !== 'selection' && !contentDOM.contains(mutation.target) && mutation.target !== contentDOM; },
        destroy() { destroyed = true; editor.off('transaction', sync); editor.off('update', sync); queueMicrotask(() => root.unmount()); },
      };
    };
  },
});

export const DialogueLine = Node.create({
  name: 'dialogueLine', content: 'paragraph+', defining: true, isolating: true,
  addAttributes() { return { speaker: { default: '' }, side: { default: 'left' } }; },
  parseHTML() { return [{ tag: 'div[data-vana-dialogue-line]', contentElement: '.dialogue-words', getAttrs: element => ({ speaker: (element.getAttribute('data-speaker') ?? '').slice(0, 80), side: element.getAttribute('data-side') === 'right' ? 'right' : 'left' }) }]; },
  renderHTML({ node }) { return ['div', { 'data-vana-dialogue-line': '1', 'data-speaker': node.attrs.speaker, 'data-side': node.attrs.side }, ['span', {}, node.attrs.speaker], ['div', { class: 'dialogue-words' }, 0]]; },
  renderText({ node }) { return dialogueText(node.toJSON()); },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      let current = node, destroyed = false;
      const dom = document.createElement('div'); dom.className = 'vana-dialogue-line';
      const speaker = document.createElement('div'); speaker.className = 'dialogue-speaker'; speaker.contentEditable = 'false';
      const name = document.createElement('input'); name.setAttribute('aria-label', '角色名称'); name.maxLength = 80; name.placeholder = '角色名称';
      const label = document.createElement('span');
      const actions = document.createElement('div'); actions.className = 'dialogue-line-actions';
      const side = document.createElement('button'); side.type = 'button'; side.className = 'dialogue-side';
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '删除';
      const contentDOM = document.createElement('div'); contentDOM.className = 'dialogue-words';
      actions.append(side, remove); speaker.append(name, label, actions); dom.append(speaker, contentDOM);
      const updateAttrs = (attrs: Record<string, unknown>) => {
        const pos = getPos();
        if (!destroyed && editor.isEditable && typeof pos === 'number') editor.commands.command(({ tr }) => { tr.setNodeMarkup(pos, undefined, { ...current.attrs, ...attrs }); return true; });
      };
      name.addEventListener('input', () => updateAttrs({ speaker: name.value.slice(0, 80) }));
      side.addEventListener('click', () => updateAttrs({ side: current.attrs.side === 'left' ? 'right' : 'left' }));
      remove.addEventListener('click', () => {
        const pos = getPos();
        if (destroyed || !editor.isEditable || typeof pos !== 'number' || editor.state.doc.resolve(pos).parent.childCount <= 1) return;
        editor.chain().focus().command(({ tr }) => { closeHistory(tr); return true; }).deleteRange({ from: pos, to: pos + current.nodeSize }).run();
      });
      const sync = () => {
        if (destroyed) return;
        const pos = getPos();
        dom.dataset.side = current.attrs.side;
        if (name.value !== current.attrs.speaker) name.value = current.attrs.speaker;
        label.textContent = current.attrs.speaker;
        const editing = lineIsEditing(editor, pos);
        contentDOM.contentEditable = String(editing);
        name.hidden = !editing; actions.hidden = !editing; label.hidden = editing;
        side.textContent = current.attrs.side === 'left' ? '靠右' : '靠左';
        side.setAttribute('aria-label', `将${current.attrs.speaker || '台词'}放到${current.attrs.side === 'left' ? '右' : '左'}侧`);
        remove.setAttribute('aria-label', `删除${current.attrs.speaker || '当前'}台词`);
        remove.disabled = typeof pos !== 'number' || editor.state.doc.resolve(pos).parent.childCount <= 1;
      };
      editor.on('transaction', sync); editor.on('update', sync); sync();
      return {
        dom, contentDOM,
        update(next) { if (next.type !== current.type) return false; current = next; sync(); return true; },
        stopEvent(event) { return speaker.contains(event.target as globalThis.Node); },
        ignoreMutation(mutation) { return mutation.type !== 'selection' && !contentDOM.contains(mutation.target) && mutation.target !== contentDOM; },
        destroy() { destroyed = true; editor.off('transaction', sync); editor.off('update', sync); },
      };
    };
  },
});
