import { useEffect, useRef, useState } from 'react';
import { Download, FileCheck2, FolderInput, Loader2, Share2, X } from 'lucide-react';
import { exportSpaceBackup, importSpaceBackup, previewSpaceBackup, shareSpaceBackup, type BackupPreview } from '@/lib/api';
import { documentDrafts } from '@/lib/documentDrafts';
import { isMobile } from '@/lib/platform';
import { getThemeAccentBgColor, getThemeBorderColor, getThemeSurfaceColor } from '@/lib/themeStyles';
import { FadeContent } from './motion/FadeContent';
import { useTheme } from './ThemeProvider';

type PendingBackup = { scope: string; json: string; name: string; preview: BackupPreview };
export function SpaceBackupPanel({ scope, disabled, onBusyChange, onImported }: {
  scope: string; disabled: boolean; onBusyChange: (busy: boolean) => void; onImported: () => Promise<void>;
}) {
  const { theme } = useTheme();
  const [pending, setPending] = useState<PendingBackup | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [path, setPath] = useState('');
  const [mobile, setMobile] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const activeScope = useRef(scope);
  const operation = useRef(false);
  activeScope.current = scope;
  useEffect(() => { setPending(null); setPath(''); setMessage(''); setError(''); }, [scope]);
  useEffect(() => { void isMobile().then(setMobile); }, []);
  const border = getThemeBorderColor(theme);

  async function perform(work: (capturedScope: string) => Promise<void>) {
    if (operation.current || disabled) return;
    const captured = scope;
    operation.current = true; setBusy(true); onBusyChange(true); setError(''); setMessage('');
    try { await work(captured); }
    catch (error) { if (activeScope.current === captured) setError(error instanceof Error ? error.message : String(error)); }
    finally { operation.current = false; setBusy(false); onBusyChange(false); }
  }

  return <section className="shell-panel border p-5 sm:p-6" aria-labelledby="space-backup-title" style={{ backgroundColor: getThemeSurfaceColor(theme), borderColor: border }}>
    <div className="shell-label mb-3">Space backup</div>
    <h2 id="space-backup-title" className="shell-title mb-3 flex items-center gap-2 text-lg font-medium"><FolderInput size={18} />备份与恢复</h2>
    <p className="max-w-2xl text-sm leading-7 opacity-75">备份当前空间的文档、目录、标签和保留的正文记录。导入时创建独立副本，保留目录层级。备份文件包含明文正文，不含登录会话。</p>
    <div className="mt-5 flex flex-wrap gap-3">
      <button disabled={disabled || busy} className="flex items-center gap-2 rounded-md border px-4 py-3 text-sm" style={{ borderColor: border, backgroundColor: getThemeAccentBgColor(theme) }} onClick={() => void perform(async captured => {
        await documentDrafts.flushAll();
        const saved = await exportSpaceBackup(captured);
        if (activeScope.current !== captured) return;
        setPath(saved); setMessage('备份已保存。建议另存到其他设备或存储位置。');
      })}><Download size={16} />导出空间备份</button>
      <button disabled={disabled || busy} className="flex items-center gap-2 rounded-md border px-4 py-3 text-sm" style={{ borderColor: border }} onClick={() => file.current?.click()}><FileCheck2 size={16} />选择备份并预览</button>
      <input ref={file} className="hidden" type="file" accept=".json,.vana-backup.json,application/json" aria-label="选择 Vana 备份文件" onChange={event => {
        const picker = event.currentTarget;
        const selected = picker.files?.[0];
        if (!selected) return;
        setPending(null);
        void perform(async captured => {
          if (selected.size > 64 * 1024 * 1024) throw new Error('备份超过 64 MiB 文件上限');
          const json = await selected.text();
          const preview = await previewSpaceBackup(captured, json);
          if (activeScope.current === captured) setPending({ scope: captured, json, name: selected.name, preview });
        }).finally(() => { picker.value = ''; });
      }} />
    </div>
    {busy && <p role="status" className="mt-4 flex items-center gap-2 text-sm"><Loader2 size={14} className="animate-spin" />正在处理备份…</p>}
    {error && <p role="alert" className="mt-4 break-words text-sm">操作失败：{error}</p>}
    {message && <p role="status" className="mt-4 text-sm">{message}</p>}
    {path && <div className="mt-3 flex flex-wrap items-center gap-3"><p className="min-w-0 break-all text-xs opacity-65">{path}</p>{mobile && <button disabled={busy || disabled} className="flex items-center gap-2 rounded border px-3 py-2 text-xs" style={{ borderColor: border }} onClick={() => void perform(async () => { await shareSpaceBackup(path); })}><Share2 size={14} />分享备份文件</button>}</div>}
    {pending?.scope === scope && <FadeContent className="mt-5 rounded-lg border p-4" style={{ borderColor: border }}>
      <div className="flex items-center justify-between gap-3"><h3 className="break-all text-sm font-medium">{pending.name}</h3><button disabled={busy} aria-label="取消备份导入" className="shrink-0 p-2" onClick={() => setPending(null)}><X size={16} /></button></div>
      <p className="mt-2 text-xs opacity-65">备份时间：{new Date(pending.preview.created_at).toLocaleString()}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">{[
        ['文档', pending.preview.documents], ['分组', pending.preview.folders], ['标签', pending.preview.tags], ['保留记录', pending.preview.retained_history],
      ].map(([label, count]) => <div key={label}><dt className="text-xs opacity-60">{label}</dt><dd className="mt-1 text-xl tabular-nums">{count}</dd></div>)}</dl>
      <p className="mt-4 break-words text-xs leading-6 opacity-70">{pending.preview.titles.join(' · ') || '此备份为空'}</p>
      {(pending.preview.attachments ?? 0) > 0 && <p className="mt-2 text-xs leading-6 opacity-70">包含 {pending.preview.attachments} 个附件，共 {(pending.preview.attachment_bytes / 1024 / 1024).toFixed(1)} MiB；将复制文件内容并生成新附件 ID。</p>}
      {pending.preview.discarded_history > 0 && <p className="mt-2 text-xs opacity-70">{pending.preview.discarded_history} 条历史超过保留期限或上限，导入时将略过。</p>}
      <p className="mt-3 text-xs leading-6 opacity-70">确认后将复制到当前空间，生成新文档 ID，并进入待同步队列。已有同名标签沿用当前颜色；历史仍受 20 个 / 30 天 / 共用 5 MiB 上限约束。</p>
      <button disabled={busy || disabled || pending.preview.documents + pending.preview.folders === 0} className="mt-4 rounded-md border px-4 py-3 text-sm" style={{ borderColor: border, backgroundColor: getThemeAccentBgColor(theme) }} onClick={() => void perform(async captured => {
        const backup = pending;
        if (!backup || backup.scope !== captured) throw new Error('空间已切换，请重新选择备份');
        await documentDrafts.flushAll();
        const result = await importSpaceBackup(captured, backup.json);
        if (activeScope.current !== captured) return;
        setPending(null); setMessage(`已复制 ${result.documents} 篇文档、${result.folders} 个分组、${result.attachments ?? 0} 个附件，保留 ${result.retained_history} 条正文记录。`);
        await onImported();
      })}>确认复制到当前空间</button>
    </FadeContent>}
  </section>;
}
