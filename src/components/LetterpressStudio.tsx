import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AlignCenter, AlignLeft, AlignRight, ArrowDownToLine, Check, Droplets, Flame, FolderOpen, Image, Loader2, MousePointer2, Redo2, RotateCcw, Save, Scissors, Share2, Sparkles, Trash2, Undo2, FilePlus2, X } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { getThemeAccentColor, getThemeBorderColor, getThemeSurfaceColor, getThemeTextColor, getThemeBgColor } from '@/lib/themeStyles';
import { useDialogFocus } from '@/lib/useDialogFocus';
import { FONTS, FORMATS, MATERIALS, MAX_MARKS, MAX_TEXT, createMark, markLabel, parseLetter, type LetterDesign, type LetterMark, type MarkKind } from '@/lib/letterpress/model';
import { loadLetterFonts, renderLetter, type LetterLayout } from '@/lib/letterpress/render';
import { exportLetter, saveLetterRecipe } from '@/lib/letterpress/export';
import { markPosition } from '@/lib/letterpress/gesture';
import './letterpress.css';

const icons = { blood: Droplets, burn: Flame, tear: Scissors, stain: Droplets };
const kinds: MarkKind[] = ['blood', 'burn', 'tear', 'stain'];
const tabs = [
  { id: 'surface', label: '介质' },
  { id: 'text', label: '文字' },
  { id: 'marks', label: '痕迹' },
] as const;
type History = { past: LetterDesign[]; current: LetterDesign; future: LetterDesign[] };

function Range({ label, value, min, max, step = 1, unit = '', onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void;
}) {
  return <label className="lp-range"><span>{label}<output>{Number(value.toFixed(2))}{unit}</output></span><input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} /></label>;
}

