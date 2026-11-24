import { ActionMenu, type ActionItem } from './ActionMenu';
import { dismissFloatingEvent } from './FloatingPanel';
export type ContextMenuItem = ActionItem;
export function dismissContextMenu() {
  const event = new Event(dismissFloatingEvent, { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented;
}
export function ContextMenu({ x, y, open = true, onClose, onAction, items = [] }: {
  x: number; y: number; open?: boolean; onClose: () => void; onAction?: (id: string) => void; items?: ActionItem[];
}) {
  return <ActionMenu open={open} anchor={{ x, y }} label="操作菜单" items={items} onClose={onClose} onAction={id => onAction?.(id)} preserveSelection />;
}
