import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AlignCenter, AlignLeft, AlignRight, ArrowDownToLine, Check, Dice5, Droplets, Flame, FolderOpen, Layers, Loader2, MousePointer2, Redo2, RotateCcw, Save, Scissors, Share2, Sparkles, Trash2, Undo2, FilePlus2, X, Ellipsis, ScrollText, Type, RectangleVertical, Square, GalleryVerticalEnd, MoveUp, MoveDown } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { getThemeAccentColor, getThemeBorderColor, getThemeSurfaceColor, getThemeTextColor, getThemeBgColor } from '@/lib/themeStyles';
import { useDialogFocus } from '@/lib/useDialogFocus';
import { FONTS, FORMATS, MATERIALS, MAX_MARKS, MAX_TEXT, createMark, markLabel, parseLetter, type LetterDesign, type LetterMark, type MarkKind } from '@/lib/letterpress/model';
import { loadLetterFonts, renderLetter, type LetterLayout } from '@/lib/letterpress/render';
import { exportLetter, saveLetterRecipe } from '@/lib/letterpress/export';
import { markPosition } from '@/lib/letterpress/gesture';
import { letterStyle } from '@/lib/textPlugins/styles';
import { LETTER_LOCKS, rollLetter, type LetterLocks } from '@/lib/textPlugins/dice';
import { DiceLocks, TextStylePresets } from './TextStylePresets';
import { StudioCanvas } from './StudioCanvas';
import { StudioInspector } from './StudioInspector';
import { SelectField } from './SelectField';
import { ActionMenu } from './ActionMenu';
import { usePresence } from '@/lib/usePresence';
import { useKeyboardInset } from '@/lib/useKeyboardInset';
import './letterpress.css';

const icons = { blood: Droplets, burn: Flame, tear: Scissors, stain: Droplets };
const kinds: MarkKind[] = ['blood', 'burn', 'tear', 'stain'];
const tabs = [
  { id: 'surface', label: '介质', icon: Layers },
  { id: 'text', label: '文字', icon: Type },
  { id: 'marks', label: '痕迹', icon: Droplets },
  { id: 'play', label: '预设', icon: Dice5 },
] as const;
type History = { past: LetterDesign[]; current: LetterDesign; future: LetterDesign[] };

function Range({ label, value, min, max, step = 1, unit = '', onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void;
}) {
  return <label className="lp-range"><span>{label}<output>{Number(value.toFixed(2))}{unit}</output></span><input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} /></label>;
}

