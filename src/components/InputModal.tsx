'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Loader2, X } from 'lucide-react';
import { usePresence } from '@/lib/usePresence';
import { useDialogFocus } from '@/lib/useDialogFocus';

export interface InputModalProps {
  isOpen: boolean; title: string; placeholder?: string; defaultValue?: string;
  confirmText?: string; cancelText?: string; onConfirm: (value: string) => void | Promise<void>;
  onCancel: () => void; validator?: (value: string) => { valid: boolean; error?: string }; isLoading?: boolean;
}
export function InputModal({ isOpen, title, placeholder = '', defaultValue = '', confirmText = '确认', cancelText = '取消', onConfirm, onCancel, validator, isLoading = false }: InputModalProps) {
  const present = usePresence(isOpen), input = useRef<HTMLInputElement>(null), panel = useRef<HTMLFormElement>(null);
  const lock = useRef(false), [pending, setPending] = useState(false), [value, setValue] = useState(defaultValue), [error, setError] = useState('');
  const busy = isLoading || pending;
  useDialogFocus(panel, input, () => { if (!isLoading && !lock.current) onCancel(); }, isOpen);
  useEffect(() => { if (isOpen) { setValue(defaultValue); setError(''); input.current?.select(); } }, [isOpen, defaultValue]);
  const confirm = async () => {
    if (isLoading || lock.current) return;
    const trimmed = value.trim(), validation = validator?.(trimmed);
    if (!trimmed || validation?.valid === false) { setError(!trimmed ? '输入不能为空' : validation?.error || '输入无效'); input.current?.focus(); return; }
    lock.current = true; setPending(true); setError('');
    try { await onConfirm(trimmed); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { lock.current = false; setPending(false); }
  };
  if (!present) return null;
  return createPortal(<div className="vana-modal-overlay" data-open={isOpen} inert={!isOpen} onClick={event => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <form ref={panel} className="vana-modal" role={isOpen ? 'dialog' : undefined} aria-modal={isOpen ? true : undefined} aria-labelledby="input-modal-title" aria-busy={busy} onSubmit={event => { event.preventDefault(); void confirm(); }}>
      <h2 id="input-modal-title" className="px-6 pt-5 text-lg font-semibold">{title}</h2>
      <div className="p-6"><input ref={input} value={value} onChange={event => { setValue(event.target.value); setError(''); }} placeholder={placeholder} aria-label={title} aria-invalid={!!error} aria-describedby={error ? 'input-modal-error' : undefined} disabled={busy} className="w-full rounded border px-3 py-3 text-sm" style={{ borderColor: 'var(--ui-border)', background: 'var(--ui-bg)' }} />
        {error && <p id="input-modal-error" role="alert" className="mt-2 text-sm text-red-500">{error}</p>}</div>
      <div className="flex justify-end gap-3 px-6 pb-5"><button type="button" className="ui-button inline-flex items-center gap-2" disabled={busy} onClick={onCancel}><X size={15} />{cancelText}</button><button type="submit" disabled={busy} className="ui-button ui-button-primary inline-flex items-center gap-2">{busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}{busy ? '处理中…' : confirmText}</button></div>
    </form>
  </div>, document.body);
}
