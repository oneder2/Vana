import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { JSONContent } from '@tiptap/core';
import { History, Loader2, X } from 'lucide-react';
import { listDocumentHistory, type DocumentHistoryEntry, type DocumentRecord } from '@/lib/api';
import { getThemeAccentColor, getThemeBorderColor, getThemeSurfaceColor, getThemeTextColor } from '@/lib/themeStyles';
import { Editor } from './Editor';
import { useTheme } from './ThemeProvider';

export function DocumentHistoryModal({ document, onClose }: { document: DocumentRecord; onClose: () => void }) {
  const { theme } = useTheme();
  const [entries, setEntries] = useState<DocumentHistoryEntry[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'version' | 'current'>('version');
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const border = getThemeBorderColor(theme);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setEntries([]);
    void listDocumentHistory(document.id, document.account_scope).then(items => {
      if (cancelled) return;
      setEntries(items);
      setSelected(items[0]?.id ?? '');
    }).catch(error => {
      if (!cancelled) setError(error instanceof Error ? error.message : String(error));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [document.id, document.account_scope]);

  useEffect(() => {
    const previous = window.document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onClose(); }
      if (event.key !== 'Tab') return;
      const buttons = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]') ?? [])];
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && window.document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && window.document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => { window.removeEventListener('keydown', onKeyDown, true); previous?.focus(); };
  }, [onClose]);

  const entry = entries.find(item => item.id === selected);
  let preview: JSONContent | undefined;
  try {
    const parsed = JSON.parse(view === 'current' ? document.content_json : entry?.content_json ?? 'null');
    if (parsed && typeof parsed === 'object' && parsed.type === 'doc' && Array.isArray(parsed.content)) preview = parsed;
  }
  catch { /* Invalid legacy snapshots remain visible as an explicit error below. */ }

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 p-2 sm:p-5"
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="document-history-title"
        className="flex h-[min(88dvh,800px)] w-full max-w-5xl flex-col overflow-hidden rounded border shadow-xl"
        style={{ backgroundColor: getThemeSurfaceColor(theme), borderColor: border, color: getThemeTextColor(theme) }}>
        <header className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: border }}>
          <History size={18} style={{ color: getThemeAccentColor(theme) }} />
          <div className="min-w-0 flex-1"><h2 id="document-history-title" className="font-medium">修改记录</h2><p className="truncate text-xs opacity-65">{document.title}</p></div>
          <button ref={closeButton} type="button" onClick={onClose} aria-label="关闭修改记录" className="p-2"><X size={18} /></button>
        </header>
        <p className="border-b px-4 py-2 text-xs leading-5 opacity-65" style={{ borderColor: border }}>
          本机保存及观察到的云端正文版本。每篇最多 20 个、30 天，所有历史共用 5 MiB 上限；只记录正文，不是不可篡改的审计日志，也不能识别修改者。
        </p>
        {loading ? <div className="flex items-center gap-2 p-5 text-sm"><Loader2 size={16} className="animate-spin" />正在读取记录…</div>
          : error ? <p role="alert" className="p-5 text-sm text-red-500">读取失败：{error}</p>
          : !entries.length ? <p className="p-5 text-sm opacity-70">没有保留的正文版本。记录可能已到期或被清理。</p>
          : <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
              <nav aria-label="正文版本" className="flex max-h-28 shrink-0 gap-1 overflow-auto border-b p-2 sm:max-h-none sm:w-56 sm:flex-col sm:border-b-0 sm:border-r" style={{ borderColor: border }}>
                {entries.map((item, index) => <button key={item.id} type="button" aria-pressed={selected === item.id}
                  onClick={() => { setSelected(item.id); setView('version'); }} className="shrink-0 rounded border px-3 py-2 text-left text-xs"
                  style={{ borderColor: selected === item.id ? getThemeAccentColor(theme) : 'transparent' }}>
                  <span className="block">{new Date(item.created_at).toLocaleString()}</span>
                  <span className="mt-1 block opacity-60">{index === 0 ? '最近记录' : `保留版本 ${entries.length - index}`}</span>
                </button>)}
              </nav>
              <section className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="flex gap-2 p-2" aria-label="版本对照">
                  {(['version', 'current'] as const).map(tab => <button key={tab} type="button" aria-pressed={view === tab} onClick={() => setView(tab)}
                    className="rounded border px-3 py-2 text-xs" style={{ borderColor: view === tab ? getThemeAccentColor(theme) : border }}>{tab === 'version' ? '所选版本' : '打开记录时的正文'}</button>)}
                </div>
                <div className="min-h-0 flex-1 overflow-hidden px-2 pb-2">
                  {preview ? <Editor key={`${selected}:${view}`} accountScope={document.account_scope} contentGeneration={0} initialContent={preview} readOnly />
                    : <p role="alert" className="p-4 text-sm">此版本正文格式无效，无法预览。</p>}
                </div>
              </section>
            </div>}
      </div>
    </div>, window.document.body,
  );
}
