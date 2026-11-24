import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronRight, Folder, FolderInput, Loader2, X } from 'lucide-react';
import type { DocumentSummary } from '@/lib/api';
import { documentPath } from '@/lib/documentNavigation';
import { moveDestinations } from '@/lib/documentMove';
import { useDialogFocus } from '@/lib/useDialogFocus';
import { usePresence } from '@/lib/usePresence';

export function DocumentMoveDialog({ source, documents, onClose, onMove, onBusyChange }: {
  onBusyChange: (busy: boolean) => void; source: DocumentSummary | null; documents: DocumentSummary[]; onClose: () => void;
  onMove: (source: DocumentSummary, parent: string | null) => Promise<void>;
}) {
  const present = usePresence(!!source), last = useRef(source);
  if (source) last.current = source;
  const item = source ?? last.current;
  const [parent, setParent] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), dialog = useRef<HTMLElement>(null), close = useRef<HTMLButtonElement>(null);
  const dismiss = () => { if (!lock.current) onClose(); };
  useDialogFocus(dialog, close, dismiss, !!source);
  useEffect(() => { if (source) { setParent(null); setError(''); } }, [source?.id]);
  if (!present || !item) return null;
  const available = moveDestinations(documents, item);
  const folder = documents.find(node => node.id === parent);
  const path = folder ? documentPath(folder, documents) : [];
  const same = parent === item.parent_id;
  const valid = parent === null || available.some(node => node.id === parent);
  const move = async () => {
    if (lock.current || same || !valid || !source) return;
    lock.current = true; onBusyChange(true); setBusy(true); setError('');
    try { await onMove(source, parent); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { lock.current = false; onBusyChange(false); setBusy(false); }
  };
  return createPortal(<div className="vana-modal-overlay move-dialog-overlay" data-open={!!source} inert={!source} onClick={event => { if (event.target === event.currentTarget) dismiss(); }}>
    <section ref={dialog} className="vana-modal move-dialog" role={source ? 'dialog' : undefined} aria-modal={source ? true : undefined} aria-labelledby="move-dialog-title" tabIndex={-1} aria-busy={busy}>
      <header><div><h2 id="move-dialog-title">移动到分组</h2><p>{item.title || '未命名'}</p></div><button ref={close} type="button" className="ui-icon-button" aria-label="取消移动" onClick={dismiss} disabled={busy}><X size={18} /></button></header>
      <nav aria-label="移动目标位置"><button type="button" className="ui-icon-button" disabled={busy || !parent} onClick={() => setParent(folder?.parent_id ?? null)} aria-label="上一级目标分组"><ArrowLeft size={17} /></button>
        <button type="button" disabled={busy} onClick={() => setParent(null)} aria-current={!parent ? 'location' : undefined}>文档库</button>
        {path.map(node => <span key={node.id}><ChevronRight size={12} /><button type="button" disabled={busy} onClick={() => setParent(node.id)} aria-current={node.id === parent ? 'location' : undefined}>{node.title}</button></span>)}
      </nav>
      <div className="move-folder-list">{available.filter(node => node.parent_id === parent).map(node => <button key={node.id} type="button" disabled={busy} onClick={() => setParent(node.id)}>
        <Folder size={18} /><span>{node.title || '未命名分组'}</span>{node.id === item.parent_id && <small>当前位置</small>}<ChevronRight size={15} />
      </button>)}{!available.some(node => node.parent_id === parent) && <p>这里没有可进入的子分组。</p>}</div>
      {error && <p className="move-error" role="alert">{error}</p>}
      <footer><span>{same ? '当前所在分组' : `目标：${folder?.title || '文档库'}`}</span><button type="button" className="ui-button ui-button-primary" disabled={busy || same || !valid} onClick={() => void move()}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : <FolderInput size={16} />}{busy ? '正在移动…' : '移到这里'}</button></footer>
    </section>
  </div>, document.body);
}
