import { useEffect, useRef, useState } from 'react';
import { ModuleMenu } from './ModuleMenu';
import type { ContextMenuItem } from './ContextMenu';
import type { LetterDesign } from '@/lib/letterpress/model';
import { exportLetter } from '@/lib/letterpress/export';
import { letterText } from '@/lib/letterpress/document';
import { copyText } from '@/lib/clipboard';

export function LetterModuleMenu({ host, design, items, onAction }: {
  host: HTMLElement; design: LetterDesign; items: ContextMenuItem[]; onAction: (id: string) => void;
}) {
  const [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const lock = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const action = async (id: string) => {
    if (id !== 'copy' && id !== 'share') { onAction(id); return; }
    if (lock.current) return;
    lock.current = true; setBusy(true); setNotice('');
    try {
      if (id === 'copy') await copyText(letterText(design));
      else await exportLetter(design, true);
      if (alive.current) setNotice(id === 'copy' ? '文字已复制' : '图片已导出');
    } catch (error) { if (alive.current) setNotice(`操作失败：${error instanceof Error ? error.message : String(error)}`); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  return <><ModuleMenu host={host} label="信稿" items={items.map(item => ({ ...item, disabled: busy || item.disabled }))} onAction={id => void action(id)} />
    {notice && <span className="module-notice" role="status">{notice}</span>}</>;
}
