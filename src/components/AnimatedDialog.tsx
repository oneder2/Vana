import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePresence } from '@/lib/usePresence';
import { useDialogFocus } from '@/lib/useDialogFocus';

export function AnimatedDialog({ open, label, onClose, children }: {
  open: boolean; label: string; onClose: () => void; children: ReactNode;
}) {
  const present = usePresence(open), content = useRef(children), panel = useRef<HTMLDivElement>(null);
  if (open) content.current = children;
  useDialogFocus(panel, panel, onClose, open);
  return present ? createPortal(<div className="vana-modal-overlay" data-open={open} inert={!open} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panel} className="vana-modal p-5" role={open ? 'dialog' : undefined} aria-modal={open ? true : undefined} aria-label={label} tabIndex={-1}>{content.current}</div>
  </div>, document.body) : null;
}
