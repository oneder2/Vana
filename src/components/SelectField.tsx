import { useId, useRef, useState } from 'react';
import { Check, ChevronDown, Type, type LucideIcon } from 'lucide-react';
import { FloatingPanel } from './FloatingPanel';
export function SelectField({ label, value, options, onChange, disabled = false }: {
  label: string; value: string; options: { value: string; label: string; icon?: LucideIcon }[]; onChange: (value: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false), anchor = useRef<HTMLButtonElement>(null), id = useId();
  const selected = options.find(o => o.value === value);
  return <div className="vana-select"><button ref={anchor} type="button" role="combobox" aria-label={label} aria-expanded={open} aria-controls={id} aria-haspopup="listbox"
    disabled={disabled} className="vana-select-trigger" onClick={() => setOpen(x => !x)} onKeyDown={event => { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); setOpen(true); } }}>
    <span>{selected?.label ?? value}</span><ChevronDown size={15} aria-hidden="true" /></button>
    <FloatingPanel open={open} anchor={anchor.current} onClose={() => setOpen(false)} role="listbox" id={id} label={label} focusFirst>
      {options.map(option => { const Icon = option.icon ?? Type; return <button type="button" role="option" aria-selected={option.value === value} className="vana-menu-item" key={option.value}
        onClick={() => { onChange(option.value); setOpen(false); anchor.current?.focus(); }}><Icon size={17} aria-hidden="true" /><span>{option.label}</span>{value === option.value && <Check size={15} aria-hidden="true" />}</button>; })}
    </FloatingPanel></div>;
}
