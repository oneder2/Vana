import { useEffect, useState } from 'react';
import { BookmarkPlus, Trash2 } from 'lucide-react';
import { deletePreset, loadPresets, savePreset, type PresetKind, type StyleMap, type StylePreset } from '@/lib/textPlugins/styles';
import './text-plugins.css';

export function TextStylePresets<K extends PresetKind>({ scope, kind, style, onApply }: {
  scope: string; kind: K; style: StyleMap[K]; onApply: (value: StyleMap[K]) => void;
}) {
  const [items, setItems] = useState<StylePreset[]>([]), [name, setName] = useState(''), [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const refresh = () => {
      try { setItems(loadPresets(scope, localStorage)); setFailed(false); }
      catch { setItems([]); setFailed(true); setMessage('无法读取本机预设，当前文档仍可继续编辑。'); }
    };
    refresh(); window.addEventListener('storage', refresh); window.addEventListener('vana-presets-changed', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('vana-presets-changed', refresh); };
  }, [scope]);
  const mutate = (operation: () => StylePreset[], notice: string) => {
    try { setItems(operation()); setMessage(notice); setFailed(false); window.dispatchEvent(new Event('vana-presets-changed')); }
    catch (e) { setMessage(e instanceof Error ? e.message : '预设未能保存，请检查本机存储空间'); }
  };
  return <section className="tp-presets" aria-label="个人样式预设">
    <p className="tp-note">只收藏样式，保留当前文字。预设保存在本机当前空间。</p>
    <div className="tp-preset-save"><input aria-label="预设名称" placeholder="给这个样式起个名字" value={name} maxLength={40} onChange={e => setName(e.target.value)} />
      <button type="button" disabled={failed || !name.trim()} onClick={() => mutate(() => savePreset(scope, kind, name, style, localStorage), '样式已收藏')}><BookmarkPlus size={16} />收藏样式</button></div>
    <div className="tp-preset-list">{items.filter(p => p.kind === kind).map(p => <div key={p.id}>
      <button type="button" onClick={() => { onApply(p.style as StyleMap[K]); setMessage(`已应用「${p.name}」，文字保持原样`); }}>{p.name}</button>
      <button type="button" aria-label={`删除预设 ${p.name}`} onClick={() => mutate(() => deletePreset(scope, p.id, localStorage), '预设已删除，文档中的样式保持原样')}><Trash2 size={14} /></button>
    </div>)}</div>
    <p className="tp-note" role="status">{message || (items.some(p => p.kind === kind) ? '点击名称应用，可撤销这次修改。' : '还没有收藏的样式。')}</p>
  </section>;
}

export function DiceLocks<K extends string>({ options, locks, onChange }: {
  options: Record<K, string>; locks: Partial<Record<K, boolean>>; onChange: (next: Partial<Record<K, boolean>>) => void;
}) {
  return <fieldset className="tp-locks"><legend>锁定不想改变的部分</legend>{(Object.entries(options) as [K, string][]).map(([key, name]) =>
    <label key={key}><input type="checkbox" checked={!!locks[key]} onChange={e => onChange({ ...locks, [key]: e.target.checked })} />{name}</label>)}</fieldset>;
}
