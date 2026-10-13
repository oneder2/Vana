import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, GitCompareArrows, Loader2, X } from 'lucide-react';
import { acknowledgeDocumentConflict, getDocumentConflict, listDocumentConflicts, type DocumentConflict, type DocumentConflictSummary, type DocumentRecord } from '@/lib/api';
import { compareDocumentBodies, parseDocumentBody } from '@/lib/documentDiff';
import { getThemeAccentColor, getThemeBorderColor, getThemeSurfaceColor, getThemeTextColor } from '@/lib/themeStyles';
import { Editor } from './Editor';
import { FadeContent } from './motion/FadeContent';
import { useTheme } from './ThemeProvider';
import { useDialogFocus } from '@/lib/useDialogFocus';

const reasons = { 'concurrent-tree-change': '同时修改正文或目录，已保留完整本地目录树', 'edit-during-sync': '编辑期间收到云端版本，已保留本地草稿', 'cloud-edit-during-delete': '删除期间收到云端修改，已保留云端正文', 'name-marker': '根据副本名称找到；本机没有记录原文关联' };
export function DocumentConflictsModal({ scope, onClose, onOpen }: { scope: string; onClose: () => void; onOpen: (document: DocumentRecord) => void }) {
  const { theme } = useTheme();
  const [items, setItems] = useState<DocumentConflictSummary[]>([]);
  const [selected, setSelected] = useState('');
  const [view, setView] = useState<'diff' | 'copy' | 'original'>('diff');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const dialog = useRef<HTMLDivElement>(null), close = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(false), alive = useRef(true);
  const dismiss = useCallback(() => { if (!busyRef.current) onClose(); }, [onClose]);
  useDialogFocus(dialog, close, dismiss);
  useEffect(() => {
    alive.current = true; setLoading(true);
    void listDocumentConflicts(scope).then(rows => { if (alive.current) { setItems(rows); setSelected(rows[0]?.copy_id ?? ''); } })
      .catch(error => { if (alive.current) setError(String(error)); }).finally(() => { if (alive.current) setLoading(false); });
    return () => { alive.current = false; };
  }, [scope]);
  const [item, setItem] = useState<DocumentConflict | null>(null);
  useEffect(() => {
    let cancelled = false;
    setItem(null); setError('');
    if (selected) void getDocumentConflict(scope, selected).then(detail => { if (!cancelled) setItem(detail); })
      .catch(error => { if (!cancelled) setError(String(error)); });
    return () => { cancelled = true; };
  }, [scope, selected]);
  const comparison = useMemo(() => {
    if (!item?.original || item.copy.node_kind !== 'document' || item.original.node_kind !== 'document') return null;
    try { return compareDocumentBodies(item.original.content_json, item.copy.content_json); } catch { return null; }
  }, [item]);
  const preview = (() => { try { return parseDocumentBody((view === 'original' ? item?.original : item?.copy)?.content_json ?? 'null'); } catch { return null; } })();
  const border = getThemeBorderColor(theme), accent = getThemeAccentColor(theme);
  return createPortal(<div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 p-2 sm:p-5" onClick={event => { if (event.target === event.currentTarget) dismiss(); }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="conflicts-title" tabIndex={-1} className="history-dialog flex h-[min(92dvh,850px)] w-full max-w-6xl flex-col overflow-hidden rounded-xl border shadow-2xl" style={{ borderColor: border, backgroundColor: getThemeSurfaceColor(theme), color: getThemeTextColor(theme), '--history-accent': accent } as CSSProperties}>
      <header className="flex items-center gap-3 border-b px-4 py-4 sm:px-6" style={{ borderColor: border }}><span className="history-icon"><GitCompareArrows size={20} /></span><div className="min-w-0 flex-1"><p className="mb-1 text-[10px] uppercase tracking-[0.18em] opacity-60">Sync copies</p><h2 id="conflicts-title">同步副本</h2></div><button ref={close} disabled={busy} className="history-control p-2" onClick={dismiss} aria-label="关闭同步副本"><X size={18} /></button></header>
      <p className="border-b px-4 py-3 text-xs leading-6 opacity-70" style={{ borderColor: border }}>同步保留的内容可在这里对照。确认已查看会移出本机列表，正文继续保留在文档库；需要合并时，打开副本复制所需内容。</p>
      {loading ? <div role="status" className="flex items-center gap-2 p-5 text-sm"><Loader2 size={14} className="animate-spin" />正在读取副本…</div> : !items.length ? <p className="p-6 text-sm opacity-70">没有待查看的同步副本。</p> : <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <nav aria-label="同步副本列表" className="flex max-h-28 shrink-0 gap-1 overflow-auto border-b p-3 sm:max-h-none sm:w-64 sm:flex-col sm:border-b-0 sm:border-r" style={{ borderColor: border }}>{items.map(row => <button key={row.copy_id} disabled={busy} aria-pressed={row.copy_id === selected} className="history-version max-w-64 shrink-0 rounded-lg px-4 py-3 text-left text-xs" data-selected={row.copy_id === selected} onClick={() => { setSelected(row.copy_id); setView('diff'); }}><span className="block break-words leading-5">{row.title}</span><time className="mt-2 block opacity-65" dateTime={row.created_at}>{new Date(row.created_at).toLocaleString()}</time></button>)}</nav>
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <p className="px-4 pt-4 text-xs leading-6 opacity-75">{item ? reasons[item.reason] ?? item.reason : ''}</p>
          <div className="flex flex-wrap gap-1 p-3">{([{ id: 'diff', label: '正文差异' }, { id: 'original', label: '原文当前版本' }, { id: 'copy', label: '保留副本' }] as const).map(tab => <button key={tab.id} disabled={busy || (tab.id === 'original' && !item?.original)} aria-pressed={view === tab.id} className="history-control rounded-md px-3 py-2 text-xs" style={{ backgroundColor: view === tab.id ? `color-mix(in srgb, ${accent} 14%, transparent)` : undefined }} onClick={() => setView(tab.id)}>{tab.label}</button>)}</div>
          <FadeContent key={`${selected}:${view}`} className="min-h-0 flex-1 overflow-auto px-4 pb-4">
            {!item ? <p role="status" className="py-4 text-sm">正在读取正文…</p> : view === 'diff' ? comparison ? <><p className="mb-4 flex items-center gap-2 text-xs opacity-70">原文当前版本<ArrowRight size={14} />保留副本</p>{comparison.identical ? <p className="text-sm leading-7">正文一致，可能只有目录或文档属性不同。</p> : comparison.formattingOnly ? <p className="text-sm leading-7">文字相同，格式或结构不同，请切换预览查看。</p> : <div className="history-diff whitespace-pre-wrap break-words text-sm leading-8">{comparison.changes.map((x, index) => x.kind === 'same' ? <span key={index}>{x.text}</span> : x.kind === 'added' ? <ins key={index}><span className="sr-only">副本新增：</span>{x.text}</ins> : <del key={index}><span className="sr-only">副本删除：</span>{x.text}</del>)}</div>}<p className="mt-5 text-xs opacity-65">带下划线：副本新增；带删除线：副本删除。此视图对照文字，排版请切换预览。</p></> : <p className="py-4 text-sm leading-7 opacity-75">{!item?.original ? '原文已删除，或这份副本没有本机关联记录。可打开保留副本阅读。' : '这是目录副本，请打开目录查看保留的文档与层级。'}</p>
              : (view === 'original' ? item?.original : item?.copy)?.node_kind === 'folder' ? <p className="py-4 text-sm">这是分组，打开后可查看其中的文档。</p> : preview ? <Editor accountScope={scope} contentGeneration={0} initialContent={preview} readOnly /> : <p role="alert">正文格式无效。</p>}
          </FadeContent>
          {item && <div className="flex flex-wrap gap-3 border-t px-4 py-3 text-xs" style={{ borderColor: border }}><span>副本：{item.copy.status === 'active' ? '文档库' : item.copy.status === 'archived' ? '归档' : '回收站'} · {item.copy.tags.join(' / ') || '无标签'}</span><span>目录层级：{item.copy.depth}</span></div>}
        </section>
      </div>}
      {error && <p role="alert" className="px-4 py-3 text-sm">操作失败：{error}</p>}
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-4 py-3" style={{ borderColor: border }}><p className="text-[11px] opacity-65">{items.length === 500 ? '显示最近 500 个待查看副本' : `${items.length} 个待查看副本`} · 标记仅影响本机列表</p>{item && <div className="flex flex-wrap gap-2"><button className="history-control rounded border px-3 py-2 text-xs" style={{ borderColor: border }} disabled={busy || !item.original} onClick={() => { if (item.original) onOpen(item.original); }}>打开原文</button><button className="history-control rounded border px-3 py-2 text-xs" style={{ borderColor: border }} disabled={busy} onClick={() => onOpen(item.copy)}>打开副本</button><button className="history-restore" disabled={busy} onClick={() => {
        if (busyRef.current) return;
        busyRef.current = true; setBusy(true); setError(''); dialog.current?.focus();
        void acknowledgeDocumentConflict(scope, item.copy.id).then(() => { if (alive.current) { const next = items.filter(x => x.copy_id !== item.copy.id); setItems(next); setSelected(next[0]?.copy_id ?? ''); } })
          .catch(error => { if (alive.current) setError(String(error)); }).finally(() => { busyRef.current = false; if (alive.current) { setBusy(false); requestAnimationFrame(() => close.current?.focus()); } });
      }}><Check size={14} />{busy ? '正在标记…' : '已查看，保留副本'}</button></div>}</footer>
    </div>
  </div>, window.document.body);
}
