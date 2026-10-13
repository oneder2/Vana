import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, History, Loader2, RotateCcw, X } from 'lucide-react';
import { listDocumentHistory, restoreDocumentHistory, type DocumentHistoryEntry, type DocumentRecord } from '@/lib/api';
import { documentDrafts } from '@/lib/documentDrafts';
import { compareDocumentBodies, parseDocumentBody } from '@/lib/documentDiff';
import { getThemeAccentColor, getThemeBorderColor, getThemeSurfaceColor, getThemeTextColor } from '@/lib/themeStyles';
import { Editor } from './Editor';
import { FadeContent } from './motion/FadeContent';
import { useTheme } from './ThemeProvider';

type View = 'diff' | 'version' | 'current';
const tabs: { id: View; label: string }[] = [{ id: 'diff', label: '正文差异' }, { id: 'version', label: '所选版本' }, { id: 'current', label: '当前正文' }];

export function DocumentHistoryModal({ document, onClose, onRestored }: {
  document: DocumentRecord; onClose: () => void; onRestored: (record: DocumentRecord) => void;
}) {
  const { theme } = useTheme();
  const [entries, setEntries] = useState<DocumentHistoryEntry[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('diff');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const restoreButton = useRef<HTMLButtonElement>(null);
  const border = getThemeBorderColor(theme), accent = getThemeAccentColor(theme);

  useEffect(() => {
    let cancelled = false;
    mounted.current = true;
    setLoading(true); setError(''); setEntries([]); setConfirming(false);
    void listDocumentHistory(document.id, document.account_scope).then(items => {
      if (cancelled) return;
      setEntries(items); setSelected(items[0]?.id ?? '');
    }).catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; mounted.current = false; };
  }, [document.id, document.account_scope]);

  useEffect(() => {
    const previous = window.document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!busyRef.current) { if (confirming) { setConfirming(false); restoreButton.current?.focus(); } else onClose(); }
      }
      if (event.key !== 'Tab') return;
      const buttons = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]') ?? [])];
      const first = buttons[0], last = buttons.at(-1);
      if (!first) { event.preventDefault(); dialog.current?.focus(); }
      else if (event.shiftKey && window.document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (window.document.activeElement === last || window.document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => { window.removeEventListener('keydown', onKeyDown, true); if (previous?.isConnected) previous.focus(); };
  }, [onClose, confirming]);

  useEffect(() => { if (confirming) cancelButton.current?.focus(); }, [confirming]);

  const entry = entries.find(item => item.id === selected);
  const comparison = useMemo(() => {
    if (!entry) return null;
    try { return compareDocumentBodies(entry.content_json, document.content_json); }
    catch { return null; }
  }, [entry, document.content_json]);
  let preview;
  try { preview = parseDocumentBody(view === 'current' ? document.content_json : entry?.content_json ?? 'null'); }
  catch { /* Invalid legacy snapshots are reported, and cannot be restored. */ }
  const added = comparison?.changes.filter(x => x.kind === 'added').reduce((n, x) => n + Array.from(x.text).length, 0) ?? 0;
  const removed = comparison?.changes.filter(x => x.kind === 'removed').reduce((n, x) => n + Array.from(x.text).length, 0) ?? 0;

  async function restore() {
    if (!entry || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    dialog.current?.focus();
    try {
      const record = await documentDrafts.withExclusive(document.id, document.account_scope,
        () => restoreDocumentHistory(document, entry.id));
      if (mounted.current) onRestored(record);
    } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : String(error)); }
    finally {
      busyRef.current = false;
      if (mounted.current) { setBusy(false); setConfirming(false); requestAnimationFrame(() => restoreButton.current?.focus()); }
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 p-2 sm:p-5"
      onClick={event => { if (event.target === event.currentTarget && !busyRef.current) onClose(); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="document-history-title" tabIndex={-1} aria-busy={busy}
        className="history-dialog flex h-[min(92dvh,850px)] w-full max-w-6xl flex-col overflow-hidden rounded-xl border shadow-2xl"
        style={{ backgroundColor: getThemeSurfaceColor(theme), borderColor: border, color: getThemeTextColor(theme), '--history-accent': accent } as CSSProperties}>
        <header className="flex items-center gap-3 border-b px-4 py-4 sm:px-6" style={{ borderColor: border }}>
          <span className="history-icon"><History size={20} /></span>
          <div className="min-w-0 flex-1"><p className="mb-1 text-[10px] uppercase tracking-[0.18em] opacity-60">Document history</p><h2 id="document-history-title" className="font-medium">修改记录</h2><p className="mt-1 truncate text-xs opacity-65">{document.title}</p></div>
          <button ref={closeButton} disabled={busy} type="button" onClick={onClose} aria-label="关闭修改记录" className="history-control p-2"><X size={18} /></button>
        </header>
        {loading ? <div role="status" className="flex items-center gap-2 p-5 text-sm"><Loader2 size={16} className="animate-spin" />正在读取记录…</div>
          : !entries.length ? <p className="p-5 text-sm opacity-70">没有保留的正文版本。记录可能已到期或被清理。</p>
          : <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
              <nav aria-label="正文版本" className="history-rail flex max-h-28 shrink-0 gap-1 overflow-auto border-b p-3 sm:max-h-none sm:w-60 sm:flex-col sm:border-b-0 sm:border-r" style={{ borderColor: border }}>
                {entries.map((item, index) => <button key={item.id} type="button" disabled={busy} aria-pressed={selected === item.id}
                  onKeyDown={event => {
                    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                    event.preventDefault();
                    const next = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : Math.min(entries.length - 1, Math.max(0, index + (['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1)));
                    setSelected(entries[next].id); setConfirming(false);
                    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                    const button = event.currentTarget.parentElement?.querySelectorAll('button')[next];
                    button?.focus(); button?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduce ? 'instant' : 'smooth' });
                  }}
                  onClick={() => { setSelected(item.id); setConfirming(false); }} className="history-version shrink-0 rounded-lg px-4 py-3 text-left text-xs" data-selected={selected === item.id}>
                  <span className="mb-2 block text-[10px] opacity-65">{index === 0 ? '最近记录' : `保留版本 ${entries.length - index}`}</span>
                  <time dateTime={item.created_at} className="block tabular-nums">{new Date(item.created_at).toLocaleString()}</time>
                </button>)}
              </nav>
              <section className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="flex flex-wrap items-center gap-1 border-b p-3" style={{ borderColor: border }} aria-label="版本对照">
                  {tabs.map(tab => <button key={tab.id} type="button" disabled={busy} aria-pressed={view === tab.id} onClick={() => setView(tab.id)}
                    className="history-control rounded-md px-3 py-2 text-xs" style={{ backgroundColor: view === tab.id ? `color-mix(in srgb, ${accent} 14%, transparent)` : undefined }}>{tab.label}</button>)}
                </div>
                <FadeContent key={`${selected}:${view}`} className="min-h-0 flex-1 overflow-auto px-3 py-4 sm:px-6">
                  {view === 'diff' ? comparison ? <>
                    <div className="mb-5 flex flex-wrap items-center gap-2 text-xs opacity-80"><span>所选版本</span><ArrowRight size={14} /><span>打开记录时的正文</span></div>
                    <div className="mb-4 flex flex-wrap gap-3 text-xs"><span className="history-add-label">+ 新增 {added} 字符</span><span className="history-remove-label">− 删除 {removed} 字符</span></div>
                    {comparison.identical ? <p className="py-6 text-sm opacity-65">此版本与当前正文一致。</p>
                      : comparison.formattingOnly ? <p className="py-6 text-sm leading-7">文字相同，格式或结构发生变化。切换“所选版本”和“当前正文”查看排版。</p>
                      : <div className="history-diff whitespace-pre-wrap break-words text-sm leading-8" aria-label="正文增删对照">{comparison.changes.map((change, index) =>
                        change.kind === 'same' ? <span key={index}>{change.text}</span> : change.kind === 'added' ? <ins key={index}><span className="sr-only">新增：</span>{change.text}</ins> : <del key={index}><span className="sr-only">删除：</span>{change.text}</del>)}</div>}
                    {comparison.coarse && <p className="mt-4 text-xs opacity-65">变化范围较大，按连续区域展示完整增删正文。</p>}
                    {!comparison.identical && !comparison.formattingOnly && <p className="mt-5 text-xs opacity-65">此视图对照文字；格式与结构请在版本预览中查看。</p>}
                  </> : <p role="alert" className="p-4 text-sm">此版本正文格式无效，无法对照或恢复。</p>
                    : preview ? <Editor key={`${selected}:${view}`} accountScope={document.account_scope} contentGeneration={0} initialContent={preview} readOnly />
                      : <p role="alert" className="p-4 text-sm">此版本正文格式无效，无法预览。</p>}
                </FadeContent>
              </section>
            </div>}
        {error && <p role="alert" className="border-t px-4 py-3 text-sm" style={{ borderColor: border }}>操作失败：{error}</p>}
        <footer className="shrink-0 border-t px-4 py-3 sm:px-6" style={{ borderColor: border }}>
          {confirming ? <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-xl text-xs leading-6">将正文恢复到 {entry ? new Date(entry.created_at).toLocaleString() : ''}。当前正文会保留在修改记录中，仍受保留期限和空间上限约束。标题、标签和目录保持当前值。</p>
            <div className="flex gap-2"><button ref={cancelButton} disabled={busy} className="history-control rounded-md border px-3 py-2 text-xs" style={{ borderColor: border }} onClick={() => { setConfirming(false); restoreButton.current?.focus(); }}>取消</button><button disabled={busy} className="history-restore" onClick={() => void restore()}>{busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}{busy ? '正在恢复…' : '确认恢复正文'}</button></div>
          </div> : <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-xl text-[11px] leading-5 opacity-65">本机正文记录 · 每篇最多 20 个 / 30 天 · 所有历史共用 5 MiB。<br />只保存正文，无法识别修改者，不是不可篡改的审计日志。</p>
            <button ref={restoreButton} disabled={!comparison || comparison.identical || document.status !== 'active' || busy} className="history-restore" onClick={() => setConfirming(true)}><RotateCcw size={14} />恢复所选正文</button>
          </div>}
        </footer>
      </div>
    </div>, window.document.body,
  );
}
