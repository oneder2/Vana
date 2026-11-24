import { Node } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { TextSelection } from '@tiptap/pm/state';
import { NodeViewWrapper, ReactNodeViewRenderer, useEditorState, type NodeViewProps } from '@tiptap/react';
import { useRef, useState, type FormEvent } from 'react';
import { ArrowDown, Check, Copy, Dice5, Files, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Disclosure } from '@/components/Disclosure';
import { ModuleMenu } from '@/components/ModuleMenu';
import { copyText } from '../clipboard';
import { isModuleEditing, setModuleEditing } from '../moduleEditing';
import {
  DIE_SIDES, MAX_OUTCOME, MAX_OUTCOMES, MAX_QUESTION, outcomeTable, rangeText,
  readStoryRoll, rollStory, storyRollLines, storyRollNode, storyRollText, type Outcome, type StoryRoll,
} from './model';
import './style.css';

function StoryRollForm({ card, onSave, onCancel }: {
  card: StoryRoll; onSave: (next: StoryRoll, roll: boolean) => void; onCancel: () => void;
}) {
  const key = useRef(card.outcomes.length);
  const [question, setQuestion] = useState(card.question);
  const [rows, setRows] = useState(() => card.outcomes.map((row, id) => ({ id, from: String(row.from), to: String(row.to), text: row.text })));
  const [error, setError] = useState('');
  const change = (id: number, field: keyof Outcome, value: string) => {
    setRows(previous => previous.map(row => row.id === id ? { ...row, [field]: value } : row));
    setError('');
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const roll = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'roll';
    try {
      if (!question.trim()) throw new Error('请填写判定问题');
      if (rows.some(row => !/^\d{1,3}$/.test(row.from) || !/^\d{1,3}$/.test(row.to))) {
        throw new Error('区间起点和终点都要填写 1 至 100 的整数');
      }
      const outcomes = outcomeTable(rows.map(row => ({
        from: Number(row.from), to: Number(row.to), text: row.text.trim(),
      })));
      onSave({ ...card, question: question.trim(), outcomes }, roll);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  return <form className="story-roll-form" onSubmit={submit}>
    <label>判定问题<textarea autoFocus rows={2} value={question} maxLength={MAX_QUESTION} placeholder="角色能顺利完成什么行动？" onChange={event => { setQuestion(event.target.value); setError(''); }} /></label>
    <div className="story-roll-ranges"><span>结果区间</span><span>覆盖 1–{DIE_SIDES}</span></div>
    {rows.map((row, index) => <fieldset className="story-roll-row" key={row.id}>
      <legend className="sr-only">结果 {index + 1}</legend>
      <div className="story-roll-bounds">
        <input inputMode="numeric" aria-label={`区间 ${index + 1} 起点`} value={row.from} maxLength={3} onChange={event => change(row.id, 'from', event.target.value)} />
        <span aria-hidden="true">–</span>
        <input inputMode="numeric" aria-label={`区间 ${index + 1} 终点`} value={row.to} maxLength={3} onChange={event => change(row.id, 'to', event.target.value)} />
      </div>
      <textarea aria-label={`区间 ${index + 1} 的结果`} rows={2} value={row.text} maxLength={MAX_OUTCOME} placeholder="这个结果会让剧情怎么走？" onChange={event => change(row.id, 'text', event.target.value)} />
      <button type="button" className="ui-icon-button" aria-label={`删除区间 ${index + 1}`} disabled={rows.length <= 2}
        onClick={() => { setRows(previous => previous.filter(item => item.id !== row.id)); setError(''); }}><Trash2 size={16} /></button>
    </fieldset>)}
    <button type="button" className="ui-button ui-button-quiet" disabled={rows.length >= MAX_OUTCOMES}
      onClick={() => { const id = key.current++; setRows(previous => [...previous, { id, from: '', to: '', text: '' }]); setError(''); }}><Plus size={16} />添加区间</button>
    {error && <p className="story-roll-error" role="alert">{error}</p>}
    <div className="story-roll-actions">
      <button type="button" className="ui-button ui-button-quiet" onClick={onCancel}><X size={16} />取消</button>
      <button type="submit" className="ui-button ui-button-quiet" value="save"><Check size={16} />保存判定表</button>
      <button type="submit" className="ui-button ui-button-primary" value="roll"><Dice5 size={16} />掷骰并记录</button>
    </div>
  </form>;
}

function StoryRollView({ editor, node, getPos }: NodeViewProps) {
  const card = readStoryRoll(node.toJSON());
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [notice, setNotice] = useState('');
  const [revealed, setRevealed] = useState(false);
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({ editable: editor.isEditable, editing: isModuleEditing(editor, card.id) }),
  });
  const editing = state.editing && !card.result;

  const position = () => {
    if (editor.isDestroyed || !editor.isEditable) return undefined;
    const pos = getPos();
    if (pos === undefined || editor.state.doc.nodeAt(pos)?.attrs.id !== card.id) return undefined;
    return pos;
  };
  const save = (input: StoryRoll, roll: boolean) => {
    const pos = position();
    if (pos === undefined) throw new Error('这张判定卡已无法编辑');
    if (editor.state.doc.nodeAt(pos)?.attrs.result) throw new Error('这张卡已有结果');
    const next = roll ? rollStory(input) : readStoryRoll(storyRollNode(input));
    const success = editor.commands.command(({ tr }) => {
      closeHistory(tr);
      tr.setNodeMarkup(pos, undefined, next);
      return true;
    });
    if (!success) throw new Error('未能保存判定，请重试');
    setRevealed(roll);
    setNotice('');
    setModuleEditing(editor);
  };
  const continueWriting = () => {
    const pos = position();
    if (pos === undefined) return;
    editor.chain().focus().command(({ tr, dispatch }) => {
      const end = pos + node.nodeSize;
      const next = tr.doc.nodeAt(end);
      if (next?.isTextblock) {
        if (dispatch) tr.setSelection(TextSelection.create(tr.doc, end + 1));
        return true;
      }
      const parent = tr.doc.resolve(end);
      const paragraph = editor.schema.nodes.paragraph;
      if (!parent.parent.canReplaceWith(parent.index(), parent.index(), paragraph)) return false;
      if (dispatch) {
        closeHistory(tr);
        tr.insert(end, paragraph.create());
        tr.setSelection(TextSelection.create(tr.doc, end + 1));
      }
      return true;
    }).run();
  };
  const action = (id: string) => {
    if (id === 'copy') {
      void copyText(storyRollLines(card).join('\n')).then(() => setNotice('已复制判定')).catch(reason => setNotice(String(reason)));
      return;
    }
    const pos = position();
    if (pos === undefined) return;
    if (id === 'edit' && !card.result) setModuleEditing(editor, card.id);
    if (id === 'duplicate') {
      const copy = storyRollNode({ ...card, id: crypto.randomUUID(), result: null });
      editor.chain().command(({ tr }) => { closeHistory(tr); return true; }).insertContentAt(pos + node.nodeSize, copy, { updateSelection: false }).run();
    }
    if (id === 'delete') {
      editor.chain().command(({ tr }) => { closeHistory(tr); return true; }).deleteRange({ from: pos, to: pos + node.nodeSize }).run();
    }
  };
  return <NodeViewWrapper as="section" className="story-roll" data-vana-module="storyRoll" data-module-editing={editing} contentEditable={false} tabIndex={0}>
    <div ref={setHost} className="story-roll-body" data-module-editing={editing}>
      <header><span><Dice5 size={16} aria-hidden="true" />剧情判定</span><span className="story-roll-die">1D100</span></header>
      {state.editable && host && <ModuleMenu host={host} label="剧情判定" items={[
        ...(!card.result ? [{ id: 'edit', label: '编辑判定表', icon: Pencil }] : []),
        { id: 'copy', label: '复制文字', icon: Copy },
        { id: 'duplicate', label: '复制为新判定', icon: Files },
        { id: 'delete', label: '删除判定卡', icon: Trash2, danger: true, separator: true },
      ]} onAction={action} />}
      {editing ? <StoryRollForm card={card} onSave={save} onCancel={() => setModuleEditing(editor)} /> : <>
        {card.question && <p className="story-roll-question">{card.question}</p>}
        {card.result && <div className="story-roll-result" data-revealed={revealed} role="status">
          <span className="story-roll-value"><span>掷出</span><strong>{card.result.value}</strong></span>
          <span>{card.result.text}</span>
        </div>}
        {card.question && <Disclosure title="查看判定表" className="story-roll-table">
          <ul>{card.outcomes.map(row => <li key={row.from} data-hit={card.result && card.result.value >= row.from && card.result.value <= row.to}>
            <span>{rangeText(row)}</span><span>{row.text}</span>
          </li>)}</ul>
        </Disclosure>}
        {state.editable && <div className="story-roll-actions">
          {card.result
            ? <button type="button" className="ui-button ui-button-quiet" onClick={continueWriting}><ArrowDown size={16} />继续写作</button>
            : card.question
              ? <button type="button" className="ui-button ui-button-primary" onClick={() => { try { save(card, true); } catch (reason) { setNotice(String(reason)); } }}><Dice5 size={16} />掷骰并记录</button>
              : <button type="button" className="ui-button ui-button-primary" onClick={() => setModuleEditing(editor, card.id)}><Pencil size={16} />设置判定</button>}
        </div>}
      </>}
      {notice && <p className="module-notice" role="status">{notice}</p>}
    </div>
  </NodeViewWrapper>;
}

export const StoryRollBlock = Node.create({
  name: 'storyRoll',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return { id: { default: null }, question: { default: '' }, outcomes: { default: [] }, result: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'section[data-vana-story-roll]', getAttrs: element => {
      try {
        const raw = element.getAttribute('data-vana-story-roll') ?? '';
        if (raw.length > 60_000) return false;
        const card = readStoryRoll({ type: 'storyRoll', attrs: JSON.parse(raw) });
        return { ...card, id: crypto.randomUUID() };
      } catch { return false; }
    } }];
  },
  renderHTML({ node }) {
    const card = readStoryRoll(node.toJSON());
    return ['section', { 'data-vana-story-roll': JSON.stringify(card) }, ...storyRollLines(card).map(line => ['p', {}, line])];
  },
  renderText({ node }) { return storyRollText(node.toJSON()); },
  addNodeView() { return ReactNodeViewRenderer(StoryRollView); },
});
