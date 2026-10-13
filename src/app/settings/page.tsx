'use client';

import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  ExternalLink,
  KeyRound,
  Link2,
  RefreshCw,
  Shield,
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
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
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
    if (!window.confirm('将来源文档复制到当前账号空间？登录后这些副本会进入同步队列。原数据会保留。')) return;
    setBusy(true);
    try { const count = await recoverLocalDocuments(source); toast.success(`已导入 ${count} 个节点`); await refresh(); }
    catch (error) { toast.error(String(error)); } finally { setBusy(false); }
  };

  const handleSyncNow = async () => {
    setBusy(true);
    try {
      const snapshot = await runSupabaseSync();
      await refresh();
      toast.success(`同步完成，剩余待同步 ${snapshot.pending_jobs}`);
      if (snapshot.conflict_copies) toast.info(`已保留 ${snapshot.conflict_copies} 个同步冲突目录树副本。`);
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

  return (
    <div
      className="shell-page min-h-screen"
      style={{
        backgroundColor: background,
        color: accent,
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <TitleBar />
      <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6 sm:py-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <AppLink href="/" className="border px-3 py-2 text-sm" style={{ borderColor: border }}>
            <ArrowLeft size={14} className="mr-1 inline" />
            返回
          </AppLink>
          <a
            href="https://github.com/oneder2/Vana"
            target="_blank"
            rel="noreferrer"
            className="border px-3 py-2 text-sm"
            style={{ borderColor: border }}
          >
            <ExternalLink size={14} className="mr-1 inline" />
            GitHub 仓库
          </a>
        </div>

        <div className="space-y-5">
          <section className="shell-panel border px-5 py-6 sm:px-6" style={{ backgroundColor: surface, borderColor: border }}>
            <div className="shell-label mb-2">Account</div>
            <h1 className="shell-title text-3xl font-semibold">账号与同步</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 opacity-75">
              普通用户默认直接连接应用内置的公共服务。你可以先以访客身份使用，再通过邮箱和密码注册或登录，开启跨设备同步。
            </p>
          </section>

          <section className="shell-panel border p-5 sm:p-6" style={{ backgroundColor: surface, borderColor: border }}>
            <div className="shell-label mb-3">Mode</div>
            <div className="shell-title mb-3 flex items-center gap-2 text-lg font-medium">
              <UserRound size={16} />
              当前身份
            </div>
            <div className="space-y-2 text-sm opacity-85">
              <div>身份模式：{appState?.account_mode ?? 'guest'}</div>
              <div>服务来源：{appState?.service_profile ?? 'hosted'}</div>
              <div>账户邮箱：{appState?.account_email ?? '访客模式 / 未登录'}</div>
              <div>当前会话：{sessionSummary ?? '无活动会话'}</div>
              {credentialError && <p role="alert" className="leading-6">会话存储不可用：{credentialError}。本地文档仍可使用，请解锁系统凭据库或重新登录。</p>}
              <div>同步模式：{appState?.sync.mode ?? 'local-only'}</div>
              <div>首启引导：{appState?.onboarding_completed ? '已完成' : '未完成'}</div>
            </div>
          </section>

          <section className="shell-panel border p-5 sm:p-6" style={{ backgroundColor: surface, borderColor: border }}>
            <div className="shell-label mb-3">Sign In</div>
            <div className="shell-title mb-3 flex items-center gap-2 text-lg font-medium">
              <KeyRound size={16} />
              邮箱与密码
            </div>
            <p className="mb-4 text-sm leading-7 opacity-75">
              如果你还没有账号，可以直接注册。注册后若实例开启了邮箱确认，需要先完成确认，再用密码登录。
            </p>
            <div className="space-y-4">
              <label className="block">
                <div className="mb-2 text-sm font-medium">邮箱</div>
                <input
                  type="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="w-full border bg-transparent px-4 py-3 text-sm outline-none"
                  style={{ borderColor: border }}
                />
              </label>
              <label className="block">
                <div className="mb-2 text-sm font-medium">密码</div>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="输入你的密码"
                  className="w-full border bg-transparent px-4 py-3 text-sm outline-none"
                  style={{ borderColor: border }}
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleLogin}
                  disabled={busy}
                  className="border px-4 py-3 text-sm font-medium"
                  style={{ backgroundColor: accentBg, borderColor: border }}
                >
                  登录
                </button>
                <button
                  onClick={handleRegister}
                  disabled={busy}
                  className="border px-4 py-3 text-sm"
                  style={{ borderColor: border }}
                >
                  注册
                </button>
                <button
                  onClick={handleSignOut}
                  disabled={busy}
                  className="border px-4 py-3 text-sm"
                  style={{ borderColor: border }}
                >
                  切换为访客
                </button>
              </div>
            </div>
          </section>

          <section className="shell-panel border p-5 sm:p-6" style={{ backgroundColor: surface, borderColor: border }}>
            <div className="shell-label mb-3">Sync</div>
            <div className="shell-title mb-3 flex items-center gap-2 text-lg font-medium">
              <RefreshCw size={16} />
              同步状态
            </div>
            <div className="space-y-2 text-sm opacity-80">
              <div>待同步队列：{appState?.sync.pending_jobs ?? 0}</div>
              <div>自动同步：{appState?.sync.auto_sync_enabled ? '已开启' : '已关闭'}</div>
              <div>上次同步：{appState?.sync.last_synced_at ?? '尚未同步'}</div>
              <div>上次拉取：{appState?.sync.last_pulled_at ?? '尚未拉取'}</div>
              <div>最近错误：{appState?.sync.last_error ?? '无'}</div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={handleSyncNow}
                disabled={busy}
                className="border px-4 py-3 text-sm font-medium"
                style={{ backgroundColor: accentBg, borderColor: border }}
              >
                立即同步
              </button>
              <button
                onClick={handleImport}
                disabled={busy}
                className="border px-4 py-3 text-sm"
                style={{ borderColor: border }}
              >
                <Database size={14} className="mr-1 inline" />
                导入旧工作区
              </button>
              {appState?.account_mode !== 'guest' && <button disabled={busy} onClick={() => void handleRecover('guest')}
                className="border px-4 py-3 text-sm" style={{ borderColor: border }}>复制访客文档到当前账号</button>}
              {appState?.recovery_available && <button disabled={busy} onClick={() => void handleRecover('legacy')}
                className="border px-4 py-3 text-sm" style={{ borderColor: border }}>恢复归属不明的旧数据库</button>}
            </div>
          </section>

          {appState && <SpaceBackupPanel scope={appState.account_scope} disabled={busy} onBusyChange={setBusy} onImported={refresh} />}

          <section className="shell-panel border p-5 sm:p-6" style={{ backgroundColor: surface, borderColor: border }}>
            <div className="shell-label mb-3">Hosted Limits</div>
            <div className="shell-title mb-3 flex items-center gap-2 text-lg font-medium">
              <Shield size={16} />
              公共服务上限
            </div>
            <div className="space-y-2 text-sm opacity-80">
              <div>单文档大小：{appState ? formatBytes(appState.limits.max_document_content_bytes) : '512 KB'}</div>
              <div>总存储上限：{appState ? (appState.limits.max_total_storage_bytes ? formatBytes(appState.limits.max_total_storage_bytes) : '当前模式不设总量上限') : '25 MB'}</div>
              <div>文档数量上限：{appState?.limits.max_document_count || '当前模式不设数量上限'}</div>
              <div>5 分钟写入上限：{appState?.limits.max_write_ops_per_5_minutes || '当前模式不设频率上限'}</div>
              <div>当前文档数：{appState?.limits.current_document_count ?? 0}</div>
              <div>
                当前存储：{appState ? formatBytes(appState.limits.current_total_storage_bytes) : '0 B'}
              </div>
              <div>最近 5 分钟写入：{appState?.limits.current_write_ops_last_5_minutes ?? 0}</div>
              <div>附件上传：{appState?.limits.attachments_enabled ? '已开启' : '暂未实现'}</div>
            </div>
          </section>

          <section className="shell-panel border p-5 sm:p-6" style={{ backgroundColor: surface, borderColor: border }}>
            <div className="shell-label mb-3">Advanced</div>
            <div className="shell-title mb-4 flex items-center gap-2 text-lg font-medium">
              <Shield size={16} />
              自托管与高级操作
            </div>
            <p className="mb-4 text-sm leading-7 opacity-75">
              只有在你要切换到自己的 Supabase 实例时，才需要展开这里。留空则继续使用应用内置的公共服务。
            </p>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setShowAdvancedConfig((current) => !current)}
                className="border px-4 py-3 text-sm"
                style={{ borderColor: border }}
              >
                {showAdvancedConfig ? '收起高级配置' : '展开高级配置'}
              </button>
            </div>

            {showAdvancedConfig && (
              <div className="mt-4 space-y-4 border px-4 py-4" style={{ borderColor: border }}>
                <label className="block">
                  <div className="mb-2 text-sm font-medium">Supabase URL</div>
                  <input
                    value={supabaseUrl}
                    onChange={(event) => setSupabaseUrl(event.target.value)}
                    placeholder="https://your-project.supabase.co"
                    className="w-full border bg-transparent px-4 py-3 text-sm outline-none"
                    style={{ borderColor: border }}
                  />
                </label>

                <label className="block">
                  <div className="mb-2 text-sm font-medium">Anon Key</div>
                  <textarea
                    value={supabaseAnonKey}
                    onChange={(event) => setSupabaseAnonKey(event.target.value)}
                    placeholder="粘贴 Supabase anon key"
                    className="min-h-[120px] w-full border bg-transparent px-4 py-3 text-sm outline-none"
                    style={{ borderColor: border }}
                  />
                </label>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleSaveAdvanced}
                    disabled={busy}
                    className="border px-4 py-3 text-sm font-medium"
                    style={{ backgroundColor: accentBg, borderColor: border }}
                  >
                    <Link2 size={14} className="mr-1 inline" />
                    保存高级配置
                  </button>
                  <button
                    onClick={handleVerify}
                    disabled={busy}
                    className="border px-4 py-3 text-sm"
                    style={{ borderColor: border }}
                  >
                    <CheckCircle2 size={14} className="mr-1 inline" />
                    连接自检
                  </button>
                </div>

                {validationMessage && (
                  <div className="border px-4 py-3 text-sm" style={{ borderColor: border }}>
                    {validationMessage}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
