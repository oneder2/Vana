'use client';

import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
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
  const [showLogin, setShowLogin] = useState(false);
  const syncConfigured = Boolean(appState?.supabase.url && appState.supabase.anon_key);

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
    <div className="shell-page flex min-h-screen flex-col" style={{ backgroundColor: background, color: accent, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <TitleBar />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-12 sm:py-16">
        <p className="mb-5 text-sm tracking-widest opacity-55">Vana</p>
        <h1 className="shell-title text-3xl font-semibold leading-tight sm:text-4xl">写作，从这里开始。</h1>
        <p className="mt-5 text-sm leading-7 opacity-70">用文档整理思考，随时阅读与回看修改。</p>
        <button type="button" className="mt-8 flex min-h-12 w-full items-center justify-center gap-2 rounded border px-5 py-3 text-sm font-medium disabled:opacity-50" style={{ borderColor: border, backgroundColor: accentBg }} onClick={() => void finishAsGuest()} disabled={busy}>
          开始写作<ArrowRight size={16} />
        </button>
        <p className="mt-3 text-center text-xs opacity-55">无需账号，文档保存在此设备。</p>
        <button type="button" className="mx-auto mt-6 min-h-11 px-4 text-sm hover:underline" aria-expanded={showLogin} aria-controls="welcome-login" onClick={() => setShowLogin(value => !value)}>登录或注册</button>
        {showLogin && <section id="welcome-login" className="mt-4 rounded border px-5 py-6" style={{ borderColor: border, backgroundColor: surface }}>
          <h2 className="shell-title text-lg font-medium">登录以同步文档</h2>
          <p className="mt-2 text-xs leading-6 opacity-65">{syncConfigured ? '登录后使用账号文档，已有的本机文档会保留。' : '同步服务尚未连接，可先开始写作，或在设置中连接服务。'}</p>
          <div className="mt-5 space-y-4">
            <label className="block"><span className="mb-2 block text-sm">邮箱</span><input type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" className="w-full rounded border bg-transparent px-3 py-3 text-sm outline-none" style={{ borderColor: border }} /></label>
            <label className="block"><span className="mb-2 block text-sm">密码</span><input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="输入密码" className="w-full rounded border bg-transparent px-3 py-3 text-sm outline-none" style={{ borderColor: border }} /></label>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" className="min-h-11 flex-1 rounded border px-4 py-2 text-sm font-medium disabled:opacity-50" style={{ borderColor: border, backgroundColor: accentBg }} onClick={() => void handleLogin()} disabled={busy || !syncConfigured}>登录并开始同步</button>
            <button type="button" className="min-h-11 rounded border px-4 py-2 text-sm disabled:opacity-50" style={{ borderColor: border }} onClick={() => void handleRegister()} disabled={busy || !syncConfigured}>注册账号</button>
          </div>
          {!syncConfigured && <AppLink href="/settings" className="mt-4 inline-block text-xs hover:underline">连接同步服务</AppLink>}
        </section>}
      </main>
    </div>
  );
}
