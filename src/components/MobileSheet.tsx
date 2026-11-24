import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePresence } from '@/lib/usePresence';
import { useDialogFocus } from '@/lib/useDialogFocus';

function SheetPanel({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  const initial = panel;
  useDialogFocus(panel, initial, onClose, open);
  return <div className="mobile-sheet-overlay" data-open={open} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panel} role={open ? 'dialog' : undefined} aria-modal={open ? true : undefined} inert={!open} aria-label={label} tabIndex={-1} className="mobile-sheet">
      <div className="sheet-grip" aria-hidden="true" />
      {children}
    </section>
  </div>;
}

export function MobileSheet(props: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const present = usePresence(props.open);
  return present ? createPortal(<SheetPanel {...props} />, document.body) : null;
}
