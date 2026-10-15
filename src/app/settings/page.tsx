'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Database,
  ExternalLink,
  Link2,
} from 'lucide-react';
import { PreferencesLayout } from '@/components/PreferencesLayout';
import { getAllThemes } from '@/lib/themes';
import { SpaceBackupPanel } from '@/components/SpaceBackupPanel';
import { useTheme } from '@/components/ThemeProvider';
import { useToast } from '@/components/ToastProvider';
import {
  ensureWorkspaceInitialized,
  getAppState,
  getSupabaseConfig,
  importLegacyWorkspace,
  saveSupabaseConfig,
  recoverLocalDocuments,
  type AppState,
} from '@/lib/api';
import {
  verifySupabaseConnection,
} from '@/lib/supabaseSync';
import {
  getThemeAccentBgColor,
  getThemeAccentColor,
  getThemeBgColor,
  getThemeBorderColor,
} from '@/lib/themeStyles';

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${Math.round(value / 1024)} KB`;
  }
  return `${value} B`;
}

export default function SettingsPage() {
  const { theme, themeId, setTheme } = useTheme();
  const toast = useToast();
  const accentBg = getThemeAccentBgColor(theme);
  const border = getThemeBorderColor(theme);

  const [appState, setAppState] = useState<AppState | null>(null);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const refresh = async () => {
    const [state, config] = await Promise.all([getAppState(), getSupabaseConfig()]);
    setAppState(state);
    setSupabaseUrl(config.url ?? '');
    setSupabaseAnonKey(config.anon_key ?? '');
  };

  useEffect(() => {
    void (async () => {
      await ensureWorkspaceInitialized();
      await refresh();
    })().catch(error => toast.error(error instanceof Error ? error.message : String(error)));
  }, []);

  const handleImport = async () => {
    setBusy(true);
    try {
      const result = await importLegacyWorkspace();
      toast.success(`导入完成：${result.imported_documents} 篇文档`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAdvanced = async () => {
    setBusy(true);
    setValidationMessage(null);
    try {
      await saveSupabaseConfig({
        url: supabaseUrl.trim() || null,
        anon_key: supabaseAnonKey.trim() || null,
      });
      await refresh();
      setValidationMessage('高级配置已保存。留空会继续使用内置公共服务。');
      toast.success('高级配置已保存');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setValidationMessage(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    setBusy(true);
    setValidationMessage(null);
    try {
      const result = await verifySupabaseConnection({
        url: supabaseUrl,
        anon_key: supabaseAnonKey,
      });
      setValidationMessage(result.message);
      if (result.reachable) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setValidationMessage(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const handleRecover = async (source: 'guest' | 'legacy') => {
    if (!window.confirm('将来源文档复制到当前账号空间？原文档会保留，复制的文档可随账号同步。')) return;
    setBusy(true);
    try { const count = await recoverLocalDocuments(source); toast.success(`已导入 ${count} 个节点`); await refresh(); }
    catch (error) { toast.error(String(error)); } finally { setBusy(false); }
  };

  return (
    <PreferencesLayout active="settings" title="设置" description="调整阅读外观，保管文档备份。">
        <div className="space-y-6">
          <section className="preference-section" aria-labelledby="appearance-title">
            <h2 id="appearance-title">阅读外观</h2>
            <p className="preference-description">选择适合此刻的颜色与字体。</p>
            <div className="theme-choices" role="group" aria-label="阅读主题">
              {getAllThemes().map(choice => <button key={choice.id} type="button" className="theme-choice" aria-label={`使用${choice.name.split(' ')[0]}主题`} aria-pressed={themeId === choice.id} onClick={() => setTheme(choice.id)}>
                <span className="theme-choice-preview" aria-hidden="true" style={{ backgroundColor: getThemeBgColor(choice), color: getThemeAccentColor(choice), borderColor: getThemeBorderColor(choice) }}>
                  <span className={choice.font}>文</span><span className="theme-preview-lines"><i /><i /><i /></span>
                </span>
                <span>{choice.name.split(' ')[0]}</span>
                {themeId === choice.id && <CheckCircle2 size={15} className="theme-choice-check" />}
              </button>)}
            </div>
          </section>

          {appState && <SpaceBackupPanel scope={appState.account_scope} disabled={busy} onBusyChange={setBusy} onImported={refresh} />}

          <details className="preference-section advanced-settings">
            <summary className="cursor-pointer text-sm font-medium">高级设置</summary>
            <div className="mt-5 space-y-6">
              <section>
                <h2 className="mb-2 text-sm font-medium">自定义同步服务</h2>
                <p className="mb-4 text-xs leading-6 opacity-65">连接自己的 Supabase 项目；留空使用内置服务。</p>
                <div className="space-y-4">
                  <label className="block"><span className="mb-2 block text-sm">Supabase URL</span><input value={supabaseUrl} onChange={event => setSupabaseUrl(event.target.value)} placeholder="https://your-project.supabase.co" className="w-full rounded border bg-transparent px-4 py-3 text-sm outline-none" style={{ borderColor: border }} /></label>
                  <label className="block"><span className="mb-2 block text-sm">Anon Key</span><textarea value={supabaseAnonKey} onChange={event => setSupabaseAnonKey(event.target.value)} placeholder="粘贴 Supabase anon key" className="min-h-[100px] w-full rounded border bg-transparent px-4 py-3 text-sm outline-none" style={{ borderColor: border }} /></label>
                  <div className="flex flex-wrap gap-3">
                    <button onClick={handleSaveAdvanced} disabled={busy} className="min-h-11 rounded border px-4 py-2 text-sm" style={{ backgroundColor: accentBg, borderColor: border }}><Link2 size={14} className="mr-1 inline" />保存高级配置</button>
                    <button onClick={handleVerify} disabled={busy} className="min-h-11 rounded border px-4 py-2 text-sm" style={{ borderColor: border }}><CheckCircle2 size={14} className="mr-1 inline" />连接自检</button>
                  </div>
                  {validationMessage && <p role="status" className="break-words text-sm leading-7">{validationMessage}</p>}
                </div>
              </section>
              <section className="border-t pt-5" style={{ borderColor: border }}>
                <h2 className="mb-3 text-sm font-medium">旧数据导入</h2>
                <div className="flex flex-wrap gap-3">
                  <button onClick={handleImport} disabled={busy} className="min-h-11 rounded border px-4 py-2 text-sm" style={{ borderColor: border }}><Database size={14} className="mr-1 inline" />导入旧工作区</button>
                  {appState?.recovery_available && <button disabled={busy} onClick={() => void handleRecover('legacy')} className="min-h-11 rounded border px-4 py-2 text-sm" style={{ borderColor: border }}>恢复旧数据库</button>}
                </div>
              </section>
              <details className="border-t pt-4 text-xs leading-6 opacity-70" style={{ borderColor: border }}>
                <summary className="cursor-pointer">诊断信息</summary>
                <div className="mt-3 space-y-1 break-words">
                  <div>服务来源：{appState?.service_profile ?? '未连接'}</div>
                  <div>单文档上限：{appState ? formatBytes(appState.limits.max_document_content_bytes) : '—'}</div>
                  <div>总存储上限：{appState?.limits.max_total_storage_bytes ? formatBytes(appState.limits.max_total_storage_bytes) : '未设置'}</div>
                  <div>文档数量上限：{appState?.limits.max_document_count || '未设置'}</div>
                  <div>5 分钟写入上限：{appState?.limits.max_write_ops_per_5_minutes || '未设置'}</div>
                  <div>当前存储：{appState ? formatBytes(appState.limits.current_total_storage_bytes) : '—'}</div>
                  <div>最近 5 分钟写入：{appState?.limits.current_write_ops_last_5_minutes ?? 0}</div>
                </div>
              </details>
              <a href="https://github.com/oneder2/Vana" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-xs hover:underline"><ExternalLink size={14} />GitHub 仓库</a>
            </div>
          </details>
        </div>
    </PreferencesLayout>
  );
}
