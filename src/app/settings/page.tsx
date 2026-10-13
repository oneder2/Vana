'use client';

import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  ExternalLink,
  Link2,
  RefreshCw,
  UserRound,
} from 'lucide-react';
import { TitleBar } from '@/components/TitleBar';
import { SpaceBackupPanel } from '@/components/SpaceBackupPanel';
import { useTheme } from '@/components/ThemeProvider';
import { useToast } from '@/components/ToastProvider';
import {
  completeOnboarding,
  ensureWorkspaceInitialized,
  getAppState,
  getSupabaseConfig,
  getSupabaseSession,
  importLegacyWorkspace,
  saveSupabaseConfig,
  recoverLocalDocuments,
  type AppState,
} from '@/lib/api';
import {
  runSupabaseSync,
  signInWithPassword,
  signOutSupabase,
  signUpWithPassword,
  verifySupabaseConnection,
} from '@/lib/supabaseSync';
import {
  getThemeAccentBgColor,
  getThemeAccentColor,
  getThemeBgColor,
  getThemeBorderColor,
  getThemeSurfaceColor,
} from '@/lib/themeStyles';
import { AppLink } from '@/lib/router';

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
  const { theme } = useTheme();
  const toast = useToast();
  const accent = getThemeAccentColor(theme);
  const accentBg = getThemeAccentBgColor(theme);
  const border = getThemeBorderColor(theme);
  const surface = getThemeSurfaceColor(theme);
  const background = getThemeBgColor(theme);

  const [appState, setAppState] = useState<AppState | null>(null);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [sessionSummary, setSessionSummary] = useState<string | null>(null);
  const [credentialError, setCredentialError] = useState('');

  const refresh = async () => {
    setCredentialError('');
    const [state, config, session] = await Promise.all([getAppState(), getSupabaseConfig(), getSupabaseSession().catch(error => {
      setCredentialError(error instanceof Error ? error.message : String(error));
      return null;
    })]);
    setAppState(state);
    setSupabaseUrl(config.url ?? '');
    setSupabaseAnonKey(config.anon_key ?? '');
    setSessionSummary(
      session
        ? `${session.email ?? 'unknown'}${session.user_id ? ` · ${session.user_id}` : ''}`
        : null
    );
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

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      toast.error('请先填写邮箱和密码');
      return;
    }

    setBusy(true);
    try {
      const session = await signInWithPassword(email.trim(), password);
      await completeOnboarding();
      await refresh();
      toast.success(`已登录：${session.email ?? email.trim()}`);
      setPassword('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async () => {
    if (!email.trim() || !password.trim()) {
      toast.error('请先填写邮箱和密码');
      return;
    }

    setBusy(true);
    try {
      const result = await signUpWithPassword(email.trim(), password);
      await completeOnboarding();
      await refresh();
      if (result.needsEmailConfirmation) {
        toast.success('注册成功，请先到邮箱确认账号，然后再用密码登录');
      } else {
        toast.success(`注册并登录成功：${result.session?.email ?? email.trim()}`);
      }
      setPassword('');
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

  const handleSyncNow = async () => {
    setBusy(true);
    try {
      const snapshot = await runSupabaseSync();
      await refresh();
      toast.success(snapshot.pending_jobs ? '还有更改等待同步' : '同步完成');
      if (snapshot.conflict_copies) toast.info(`已保留 ${snapshot.conflict_copies} 份修改副本，可回到文档查看。`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await signOutSupabase();
      await refresh();
      toast.success('已切换回访客模式');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const identityLabel = `当前身份：${appState?.account_mode === 'authenticated' ? '已登录' : '访客'}`;

  const signedIn = appState?.account_mode === 'authenticated';
  const syncConfigured = Boolean(appState?.supabase.url && appState.supabase.anon_key);

  return (
    <div className="shell-page min-h-screen" style={{ backgroundColor: background, color: accent, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <TitleBar />
      <main className="mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-8">
        <AppLink href="/" className="inline-flex min-h-11 items-center gap-2 text-sm hover:underline"><ArrowLeft size={14} />返回文档</AppLink>
        <h1 className="shell-title mb-6 mt-4 text-3xl font-semibold">设置</h1>
        <div className="space-y-5">
          <section className="shell-panel rounded border p-5 sm:p-6" style={{ backgroundColor: surface, borderColor: border }}>
            <h2 className="shell-title mb-4 flex items-center gap-2 text-lg font-medium"><UserRound size={17} />账号</h2>
            <div role="status" aria-label={identityLabel} className="text-sm">{identityLabel}</div>
            {signedIn ? <>
              <p className="mt-2 break-all text-sm opacity-70">{appState.account_email}</p>
              <button onClick={handleSignOut} disabled={busy} className="mt-4 min-h-11 rounded border px-4 py-2 text-sm" style={{ borderColor: border }}>切换为访客</button>
            </> : <>
              <p className="mt-2 text-sm leading-7 opacity-70">登录后可在其他设备上继续使用文档。本机文档会保留。</p>
              <div className="mt-5 space-y-4">
                <label className="block"><span className="mb-2 block text-sm">邮箱</span><input type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" className="w-full rounded border bg-transparent px-4 py-3 text-sm outline-none" style={{ borderColor: border }} /></label>
                <label className="block"><span className="mb-2 block text-sm">密码</span><input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="输入密码" className="w-full rounded border bg-transparent px-4 py-3 text-sm outline-none" style={{ borderColor: border }} /></label>
                <div className="flex flex-wrap gap-3">
                  <button onClick={handleLogin} disabled={busy || !syncConfigured} className="min-h-11 rounded border px-4 py-2 text-sm font-medium disabled:opacity-50" style={{ backgroundColor: accentBg, borderColor: border }}>登录</button>
                  <button onClick={handleRegister} disabled={busy || !syncConfigured} className="min-h-11 rounded border px-4 py-2 text-sm disabled:opacity-50" style={{ borderColor: border }}>注册</button>
                </div>
                {!syncConfigured && appState && <p className="text-xs leading-6 opacity-65">同步服务尚未连接。如需同步，可在下方高级设置中连接服务。</p>}
              </div>
            </>}
            {credentialError && <p role="alert" className="mt-4 text-sm leading-7">登录信息无法读取：{credentialError}。请解锁系统凭据库或重新登录，本机文档仍可使用。</p>}
          </section>

          {signedIn && <section className="shell-panel rounded border p-5 sm:p-6" style={{ backgroundColor: surface, borderColor: border }}>
            <h2 className="shell-title mb-3 flex items-center gap-2 text-lg font-medium"><RefreshCw size={17} />文档同步</h2>
            <p className="text-sm opacity-75">{appState.sync.pending_jobs ? '还有更改等待同步。' : appState.sync.last_synced_at ? `上次同步：${new Date(appState.sync.last_synced_at).toLocaleString()}` : '尚未同步。'}</p>
            {appState.sync.last_error && <p role="alert" className="mt-3 break-words text-sm leading-7">同步未完成：{appState.sync.last_error}</p>}
            <div className="mt-4 flex flex-wrap gap-3">
              <button onClick={handleSyncNow} disabled={busy} className="min-h-11 rounded border px-4 py-2 text-sm font-medium" style={{ backgroundColor: accentBg, borderColor: border }}>立即同步</button>
              <button disabled={busy} onClick={() => void handleRecover('guest')} className="min-h-11 rounded border px-4 py-2 text-sm" style={{ borderColor: border }}>复制本机文档到账号</button>
            </div>
          </section>}

          {appState && <SpaceBackupPanel scope={appState.account_scope} disabled={busy} onBusyChange={setBusy} onImported={refresh} />}

          <details className="shell-panel rounded border p-5 sm:p-6" style={{ backgroundColor: surface, borderColor: border }}>
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
                  <div>当前会话：{sessionSummary ?? '无活动会话'}</div>
                  <div>同步模式：{appState?.sync.mode ?? 'local-only'}</div>
                  <div>自动同步：{appState?.sync.auto_sync_enabled ? '已开启' : '已关闭'}</div>
                  <div>待同步队列：{appState?.sync.pending_jobs ?? 0}</div>
                  <div>上次拉取：{appState?.sync.last_pulled_at ?? '尚未拉取'}</div>
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
      </main>
    </div>
  );
}
