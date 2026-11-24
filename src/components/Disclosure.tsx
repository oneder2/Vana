import { useId, useState, type ReactNode, type CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';

export function Disclosure({ title, children, defaultOpen = false, className = '', style }: {
  title: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string; style?: CSSProperties;
}) {
  const [open, setOpen] = useState(defaultOpen), id = useId();
  return <div className={`vana-disclosure ${className}`} style={style}>
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>{title}<ChevronDown size={16} /></button>
    <div id={id} className="vana-disclosure-body" data-open={open} inert={!open} aria-hidden={!open}><div>{children}</div></div>
  </div>;
}