export default function LetterpressStudio({ initial, android, onClose, onBusyChange, onApply, updating = false }: {
  onApply?: (design: LetterDesign) => Promise<void>; updating?: boolean;
  initial: LetterDesign; android: boolean; onClose: (design: LetterDesign) => void; onBusyChange: (busy: boolean) => void;
}) {
  const { theme } = useTheme();
  const [history, setHistory] = useState<History>(() => ({ past: [], current: initial, future: [] }));
  const d = history.current;
  const [tab, setTab] = useState<'text' | 'surface' | 'marks'>('surface');
  const [tool, setTool] = useState<MarkKind | null>(null), [selected, setSelected] = useState<string | null>(null);
  const [layout, setLayout] = useState<LetterLayout | null>(null), [rendering, setRendering] = useState(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [gesture, setGesture] = useState<{ x: number; y: number; ex: number; ey: number } | null>(null);
  const gestureRef = useRef<{ id: number; kind: MarkKind; x: number; y: number; ex: number; ey: number } | null>(null);
  const dialog = useRef<HTMLDivElement>(null), close = useRef<HTMLButtonElement>(null), canvas = useRef<HTMLCanvasElement>(null), file = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false), alive = useRef(true), current = useRef(d), changeGroup = useRef<string | null>(null);
  current.current = d;
  const dismiss = useCallback(() => { if (!busyRef.current) onClose(current.current); }, [onClose]);
  useDialogFocus(dialog, close, dismiss);
  useEffect(() => { alive.current = true; return () => { alive.current = false; onBusyChange(false); }; }, [onBusyChange]);

  const commit = useCallback((update: (previous: LetterDesign) => LetterDesign, group?: string) => {
    const combine = !!group && group === changeGroup.current;
    changeGroup.current = group ?? null;
    setHistory(h => ({ past: combine ? h.past : [...h.past.slice(-39), h.current], current: update(h.current), future: [] }));
    setError(''); setNotice('');
  }, []);
  const patch = (value: Partial<LetterDesign>, group?: string) => commit(previous => ({ ...previous, ...value }), group);
  const undo = () => {
    changeGroup.current = null;
    setHistory(h => h.past.length ? { past: h.past.slice(0, -1), current: h.past.at(-1)!, future: [h.current, ...h.future] } : h);
    setSelected(null); setError(''); setNotice('');
  };
  const redo = () => {
    changeGroup.current = null;
    setHistory(h => h.future.length ? { past: [...h.past, h.current], current: h.future[0], future: h.future.slice(1) } : h);
    setSelected(null); setError(''); setNotice('');
  };
  useEffect(() => {
    let cancelled = false;
    setRendering(true);
    const timer = window.setTimeout(() => {
      void loadLetterFonts(d.font).then(() => {
        if (!cancelled && canvas.current) { setLayout(renderLetter(canvas.current, d, 720, { transparentBackground: true })); setRendering(false); }
      }).catch(() => {
        if (!cancelled) { setError('字体或画面加载失败，请重新打开信稿后重试'); setRendering(false); setLayout(null); }
      });
    }, 65);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [d]);

  const mark = d.marks.find(m => m.id === selected);
  const updateMark = (value: Partial<LetterMark>, group: string) => {
    if (mark) commit(previous => ({ ...previous, marks: previous.marks.map(m => m.id === mark.id ? { ...m, ...value } : m) }), `mark-${mark.id}-${group}`);
  };
  const cancelGesture = useCallback(() => {
    const g = gestureRef.current;
    gestureRef.current = null;
    setGesture(null);
    if (g && canvas.current?.hasPointerCapture(g.id)) canvas.current.releasePointerCapture(g.id);
  }, []);
  const finish = useCallback((event: globalThis.PointerEvent) => {
    const g = gestureRef.current, surface = canvas.current;
    if (!g || g.id !== event.pointerId) return;
    // Clear before committing. Resizing/redrawing a canvas can drop pointer capture.
    cancelGesture();
    if (!surface || busyRef.current) return;
    const end = markPosition(event.clientX, event.clientY, surface.getBoundingClientRect());
    if (!end) return;
    const design = current.current;
    if (design.marks.length >= MAX_MARKS) return;
    const [width, height] = FORMATS[design.format];
    const dx = (end.x - g.x) * width, dy = (end.y - g.y) * height;
    const distance = Math.hypot(dx, dy);
    const next = createMark(g.kind, g.x, g.y,
      distance > 14 ? Math.atan2(dy, dx) * 180 / Math.PI : 35,
      distance > 14 ? Math.max(.06, Math.min(.65, distance / width)) : .2);
    commit(previous => ({ ...previous, marks: [...previous.marks, next] }));
    setSelected(next.id);
  }, [cancelGesture, commit]);
  useEffect(() => {
    const cancel = () => cancelGesture();
    const visibility = () => { if (document.hidden) cancel(); };
    window.addEventListener('pointerup', finish, true);
    window.addEventListener('pointercancel', cancel, true);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', cancel, true);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', visibility);
      gestureRef.current = null;
    };
  }, [finish, cancelGesture]);
  useEffect(() => { cancelGesture(); }, [tool, d.material, d.format, busy, cancelGesture]);
  const perform = async (action: 'png' | 'share' | 'recipe' | 'embed') => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); onBusyChange(true); setError(''); setNotice('');
    let applied = false;
    try {
      if (action === 'embed') {
        if (!onApply) return;
        await onApply(d); applied = true;
      } else {
      const path = action === 'recipe' ? await saveLetterRecipe(d, android) : await exportLetter(d, action === 'share');
      if (alive.current) setNotice(action === 'share' ? '已打开系统分享'
        : action === 'recipe' && android ? '已打开信稿文件分享，可保存到文件应用'
          : path ? `已保存：${path}` : action === 'recipe' ? '信稿文件已下载，可再次打开继续制作' : 'PNG 图片已下载');
      }
    } catch (e) { if (alive.current) setError(`未能${action === 'share' ? '分享' : action === 'embed' ? '更新文档' : '保存'}：${e instanceof Error ? e.message : String(e)}`); }
    finally { busyRef.current = false; onBusyChange(false); if (alive.current) setBusy(false); }
    if (applied && alive.current) onClose(d);
  };
  const importRecipe = async (input: HTMLInputElement) => {
    const selectedFile = input.files?.[0];
    if (!selectedFile) return;
    try {
      if (selectedFile.size > 300000) throw new Error('文件过大，请选择 Vana 保存的信稿 JSON 文件');
      const imported = parseLetter(await selectedFile.text());
      if (alive.current) { commit(() => imported); setSelected(null); setTool(null); setNotice('信稿已打开；可撤销回到打开前的画面'); }
    } catch (e) { if (alive.current) setError(`打开失败：${e instanceof Error ? e.message : String(e)}`); }
    finally { input.value = ''; }
  };
  const style = { '--lp-bg': getThemeBgColor(theme), '--lp-panel': getThemeSurfaceColor(theme), '--lp-line': getThemeBorderColor(theme), '--lp-ink': getThemeTextColor(theme), '--lp-accent': getThemeAccentColor(theme) } as CSSProperties;
  const [w, h] = FORMATS[d.format];
  const invalidText = d.text.length > MAX_TEXT;
  const ready = !busy && !rendering && layout && !layout.overflow && !invalidText;

  return createPortal(<div className="lp-backdrop" style={style}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="lp-title" tabIndex={-1} className="lp-studio">
      <header className="lp-header">
        <div className="lp-brand"><span className="lp-stamp"><Sparkles size={20} /></span><div><p>VANA · 文字工坊</p><h2 id="lp-title">文字冲印与信稿</h2></div></div>
        <div className="lp-header-actions"><button disabled={busy} onClick={() => file.current?.click()} title="打开信稿 JSON" aria-label="打开信稿"><FolderOpen size={16} /><span>打开信稿</span></button><button disabled={busy || invalidText} onClick={() => void perform('recipe')} title="保存信稿" aria-label="保存信稿"><Save size={16} /><span>保存信稿</span></button><button ref={close} disabled={busy} onClick={dismiss} aria-label="关闭文字工坊"><X size={20} /></button></div>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={e => void importRecipe(e.currentTarget)} />
      </header>
      <div className="lp-workspace">
        <section className="lp-stage" aria-label="信稿预览">
          <div className="lp-stage-toolbar"><span>{MATERIALS[d.material].name}</span><div><button disabled={busy || !history.past.length} onClick={undo} aria-label="撤销信稿修改"><Undo2 size={16} /></button><button disabled={busy || !history.future.length} onClick={redo} aria-label="重做信稿修改"><Redo2 size={16} /></button><span>{w} × {h}</span></div></div>
          <div className="lp-artboard" style={{ '--lp-ratio': `${w} / ${h}` } as CSSProperties}>
            <canvas ref={canvas} aria-label={`${MATERIALS[d.material].name}信稿预览。${tool ? `已选择${markLabel(tool, d.material)}，点击放置或拖动设置方向` : '选择痕迹工具后，可在画面上放置'}`} className={tool ? 'lp-canvas lp-painting' : 'lp-canvas'}
              onPointerDown={event => {
                if (!tool || busy || event.button !== 0 || !event.isPrimary) return;
                if (d.marks.length >= MAX_MARKS) { setError(`最多放置 ${MAX_MARKS} 层痕迹，请先删除一层`); return; }
                event.preventDefault();
                cancelGesture();
                const p = markPosition(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
                if (!p) return;
                gestureRef.current = { id: event.pointerId, kind: tool, ...p, ex: p.x, ey: p.y }; setGesture({ ...p, ex: p.x, ey: p.y }); event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={event => {
                const g = gestureRef.current;
                if (!g || event.pointerId !== g.id) return;
                if (event.pointerType === 'mouse' && event.buttons === 0) { cancelGesture(); return; }
                const p = markPosition(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
                if (!p) { cancelGesture(); return; }
                g.ex = p.x; g.ey = p.y; setGesture({ x: g.x, y: g.y, ex: p.x, ey: p.y });
              }} onLostPointerCapture={cancelGesture} onPointerCancel={cancelGesture}
              onContextMenu={event => { if (tool) event.preventDefault(); cancelGesture(); }} />
            {gesture && <svg className="lp-placement" viewBox={`0 0 ${w} ${h}`} aria-hidden="true"><circle cx={gesture.x * w} cy={gesture.y * h} r="13" /><path d={`M${gesture.x * w},${gesture.y * h} L${gesture.ex * w},${gesture.ey * h}`} /></svg>}
          </div>
          <p className="lp-stage-hint">{tool ? `在画面上放置${markLabel(tool, d.material)}，拖动决定方向与范围` : '从一张卡片，做到一封有故事的信。'}</p>
        </section>
        <aside className="lp-controls" aria-label="信稿制作选项">
          <div className="lp-tabs" role="tablist" aria-label="制作步骤">
            {tabs.map((t, index) => (
              <button key={t.id} id={`lp-tab-${t.id}`} role="tab" tabIndex={tab === t.id ? 0 : -1}
                aria-selected={tab === t.id} aria-controls={`lp-panel-${t.id}`} onClick={() => setTab(t.id)}
                onKeyDown={event => {
                  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
                    : event.key === 'ArrowRight' ? (index + 1) % tabs.length
                      : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : -1;
                  if (next < 0) return;
                  event.preventDefault();
                  setTab(tabs[next].id);
                  document.getElementById(`lp-tab-${tabs[next].id}`)?.focus();
                }}>{t.label}</button>
            ))}
          </div>
          <fieldset disabled={busy} className="lp-control-body" id={`lp-panel-${tab}`} role="tabpanel" aria-labelledby={`lp-tab-${tab}`}>
            {tab === 'surface' && <>
              <div className="lp-section-heading"><h3>文字落在哪里？</h3><p>{MATERIALS[d.material].note}</p></div>
              <div className="lp-materials">{Object.entries(MATERIALS).map(([id, material]) => <button type="button" key={id} aria-pressed={d.material === id} onClick={() => patch({ material: id as LetterDesign['material'] })} className="lp-material"><span aria-hidden="true" className={`lp-material-swatch lp-swatch-${id}`} style={{ background: material.color, color: material.ink }}>字</span><span>{material.name}</span>{d.material === id && <Check size={14} />}</button>)}</div>
              <div className="lp-divider" />
              <label className="lp-field">画幅<select value={d.format} onChange={e => patch({ format: e.target.value as LetterDesign['format'] })}><option value="portrait">信纸 · 3:4</option><option value="square">方笺 · 1:1</option><option value="tall">长幅 · 9:16</option></select></label>
              <Range label="文字留白" min={60} max={160} value={d.inset} onChange={inset => patch({ inset }, 'inset')} />
              <button className="lp-subtle" onClick={() => patch({ seed: crypto.getRandomValues(new Uint32Array(1))[0] })}><RotateCcw size={14} />换一道纹理</button>
            </>}
            {tab === 'text' && <>
              <div className="lp-section-heading"><h3>写给谁，留给谁。</h3><p>调整完成后，插入文档或保存对原信稿的修改。</p></div>
              <label className="lp-field">标题<input maxLength={120} value={d.title} onChange={e => patch({ title: e.target.value }, 'title')} /></label>
              <label className="lp-field">正文<textarea aria-label="正文" rows={7} value={d.text} onChange={e => patch({ text: e.target.value }, 'text')} placeholder="写下你想留下的话…" /><small>{d.text.length.toLocaleString()} 字符</small></label>
              <label className="lp-field">落款<input value={d.signature} maxLength={120} onChange={e => patch({ signature: e.target.value }, 'signature')} placeholder="署名、日期，或者留白" /></label>
              <div className="lp-divider" />
              <label className="lp-field">字体<select value={d.font} onChange={e => patch({ font: e.target.value as LetterDesign['font'] })}>{Object.entries(FONTS).map(([id, f]) => <option key={id} value={id}>{f.name}</option>)}</select></label>
              <Range label="字号" min={22} max={60} value={d.fontSize} onChange={fontSize => patch({ fontSize }, 'fontSize')} />
              <Range label="行距" min={1.3} max={2.4} step={.05} value={d.lineHeight} onChange={lineHeight => patch({ lineHeight }, 'lineHeight')} />
              <div className="lp-align" aria-label="文字对齐">{([{ id: 'left', name: '左对齐', Icon: AlignLeft }, { id: 'center', name: '居中', Icon: AlignCenter }, { id: 'right', name: '右对齐', Icon: AlignRight }] as const).map(({ id, name, Icon }) => <button key={id} aria-label={name} aria-pressed={d.align === id} onClick={() => patch({ align: id })}><Icon size={17} /></button>)}</div>
            </>}
            {tab === 'marks' && <>
              <div className="lp-section-heading"><h3>让它经历一点什么。</h3><p>{d.material === 'terminal' ? '血滴留在玻璃上，损毁呈现为灼痕与碎屏。' : d.material === 'stone' ? '血色沿凹面沉积，撕裂变为石材崩裂。' : d.material === 'arcane' ? '血迹、焦边与裂隙，留在符文之间。' : '纸张会吸收液体，也会留下真正的缺口。'}</p></div>
              <div className="lp-tools"><button aria-pressed={!tool} onClick={() => setTool(null)}><MousePointer2 size={17} />浏览</button>{kinds.map(kind => { const Icon = icons[kind]; return <button key={kind} aria-pressed={tool === kind} onClick={() => setTool(tool === kind ? null : kind)}><Icon size={17} />{markLabel(kind, d.material)}</button>; })}</div>
              {tool && <button className="lp-add" disabled={d.marks.length >= MAX_MARKS} onClick={() => { const next = createMark(tool, .72, .72); commit(p => ({ ...p, marks: [...p.marks, next] })); setSelected(next.id); }}>添加一处{markLabel(tool, d.material)}</button>}
              <p className="lp-caption">可点按画面，或用“添加”按钮放置后调整。切换介质会保留每一层的位置。</p>
              <div className="lp-divider" />
              <div className="lp-layer-heading"><h3>留下的痕迹</h3><span>{d.marks.length} / {MAX_MARKS}</span></div>
              {d.marks.length ? <div className="lp-layers">{[...d.marks].reverse().map((m, i) => { const Icon = icons[m.kind]; return <div key={m.id}><button aria-pressed={selected === m.id} onClick={() => setSelected(m.id)}><Icon size={14} />{markLabel(m.kind, d.material)}<small>{d.marks.length - i}</small></button><button aria-label={`删除痕迹 ${d.marks.length - i}`} onClick={() => { patch({ marks: d.marks.filter(item => item.id !== m.id) }); if (selected === m.id) setSelected(null); }}><Trash2 size={14} /></button></div>; })}</div> : <p className="lp-empty">还没有痕迹。完整的纸，也能装下一段故事。</p>}
              {mark && <div className="lp-mark-settings">
                {mark.kind === 'blood' && <label className="lp-field">血迹方式<select value={mark.pattern} onChange={e => updateMark({ pattern: e.target.value as LetterMark['pattern'] }, 'pattern')}><option value="spray">定向溅射</option><option value="drops">滴落</option><option value="smear">擦抹</option></select></label>}
                <Range label="横向位置" min={0} max={100} value={mark.x * 100} unit="%" onChange={x => updateMark({ x: x / 100 }, 'x')} /><Range label="纵向位置" min={0} max={100} value={mark.y * 100} unit="%" onChange={y => updateMark({ y: y / 100 }, 'y')} /><Range label="范围" min={4} max={65} value={mark.size * 100} unit="%" onChange={size => updateMark({ size: size / 100 }, 'size')} /><Range label="方向" min={-180} max={180} value={mark.angle} unit="°" onChange={angle => updateMark({ angle }, 'angle')} /><Range label="浓度" min={10} max={100} value={mark.strength * 100} unit="%" onChange={strength => updateMark({ strength: strength / 100 }, 'strength')} /><button className="lp-subtle" onClick={() => updateMark({ seed: crypto.getRandomValues(new Uint32Array(1))[0] }, 'seed')}><RotateCcw size={14} />换一种形状</button>
                <div className="lp-layer-order">{([-1, 1] as const).map(direction => <button key={direction} disabled={d.marks.findIndex(m => m.id === mark.id) + direction < 0 || d.marks.findIndex(m => m.id === mark.id) + direction >= d.marks.length} onClick={() => commit(previous => {
                  const marks = [...previous.marks], index = marks.findIndex(m => m.id === mark.id), target = index + direction;
                  if (index < 0 || target < 0 || target >= marks.length) return previous;
                  [marks[index], marks[target]] = [marks[target], marks[index]];
                  return { ...previous, marks };
                })}>{direction === 1 ? '上移一层' : '下移一层'}</button>)}</div>
              </div>}
            </>}
          </fieldset>
        </aside>
      </div>
      <footer className="lp-footer"><div className="lp-feedback" aria-live="polite">
        {error ? <p role="alert" className="lp-error">{error}</p> : invalidText ? <p role="alert" className="lp-error">文字超过 {MAX_TEXT.toLocaleString()} 字符，请选取一个片段制作。</p> : layout?.overflow ? <p role="alert" className="lp-error">文字超出画面，请减少文字、缩小字号或改用长幅后导出。</p> : notice ? <p>{notice}</p> : <p>{rendering ? '正在显影…' : 'PNG 图片 · 本地制作'}<span className="lp-footer-note">保存信稿，下次接着制作。</span></p>}
      </div><div className="lp-export-actions">
        {onApply && <button className="lp-primary" disabled={!ready} onClick={() => void perform('embed')}><FilePlus2 size={16} />{updating ? '保存到文档' : '插入文档'}</button>}
        {android
          ? <button disabled={!ready} onClick={() => void perform('share')}><Share2 size={16} />分享图片</button>
          : <button disabled={!ready} onClick={() => void perform('png')}><ArrowDownToLine size={16} /><span>保存 PNG</span></button>}
        {!android && <span className="lp-export-icon" aria-hidden="true">{busy ? <Loader2 size={18} className="animate-spin" /> : <Image size={18} />}</span>}
      </div></footer>
    </div>
  </div>, document.body);
}
