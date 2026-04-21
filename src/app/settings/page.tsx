'use client';

import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  ExternalLink,
  Link2,
  Mail,
  RefreshCw,
  Shield,
} from 'lucide-react';
import { TitleBar } from '@/components/TitleBar';
import { useTheme } from '@/components/ThemeProvider';
import { useToast } from '@/components/ToastProvider';
import {
  ensureWorkspaceInitialized,
  getAppState,
  getSupabaseConfig,
  getSupabaseSession,
  importLegacyWorkspace,
  saveSupabaseConfig,
  type AppState,
} from '@/lib/api';
import { importSupabaseSession, runSupabaseSync, signOutSupabase } from '@/lib/supabaseSync';
import {
  getThemeAccentBgColor,
  getThemeAccentColor,
  getThemeBgColor,
  getThemeBorderColor,
  getThemeSurfaceColor,
} from '@/lib/themeStyles';
import { AppLink } from '@/lib/router';

async function validateSupabase(url: string, anonKey: string): Promise<void> {
  const normalized = url.replace(/\/+$/, '');
  const response = await fetch(`${normalized}/auth/v1/settings`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase 返回 ${response.status}`);
  }
}

async function requestMagicLink(url: string, anonKey: string, email: string): Promise<void> {
  const normalized = url.replace(/\/+$/, '');
  const redirectTo =
    typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined;
  const response = await fetch(`${normalized}/auth/v1/otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({
      email,
      create_user: true,
      email_redirect_to: redirectTo,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Magic link 请求失败: ${response.status}`);
  }
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
  const [sessionInput, setSessionInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [sessionSummary, setSessionSummary] = useState<string | null>(null);

  const refresh = async () => {
    const [state, config, session] = await Promise.all([getAppState(), getSupabaseConfig(), getSupabaseSession()]);
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
    })();
  }, []);

  const handleSave = async () => {
    setBusy(true);
    setValidationMessage(null);
    try {
      if (supabaseUrl.trim() && supabaseAnonKey.trim()) {
        await validateSupabase(supabaseUrl.trim(), supabaseAnonKey.trim());
      }
      await saveSupabaseConfig({
        url: supabaseUrl.trim() || null,
        anon_key: supabaseAnonKey.trim() || null,
      });
      await refresh();
      setValidationMessage('连接信息已保存，当前主线会继续以本地优先方式运行。');
      toast.success('Supabase 配置已保存');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setValidationMessage(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const handleMagicLink = async () => {
    if (!supabaseUrl.trim() || !supabaseAnonKey.trim() || !email.trim()) {
      toast.error('请先填写 Supabase URL、Anon Key 和邮箱');
      return;
    }

    setBusy(true);
    try {
      await requestMagicLink(supabaseUrl.trim(), supabaseAnonKey.trim(), email.trim());
      toast.success('Magic link 已发送，请检查邮箱');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

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

  const handleSessionImport = async () => {
    if (!sessionInput.trim()) {
      toast.error('请粘贴登录回调 URL、hash 或会话 JSON');
      return;
    }

    setBusy(true);
    try {
      const session = await importSupabaseSession(sessionInput);
      setSessionInput('');
      await refresh();
      toast.success(`会话已导入：${session.email ?? session.user_id ?? 'unknown user'}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleSyncNow = async () => {
    setBusy(true);
    try {
      const snapshot = await runSupabaseSync();
      await refresh();
      toast.success(`同步完成，剩余待同步 ${snapshot.pending_jobs}`);
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
      toast.success('已退出当前 Supabase 会话');
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
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noreferrer"
            className="border px-3 py-2 text-sm"
            style={{ borderColor: border }}
          >
            <ExternalLink size={14} className="mr-1 inline" />
            Supabase 控制台
          </a>
        </div>

        <div className="space-y-5">
          <section className="shell-panel border px-5 py-6 sm:px-6" style={{ backgroundColor: surface, borderColor: border }}>
            <div className="shell-label mb-2">Confluence</div>
            <h1 className="shell-title text-3xl font-semibold">Supabase 主线配置</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 opacity-75">
              这里不再是旧式仓库同步入口，而是当前主线的账号与汇流点。先保存连接信息，再发送 Magic Link，最后导入会话。
            </p>
          </section>

          <section className="shell-panel border p-5 sm:p-6" style={{ backgroundColor: surface, borderColor: border }}>
            <div className="shell-label mb-3">Step 1</div>
            <div className="shell-title mb-4 text-lg font-medium">保存连接信息</div>

            <div className="space-y-4">
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
                  onClick={handleSave}
                  disabled={busy}
                  className="border px-4 py-3 text-sm font-medium"
                  style={{ backgroundColor: accentBg, borderColor: border }}
                >
                  {busy ? <RefreshCw size={14} className="mr-1 inline animate-spin" /> : <Link2 size={14} className="mr-1 inline" />}
                  保存并校验
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
              </div>

              {validationMessage && (
                <div className="border px-4 py-3 text-sm" style={{ borderColor: border }}>
                  {validationMessage}
                </div>
              )}

              <div className="border px-4 py-3 text-sm opacity-80" style={{ borderColor: border }}>
                <div className="shell-label mb-2">固定要求</div>
                <div>1. 先在 Supabase 执行仓库里的 `supabase/migrations/`</div>
                <div>2. 在 Auth 的 Redirect URLs 加入 `{typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '/auth/callback'}`</div>
                <div>3. 配置完成后，再发送 Magic Link 并导入会话；主界面会自动增量同步</div>
              </div>
            </div>
          </section>

          <section className="shell-panel border p-5 sm:p-6" style={{ backgroundColor: surface, borderColor: border }}>
            <div className="shell-label mb-3">Step 2</div>
            <div className="shell-title mb-3 flex items-center gap-2 text-lg font-medium">
              <Mail size={16} />
              请求登录链接
            </div>
            <p className="mb-4 text-sm leading-7 opacity-75">
              发送邮箱登录链接，然后把回调 URL 或 hash 粘贴回来导入会话。这样不用先接系统级 URL scheme。
            </p>
            <div className="mb-3 border px-4 py-3 text-xs opacity-75" style={{ borderColor: border }}>
              当前建议在 Supabase 的 Redirect URLs 中加入：
              <div className="mt-2 break-all font-mono text-[11px] opacity-100">
                {typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '/auth/callback'}
              </div>
            </div>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="mb-3 w-full border bg-transparent px-4 py-3 text-sm outline-none"
              style={{ borderColor: border }}
            />
            <button
              onClick={handleMagicLink}
              disabled={busy}
              className="w-full border px-4 py-3 text-sm font-medium"
              style={{ backgroundColor: accentBg, borderColor: border }}
            >
              <CheckCircle2 size={14} className="mr-1 inline" />
              发送 Magic Link
            </button>
          </section>

          <section className="shell-panel border p-5 sm:p-6" style={{ backgroundColor: surface, borderColor: border }}>
            <div className="shell-label mb-3">Step 3</div>
            <div className="shell-title mb-3 flex items-center gap-2 text-lg font-medium">
              <CheckCircle2 size={16} />
              导入会话并同步
            </div>
            <p className="mb-4 text-sm leading-7 opacity-75">
              粘贴 Supabase 邮件回调 URL、`#access_token=...` 片段，或包含 `access_token` 的 JSON。导入后即可手动触发一次同步。
            </p>
            <textarea
              value={sessionInput}
              onChange={(event) => setSessionInput(event.target.value)}
              placeholder="粘贴回调 URL / hash / JSON"
              className="mb-3 min-h-[120px] w-full border bg-transparent px-4 py-3 text-sm outline-none"
              style={{ borderColor: border }}
            />
            <div className="mb-3 text-xs opacity-65">
              当前会话：{sessionSummary ?? '未导入'}
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleSessionImport}
                disabled={busy}
                className="border px-4 py-3 text-sm font-medium"
                style={{ backgroundColor: accentBg, borderColor: border }}
              >
                导入会话
              </button>
              <button
                onClick={handleSyncNow}
                disabled={busy}
                className="border px-4 py-3 text-sm"
                style={{ borderColor: border }}
              >
                立即同步
              </button>
              <button
                onClick={handleSignOut}
                disabled={busy}
                className="border px-4 py-3 text-sm"
                style={{ borderColor: border }}
              >
                退出登录
              </button>
            </div>
          </section>

          <section className="shell-panel border p-5 sm:p-6" style={{ backgroundColor: surface, borderColor: border }}>
              <div className="shell-label mb-3">State</div>
              <div className="shell-title mb-3 flex items-center gap-2 text-sm font-medium">
                <Shield size={16} />
                当前状态
              </div>
              <div className="space-y-2 text-sm opacity-80">
                <div>账户模式：{appState?.account_mode ?? 'guest'}</div>
                <div>账户邮箱：{appState?.account_email ?? '未登录'}</div>
                <div>同步模式：{appState?.sync.mode ?? 'local-only'}</div>
                <div>待同步队列：{appState?.sync.pending_jobs ?? 0}</div>
                <div>自动同步：{appState?.sync.auto_sync_enabled ? '已开启' : '已关闭'}</div>
                <div>上次同步：{appState?.sync.last_synced_at ?? '尚未同步'}</div>
                <div>上次拉取：{appState?.sync.last_pulled_at ?? '尚未拉取'}</div>
                <div>最近错误：{appState?.sync.last_error ?? '无'}</div>
                <div>旧工作区：{appState?.legacy_workspace_path ?? '未加载'}</div>
              </div>
          </section>
        </div>
      </div>
    </div>
  );
}
