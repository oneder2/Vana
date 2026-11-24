import { Check, type LucideIcon } from 'lucide-react';
import { FloatingPanel } from './FloatingPanel';
export interface ActionItem { id: string; label: string; icon: LucideIcon; disabled?: boolean; danger?: boolean; checked?: boolean; separator?: boolean; }
export function ActionMenu({ items, onAction, ...props }: Omit<Parameters<typeof FloatingPanel>[0], 'children' | 'role'> & { items: ActionItem[]; onAction: (id: string) => void }) {
  return <FloatingPanel {...props}>{items.map(({ id, label, icon: Icon, disabled, danger, checked, separator }) => <button key={id} type="button" role="menuitem"
    disabled={disabled} data-danger={danger} data-separator={separator} className="vana-menu-item" aria-label={label} onClick={() => { props.onClose(); onAction(id); }}>
    <Icon size={17} aria-hidden="true" /><span>{label}</span>{checked && <Check size={15} aria-label="当前" />}
  </button>)}</FloatingPanel>;
}