export default function LetterpressStudio({ initial, android, accountScope, onClose, onBusyChange, onApply, updating = false, open = true }: {
  open?: boolean; onApply?: (design: LetterDesign) => Promise<void>; updating?: boolean;
  initial: LetterDesign; android: boolean; accountScope: string; onClose: (design: LetterDesign) => void; onBusyChange: (busy: boolean) => void;
}) {
  const { theme } = useTheme();
  const present = usePresence(open), keyboardInset = useKeyboardInset(open && android);
  const [inspectorOpen, setInspectorOpen] = useState(false), [fileMenu, setFileMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [textPage, setTextPage] = useState<'content' | 'style'>('content');
  const [surfacePage, setSurfacePage] = useState<'material' | 'page'>('material');
  const [markPage, setMarkPage] = useState<'tools' | 'layers' | 'adjust'>('tools');
  const [playPage, setPlayPage] = useState<'presets' | 'dice'>('presets');
  const wasOpen = useRef(false);
  useLayoutEffect(() => {
    if (open && !wasOpen.current) { setHistory({ past: [], current: initial, future: [] }); setInspectorOpen(false); setSelected(null); setTool(null); }
    wasOpen.current = open;
  }, [open, initial]);
  const [history, setHistory] = useState<History>(() => ({ past: [], current: initial, future: [] }));
  const d = history.current;
  const [tab, setTab] = useState<typeof tabs[number]['id']>('surface');
  const [locks, setLocks] = useState<LetterLocks>({ format: true });
  const [tool, setTool] = useState<MarkKind | null>(null), [selected, setSelected] = useState<string | null>(null);
  const [layout, setLayout] = useState<LetterLayout | null>(null), [rendering, setRendering] = useState(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [gesture, setGesture] = useState<{ x: number; y: number; ex: number; ey: number } | null>(null);
  const gestureRef = useRef<{ id: number; kind: MarkKind; x: number; y: number; ex: number; ey: number } | null>(null);
  const dialog = useRef<HTMLDivElement>(null), close = useRef<HTMLButtonElement>(null), canvas = useRef<HTMLCanvasElement>(null), file = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false), alive = useRef(true), current = useRef(d), changeGroup = useRef<string | null>(null);
  current.current = d;
  const dismiss = useCallback(() => { if (!busyRef.current) onClose(current.current); }, [onClose]);
  useDialogFocus(dialog, close, () => { if (inspectorOpen) setInspectorOpen(false); else dismiss(); }, open);
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
    if (!open) return;
    let cancelled = false;
    setRendering(true);
    const timer = window.setTimeout(() => {
      void loadLetterFonts(d.font).then(() => {
        if (!cancelled && canvas.current) { setLayout(renderLetter(canvas.current, d, 1080, { transparentBackground: true })); setRendering(false); }
      }).catch(() => {
        if (!cancelled) { setError('字体或画面加载失败，请重新打开信稿后重试'); setRendering(false); setLayout(null); }
      });
    }, 65);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [d, open]);

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
    setSelected(next.id); setTab('marks'); setMarkPage('adjust');
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
  const style = { '--lp-keyboard-inset': `${keyboardInset}px`, '--lp-bg': getThemeBgColor(theme), '--lp-panel': getThemeSurfaceColor(theme), '--lp-line': getThemeBorderColor(theme), '--lp-ink': getThemeTextColor(theme), '--lp-accent': getThemeAccentColor(theme) } as CSSProperties;
  const [w, h] = FORMATS[d.format];
  const invalidText = d.text.length > MAX_TEXT;
  const ready = !busy && !rendering && layout && !layout.overflow && !invalidText;

  const addMark = () => {
    if (!tool || d.marks.length >= MAX_MARKS) return;
    const next = createMark(tool, .65, .65);
    commit(p => ({ ...p, marks: [...p.marks, next] })); setSelected(next.id); setMarkPage('adjust');
  };
  const switchTab = (next: typeof tab) => { setTab(next); setInspectorOpen(tab !== next || !inspectorOpen); };
  if (!present) return null;
  return createPortal(<div className="lp-backdrop" style={style} data-open={open} inert={!open}>
    <div ref={dialog} role={open ? 'dialog' : undefined} aria-modal={open ? true : undefined} aria-labelledby="lp-title" tabIndex={-1} className="lp-studio" aria-busy={busy}>
      <header className="lp-header">
        <div className="lp-brand"><ScrollText size={20} aria-hidden="true" /><h2 id="lp-title">文字工坊</h2></div>
        <div className="lp-header-actions">
          <button type="button" disabled={busy || !history.past.length} onClick={undo} aria-label="撤销信稿修改"><Undo2 size={18} /></button>
          <button type="button" disabled={busy || !history.future.length} onClick={redo} aria-label="重做信稿修改"><Redo2 size={18} /></button>
          <button ref={menuButton} type="button" disabled={busy} aria-label="信稿文件操作" aria-haspopup="menu" aria-expanded={fileMenu} onClick={() => setFileMenu(x => !x)}><Ellipsis size={20} /></button>
          <button ref={close} type="button" disabled={busy} onClick={dismiss} aria-label="关闭文字工坊"><X size={20} /></button>
        </div>
        <ActionMenu open={fileMenu && open} anchor={menuButton.current} label="信稿文件操作" onClose={() => setFileMenu(false)} items={[
          { id: 'open', label: '打开信稿', icon: FolderOpen }, { id: 'recipe', label: '保存信稿文件', icon: Save, disabled: invalidText },
          { id: android ? 'share' : 'png', label: android ? '分享图片' : '保存 PNG', icon: android ? Share2 : ArrowDownToLine, disabled: !ready, separator: true },
        ]} onAction={action => { if (action === 'open') file.current?.click(); else void perform(action as 'recipe' | 'share' | 'png'); }} focusFirst />
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={e => void importRecipe(e.currentTarget)} />
      </header>
      <div className="lp-workspace">
        <StudioCanvas ratio={w / h} drawing={!!tool} cancelDrawing={cancelGesture} label={tool ? markLabel(tool, d.material) : MATERIALS[d.material].name}>
          <canvas ref={canvas} aria-label={`${MATERIALS[d.material].name}信稿预览${tool ? `，点击或拖动放置${markLabel(tool, d.material)}` : '，双指缩放，放大后可拖动查看'}`} className={tool ? 'lp-canvas lp-painting' : 'lp-canvas'}
            onPointerDown={event => {
              if (!tool || busy || event.button !== 0 || !event.isPrimary) return;
              if (d.marks.length >= MAX_MARKS) { setError(`最多放置 ${MAX_MARKS} 层痕迹，请先删除一层`); return; }
              event.preventDefault(); cancelGesture();
              const p = markPosition(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
              if (!p) return;
              gestureRef.current = { id: event.pointerId, kind: tool, ...p, ex: p.x, ey: p.y }; setGesture({ ...p, ex: p.x, ey: p.y }); event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={event => {
              const g = gestureRef.current; if (!g || event.pointerId !== g.id) return;
              if (event.pointerType === 'mouse' && event.buttons === 0) { cancelGesture(); return; }
              const p = markPosition(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
              if (!p) { cancelGesture(); return; }
              g.ex = p.x; g.ey = p.y; setGesture({ x: g.x, y: g.y, ex: p.x, ey: p.y });
            }} onLostPointerCapture={cancelGesture} onPointerCancel={cancelGesture}
            onContextMenu={event => { if (tool) event.preventDefault(); cancelGesture(); }} />
          {gesture && <svg className="lp-placement" viewBox={`0 0 ${w} ${h}`} aria-hidden="true"><circle cx={gesture.x * w} cy={gesture.y * h} r="13" /><path d={`M${gesture.x * w},${gesture.y * h} L${gesture.ex * w},${gesture.ey * h}`} /></svg>}
        </StudioCanvas>
        <div className="lp-feedback" aria-live="polite">
          {error ? <p role="alert" className="lp-error">{error}</p> : invalidText ? <p role="alert" className="lp-error">文字超过 {MAX_TEXT.toLocaleString()} 字符</p> : layout?.overflow ? <button type="button" onClick={() => { setTab('text'); setTextPage('style'); setInspectorOpen(true); }}>文字超出画面，调整字号或画幅</button> : notice ? <p>{notice}</p> : rendering ? <p><Loader2 size={14} className="animate-spin" />正在显影…</p> : tool ? <button type="button" onClick={() => setTool(null)}><MousePointer2 size={14} />结束放置{markLabel(tool, d.material)}</button> : null}
        </div>
        <StudioInspector open={inspectorOpen} onOpenChange={setInspectorOpen}>
          <div className="lp-tabs" role="tablist" aria-label="制作选项">
            {tabs.map((t, index) => <button key={t.id} id={`lp-tab-${t.id}`} type="button" role="tab" tabIndex={tab === t.id ? 0 : -1} aria-selected={tab === t.id} aria-controls={`lp-panel-${t.id}`} onClick={() => setTab(t.id)}
              onKeyDown={event => {
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : -1;
                if (next < 0) return; event.preventDefault(); setTab(tabs[next].id); document.getElementById(`lp-tab-${tabs[next].id}`)?.focus();
              }}><t.icon size={15} />{t.label}</button>)}
          </div>
          <fieldset disabled={busy || !open} className="lp-control-body" id={`lp-panel-${tab}`} role="tabpanel" aria-labelledby={`lp-tab-${tab}`} key={tab}>
            {tab === 'surface' && <>
              <div className="lp-subtabs" aria-label="介质调整">{(['material', 'page'] as const).map((page, i) => <button key={page} type="button" aria-pressed={surfacePage === page} onClick={() => setSurfacePage(page)}>{i ? '画幅与留白' : '介质'}</button>)}</div>
              {surfacePage === 'material' ? <><div className="lp-materials">{Object.entries(MATERIALS).map(([id, material]) => <button type="button" key={id} aria-pressed={d.material === id} onClick={() => patch({ material: id as LetterDesign['material'] })} className="lp-material"><span aria-hidden="true" className={`lp-material-swatch lp-swatch-${id}`} style={{ background: material.color, color: material.ink }}>字</span><span>{material.name}</span>{d.material === id && <Check size={14} />}</button>)}</div>
                <button type="button" className="lp-subtle" onClick={() => patch({ seed: crypto.getRandomValues(new Uint32Array(1))[0] })}><RotateCcw size={14} />换一道纹理</button></> : <>
                <label className="lp-field">画幅<SelectField label="信稿画幅" value={d.format} onChange={format => patch({ format: format as LetterDesign['format'] })} options={[
                  { value: 'portrait', label: '信纸 · 3:4', icon: RectangleVertical }, { value: 'square', label: '方笺 · 1:1', icon: Square }, { value: 'tall', label: '长幅 · 9:16', icon: GalleryVerticalEnd },
                ]} /></label>
                <Range label="文字留白" min={60} max={160} value={d.inset} onChange={inset => patch({ inset }, 'inset')} /></>}
            </>}
            {tab === 'text' && <>
              <div className="lp-subtabs" aria-label="文字调整">{(['content', 'style'] as const).map((page, i) => <button key={page} type="button" aria-pressed={textPage === page} onClick={() => setTextPage(page)}>{i ? '排版' : '内容'}</button>)}</div>
              {textPage === 'content' ? <div className="lp-text-fields">
                <label className="lp-field">标题<input maxLength={120} value={d.title} onChange={e => patch({ title: e.target.value }, 'title')} placeholder="标题（可留空）" /></label>
                <label className="lp-field lp-body-field">正文<textarea aria-label="信稿正文" rows={4} value={d.text} maxLength={MAX_TEXT} onChange={e => patch({ text: e.target.value }, 'text')} placeholder="写下你想留下的话…" /></label>
                <label className="lp-field">落款<input value={d.signature} maxLength={120} onChange={e => patch({ signature: e.target.value }, 'signature')} placeholder="署名或日期（可留空）" /></label>
              </div> : <>
                <label className="lp-field">字体<SelectField label="信稿字体" value={d.font} onChange={font => patch({ font: font as LetterDesign['font'] })} options={Object.entries(FONTS).map(([value, f]) => ({ value, label: f.name, icon: Type }))} /></label>
                <Range label="字号" min={22} max={60} value={d.fontSize} onChange={fontSize => patch({ fontSize }, 'fontSize')} />
                <Range label="行距" min={1.3} max={2.4} step={.05} value={d.lineHeight} onChange={lineHeight => patch({ lineHeight }, 'lineHeight')} />
                <div className="lp-align" aria-label="文字对齐">{([{ id: 'left', name: '左对齐', Icon: AlignLeft }, { id: 'center', name: '居中', Icon: AlignCenter }, { id: 'right', name: '右对齐', Icon: AlignRight }] as const).map(({ id, name, Icon }) => <button key={id} type="button" aria-label={name} aria-pressed={d.align === id} onClick={() => patch({ align: id })}><Icon size={17} /></button>)}</div>
              </>}
            </>}
            {tab === 'marks' && <>
              <div className="lp-subtabs" aria-label="痕迹调整">{(['tools', 'layers', 'adjust'] as const).map((page, i) => <button key={page} type="button" aria-pressed={markPage === page} onClick={() => setMarkPage(page)} disabled={page === 'adjust' && !mark}>{['放置', `图层 ${d.marks.length}`, '参数'][i]}</button>)}</div>
              {markPage === 'tools' && <>
                <div className="lp-tools"><button type="button" aria-pressed={!tool} onClick={() => { setTool(null); setInspectorOpen(false); }}><MousePointer2 size={18} />浏览</button>{kinds.map(kind => { const Icon = icons[kind]; return <button key={kind} type="button" aria-pressed={tool === kind} onClick={() => { setTool(kind); setInspectorOpen(false); }}><Icon size={18} />{markLabel(kind, d.material)}</button>; })}</div>
                <p className="lp-caption">选择痕迹后点按画面，或拖动决定方向与范围。双指可缩放画面。</p>
                {tool && <button type="button" className="lp-add" disabled={d.marks.length >= MAX_MARKS} onClick={addMark}><FilePlus2 size={16} />添加一处{markLabel(tool, d.material)}</button>}
              </>}
              {markPage === 'layers' && (d.marks.length ? <div className="lp-layers">{[...d.marks].reverse().map((m, i) => { const Icon = icons[m.kind]; return <div key={m.id}><button type="button" aria-pressed={selected === m.id} onClick={() => { setSelected(m.id); setMarkPage('adjust'); }}><Icon size={16} />{markLabel(m.kind, d.material)}<small>{d.marks.length - i}</small></button><button type="button" aria-label={`删除痕迹 ${d.marks.length - i}`} onClick={() => { patch({ marks: d.marks.filter(item => item.id !== m.id) }); if (selected === m.id) setSelected(null); }}><Trash2 size={16} /></button></div>; })}</div> : <p className="lp-empty">还没有痕迹。</p>)}
              {markPage === 'adjust' && mark && <div className="lp-mark-settings">
                {mark.kind === 'blood' && <label className="lp-field">血迹方式<SelectField label="血迹方式" value={mark.pattern} onChange={pattern => updateMark({ pattern: pattern as LetterMark['pattern'] }, 'pattern')} options={[
                  { value: 'spray', label: '定向溅射', icon: Sparkles }, { value: 'drops', label: '滴落', icon: Droplets }, { value: 'smear', label: '擦抹', icon: MousePointer2 },
                ]} /></label>}
                <div className="lp-range-grid"><Range label="横向位置" min={0} max={100} value={mark.x * 100} unit="%" onChange={x => updateMark({ x: x / 100 }, 'x')} /><Range label="纵向位置" min={0} max={100} value={mark.y * 100} unit="%" onChange={y => updateMark({ y: y / 100 }, 'y')} /><Range label="范围" min={4} max={65} value={mark.size * 100} unit="%" onChange={size => updateMark({ size: size / 100 }, 'size')} /><Range label="方向" min={-180} max={180} value={mark.angle} unit="°" onChange={angle => updateMark({ angle }, 'angle')} /><Range label="浓度" min={10} max={100} value={mark.strength * 100} unit="%" onChange={strength => updateMark({ strength: strength / 100 }, 'strength')} />
                <button type="button" className="lp-subtle" onClick={() => updateMark({ seed: crypto.getRandomValues(new Uint32Array(1))[0] }, 'seed')}><RotateCcw size={14} />换一种形状</button></div>
                <div className="lp-layer-order">{([-1, 1] as const).map(direction => <button key={direction} type="button" disabled={d.marks.findIndex(m => m.id === mark.id) + direction < 0 || d.marks.findIndex(m => m.id === mark.id) + direction >= d.marks.length} onClick={() => commit(previous => {
                  const marks = [...previous.marks], index = marks.findIndex(m => m.id === mark.id), target = index + direction;
                  if (index < 0 || target < 0 || target >= marks.length) return previous;
                  [marks[index], marks[target]] = [marks[target], marks[index]]; return { ...previous, marks };
                })}>{direction === 1 ? <MoveUp size={15} /> : <MoveDown size={15} />}{direction === 1 ? '上移' : '下移'}</button>)}
                  <button type="button" aria-label="删除当前痕迹" onClick={() => { patch({ marks: d.marks.filter(m => m.id !== mark.id) }); setSelected(null); setMarkPage('layers'); }}><Trash2 size={15} /></button>
                </div>
              </div>}
            </>}
            {tab === 'play' && <>
              <div className="lp-subtabs" aria-label="预设调整">{(['presets', 'dice'] as const).map((page, i) => <button key={page} type="button" aria-pressed={playPage === page} onClick={() => setPlayPage(page)}>{i ? '灵感骰子' : '个人预设'}</button>)}</div>
              {playPage === 'presets' ? <TextStylePresets scope={accountScope} kind="letterpress" style={letterStyle(d)} onApply={value => { commit(previous => ({ ...previous, ...value })); setSelected(null); setTool(null); }} /> : <>
                <DiceLocks options={LETTER_LOCKS} locks={locks} onChange={setLocks} />
                <button type="button" className="lp-add" disabled={Object.keys(LETTER_LOCKS).every(k => locks[k as keyof LetterLocks])} onClick={() => { cancelGesture(); commit(previous => rollLetter(previous, crypto.getRandomValues(new Uint32Array(1))[0], locks)); setSelected(null); setTool(null); }}><Dice5 size={17} />换一种样式</button>
                <p className="lp-caption">保留文字与落款。不满意可撤销。</p>
              </>}
            </>}
          </fieldset>
        </StudioInspector>
      </div>
      <footer className="lp-footer">
        <nav className="lp-dock" aria-label="信稿工具">{tabs.map(t => <button key={t.id} type="button" aria-label={`调整${t.label}`} aria-pressed={inspectorOpen && tab === t.id} disabled={busy} onClick={() => switchTab(t.id)}><t.icon size={18} /><span>{t.label}</span></button>)}</nav>
        <button type="button" className="lp-primary" disabled={!ready} aria-label={onApply ? updating ? '保存到文档' : '插入文档' : android ? '分享图片' : '保存 PNG'} onClick={() => void perform(onApply ? 'embed' : android ? 'share' : 'png')}>
          {busy ? <Loader2 size={17} className="animate-spin" /> : <FilePlus2 size={17} />}<span>{onApply ? updating ? '保存到文档' : '插入文档' : android ? '分享图片' : '保存 PNG'}</span></button>
      </footer>
    </div>
  </div>, document.body);
}
