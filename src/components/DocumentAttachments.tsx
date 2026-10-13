import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, Loader2, Paperclip, Plus, Share2, Trash2 } from 'lucide-react';
import { addAttachment, exportAttachment, listAttachments, removeAttachment, type AttachmentSummary } from '@/lib/api';
import { documentDrafts } from '@/lib/documentDrafts';
import { isMobile } from '@/lib/platform';
import { useTheme } from './ThemeProvider';
import { getThemeBorderColor, getThemeSurfaceColor } from '@/lib/themeStyles';
import { FadeContent } from './motion/FadeContent';

const MAX_BYTES = 5 * 1024 * 1024;
function bytesLabel(bytes: number) { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MiB` : `${Math.ceil(bytes / 1024)} KiB`; }
function encode(bytes: ArrayBuffer) {
  const array = new Uint8Array(bytes); let binary = '';
  for (let offset = 0; offset < array.length; offset += 8192) binary += String.fromCharCode(...array.subarray(offset, offset + 8192));
  return btoa(binary);
}

export function DocumentAttachments({ scope, documentId, generation, readOnly }: {
  scope: string; documentId: string; generation: number; readOnly: boolean;
}) {
  const { theme } = useTheme();
  const [files, setFiles] = useState<AttachmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [mobile, setMobile] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const active = useRef(true);
  const operation = useRef(false);
  const request = useRef(0);
  const border = getThemeBorderColor(theme);

  const reload = useCallback(async () => {
    const version = ++request.current;
    setLoading(true);
    try {
      const items = await listAttachments(scope, documentId);
      if (active.current && version === request.current) { setFiles(items); setLoadFailed(false); }
    } catch (failure) {
      if (active.current && version === request.current) setLoadFailed(true);
      throw failure;
    } finally {
      if (active.current && version === request.current) setLoading(false);
    }
  }, [scope, documentId]);

  useEffect(() => { active.current = true; void reload().catch(e => { if (active.current) setError(String(e)); });
    return () => { active.current = false; request.current++; };
  }, [reload, generation]);
  useEffect(() => { void isMobile().then(value => { if (active.current) setMobile(value); }); }, []);

  async function run(work: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError(''); setMessage('');
    try { await documentDrafts.trackOperation(documentId, scope, work); }
    catch (failure) { if (active.current) setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { operation.current = false; if (active.current) setBusy(false); }
  }

  return <details className="group shrink-0 border-b text-sm" style={{ borderColor: border, backgroundColor: getThemeSurfaceColor(theme) }}>
    <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 focus-visible:outline focus-visible:outline-2">
      <Paperclip size={15} aria-hidden="true" /><span>附件</span><span className="tabular-nums opacity-65">{loading ? '…' : loadFailed ? '读取失败' : files.length}</span>
      <span className="ml-auto text-xs opacity-60">仅此设备</span>
      {busy && <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-label="正在处理附件" />}
      <ChevronDown size={14} className="transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
    </summary>
    <FadeContent className="max-h-64 overflow-y-auto px-4 pb-4">
      <p className="mb-3 text-xs leading-6 opacity-65">附件随空间备份保留，暂不跨设备同步，也不随正文历史恢复。每个文件最多 5 MiB，每篇最多 20 个；本空间附件共用 25 MiB。</p>
      {files.length > 0 && <ul aria-label="文档附件" className="divide-y" style={{ borderColor: border }}>
        {files.map(file => <li key={file.id} className="flex flex-wrap items-center gap-2 py-3">
          <div className="min-w-0 flex-1"><p className="break-all">{file.file_name}</p><p className="mt-1 text-xs tabular-nums opacity-55">{bytesLabel(file.size_bytes)} · 仅此设备</p></div>
          <button disabled={busy} aria-label={`${mobile ? '分享' : '保存'}附件 ${file.file_name}`} className="rounded border p-2" style={{ borderColor: border }} onClick={() => void run(async () => {
            const path = await exportAttachment(scope, documentId, file.id, mobile);
            if (active.current) setMessage(mobile ? '已打开系统分享。' : `附件已保存：${path}`);
          })}>{mobile ? <Share2 size={16} /> : <Download size={16} />}</button>
          {!readOnly && <button disabled={busy} aria-label={`移除附件 ${file.file_name}`} className="rounded border p-2" style={{ borderColor: border }} onClick={() => setRemoving(file.id)}><Trash2 size={16} /></button>}
          {removing === file.id && !readOnly && <div className="flex w-full flex-wrap items-center gap-3 rounded border p-3 text-xs" style={{ borderColor: border }}>
            <p className="flex-1 leading-6">移除此附件？本机文件内容将删除，建议先导出备份。</p>
            <button disabled={busy} className="rounded border px-3 py-2" style={{ borderColor: border }} onClick={() => void run(async () => {
              await removeAttachment(scope, documentId, file.id); if (!active.current) return;
              setRemoving(null); await reload(); setMessage('附件已移除。');
            })}>确认移除</button><button disabled={busy} onClick={() => setRemoving(null)}>取消</button>
          </div>}
        </li>)}
      </ul>}
      {loading && !error && <p role="status" className="mb-3 flex items-center gap-2 text-xs opacity-60"><Loader2 size={13} className="animate-spin motion-reduce:animate-none" />正在读取附件…</p>}
      {!loading && !files.length && !error && <p className="mb-3 text-xs opacity-60">此文档还没有附件。</p>}
      {readOnly ? <p className="text-xs opacity-60">进入编辑模式后可添加或移除附件。</p> : <button disabled={busy || files.length >= 20} className="flex items-center gap-2 rounded border px-3 py-2 text-xs" style={{ borderColor: border }} onClick={() => input.current?.click()}><Plus size={14} />添加附件</button>}
      <input ref={input} type="file" className="hidden" aria-label="选择文档附件" accept=".txt,.md,.csv,.pdf,.png,.jpg,.jpeg,.gif,.webp,.docx,.zip" disabled={readOnly || busy} onChange={event => {
        const picker = event.currentTarget; const file = picker.files?.[0]; if (!file || readOnly) return;
        void run(async () => {
          if (file.size > MAX_BYTES) throw new Error('附件超过 5 MiB 上限');
          const data = encode(await file.arrayBuffer());
          if (!active.current) throw new Error('文档已切换，请重新添加附件');
          await addAttachment(scope, documentId, file.name, data);
          if (active.current) { await reload(); setMessage('附件已保存在此设备，空间备份会包含该文件。'); }
        }).finally(() => { picker.value = ''; });
      }} />
      {error && <p role="alert" className="mt-3 break-words text-xs leading-6">附件操作失败：{error}</p>}
      {message && <p role="status" className="mt-3 break-all text-xs leading-6">{message}</p>}
    </FadeContent>
  </details>;
}
