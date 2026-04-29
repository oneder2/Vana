'use client';

import React, { useEffect, useState } from 'react';
import { ArrowRight, Database, Link2, Shield, UserRound } from 'lucide-react';
import { TitleBar } from '@/components/TitleBar';
import { useTheme } from '@/components/ThemeProvider';
import { useToast } from '@/components/ToastProvider';
import { completeOnboarding, ensureWorkspaceInitialized, getAppState, type AppState } from '@/lib/api';
import { signInWithPassword, signUpWithPassword } from '@/lib/supabaseSync';
import {
  getThemeAccentBgColor,
  getThemeAccentColor,
  getThemeBgColor,
  getThemeBorderColor,
  getThemeSurfaceColor,
} from '@/lib/themeStyles';
import { AppLink, useRouter } from '@/lib/router';

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${Math.round(value / 1024)} KB`;
  }
  return `${value} B`;
}

export default function WelcomePage() {
  const { theme } = useTheme();
  const toast = useToast();
  const { navigate } = useRouter();
  const accent = getThemeAccentColor(theme);
  const accentBg = getThemeAccentBgColor(theme);
  const border = getThemeBorderColor(theme);
  const surface = getThemeSurfaceColor(theme);
  const background = getThemeBgColor(theme);

  const [appState, setAppState] = useState<AppState | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      await ensureWorkspaceInitialized();
      setAppState(await getAppState());
    })();
  }, []);

  const finishAsGuest = async () => {
    setBusy(true);
    try {
      await completeOnboarding();
      navigate('/');
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
      await signInWithPassword(email.trim(), password);
      await completeOnboarding();
      toast.success('登录成功');
      navigate('/');
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
      if (result.needsEmailConfirmation) {
        toast.success('注册成功，请先到邮箱确认账号，再返回登录');
      } else {
        toast.success('注册并登录成功');
        navigate('/');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="shell-page flex min-h-screen flex-col"
      style={{
        backgroundColor: background,
        color: accent,
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <TitleBar />

      <main className="mx-auto flex w-full max-w-6xl flex-1 items-stretch px-4 py-4 sm:px-6 sm:py-8">
        <div className="grid w-full gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="shell-panel border px-5 py-6 sm:px-8 sm:py-7" style={{ backgroundColor: surface, borderColor: border }}>
            <div className="shell-label mb-3">Welcome</div>
            <h1 className="shell-title max-w-2xl text-2xl font-semibold sm:text-4xl">本地优先，可同步的个人文档空间。</h1>
            <p className="mt-4 hidden max-w-2xl text-sm leading-7 opacity-78 sm:block">
              你可以先以访客身份直接开始写作，也可以使用邮箱和密码登录，开启基于 Supabase Hosted 的多设备同步。
            </p>

            <div className="mt-6 grid gap-3 sm:mt-8 sm:grid-cols-3">
              <div className="rounded border px-4 py-4" style={{ borderColor: border, backgroundColor: `${accentBg}18` }}>
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <UserRound size={15} />
                  访客可用
                </div>
                <div className="text-sm opacity-75">不登录也能创建、编辑和整理文档，数据默认保存在本地。</div>
              </div>

              <div className="rounded border px-4 py-4" style={{ borderColor: border, backgroundColor: `${accentBg}12` }}>
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Link2 size={15} />
                  Hosted 同步
                </div>
                <div className="text-sm opacity-75">登录后自动进入同步模式，访问令牌过期后会尝试自动续期。</div>
              </div>

              <div className="hidden rounded border px-4 py-4 sm:block" style={{ borderColor: border, backgroundColor: `${accentBg}10` }}>
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Shield size={15} />
                  Hosted 限额
                </div>
                <div className="text-sm opacity-75">
                  单文档 {appState ? formatBytes(appState.limits.max_document_content_bytes) : '512 KB'}，
                  总存储 {appState ? formatBytes(appState.limits.max_total_storage_bytes) : '25 MB'}。
                </div>
              </div>
            </div>

            <div className="mt-8 hidden rounded border px-4 py-4 text-sm sm:block" style={{ borderColor: border }}>
              <div className="mb-2 flex items-center gap-2 font-medium">
                <Database size={15} />
                当前 Hosted 策略
              </div>
              <div className="space-y-1 opacity-78">
                <div>文档数量上限：{appState?.limits.max_document_count ?? 5000}</div>
                <div>5 分钟写入上限：{appState?.limits.max_write_ops_per_5_minutes ?? 300}</div>
                <div>附件上传：{appState?.limits.attachments_enabled ? '已开启' : '当前公共服务未开放'}</div>
                <div>服务来源：{appState?.service_profile ?? 'hosted'}</div>
              </div>
            </div>
          </section>

          <section className="shell-panel border px-5 py-6 sm:px-6" style={{ backgroundColor: surface, borderColor: border }}>
            <div className="shell-label mb-3">Access</div>
            <h2 className="shell-title text-xl font-semibold">登录或继续使用</h2>
            <p className="mt-3 hidden text-sm leading-7 opacity-76 sm:block">
              普通用户直接使用默认公共服务即可。只有需要自托管时，才需要进入高级配置。
            </p>

            <div className="mt-6 space-y-3">
              <div>
                <div className="mb-2 text-sm opacity-75">邮箱</div>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="w-full border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: border, backgroundColor: 'transparent', color: accent }}
                />
              </div>
              <div>
                <div className="mb-2 text-sm opacity-75">密码</div>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  placeholder="至少使用你自己能记住的密码"
                  className="w-full border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: border, backgroundColor: 'transparent', color: accent }}
                />
              </div>
            </div>

            <div className="mt-5 grid gap-2">
              <button
                type="button"
                className="border px-4 py-2 text-sm font-medium"
                style={{ borderColor: border, backgroundColor: accentBg, color: accent }}
                onClick={() => void handleLogin()}
                disabled={busy}
              >
                登录并开始同步
              </button>
              <button
                type="button"
                className="border px-4 py-2 text-sm"
                style={{ borderColor: border, color: accent }}
                onClick={() => void handleRegister()}
                disabled={busy}
              >
                注册账号
              </button>
              <button
                type="button"
                className="border px-4 py-2 text-sm"
                style={{ borderColor: border, color: accent }}
                onClick={() => void finishAsGuest()}
                disabled={busy}
              >
                继续以访客身份使用
              </button>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
              <AppLink href="/settings" className="inline-flex items-center gap-1 opacity-78 transition-opacity hover:opacity-100">
                高级配置
                <ArrowRight size={14} />
              </AppLink>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
