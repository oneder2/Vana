import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, Loader2, LogOut, RefreshCw, UserRound } from 'lucide-react';
import { PreferencesLayout } from '@/components/PreferencesLayout';
import { useToast } from '@/components/ToastProvider';
import { AppLink } from '@/lib/router';
import { completeOnboarding, ensureWorkspaceInitialized, getAppState, getSupabaseSession, recoverLocalDocuments, type AppState } from '@/lib/api';
import { runSupabaseSync, signInWithPassword, signOutSupabase, signUpWithPassword } from '@/lib/supabaseSync';

export default function AccountPage() {
  const toast = useToast();
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const actionPending = useRef(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [credentialError, setCredentialError] = useState('');

  async function refresh() {
    const next = await getAppState();
    setState(next);
    setCredentialError('');
    try { await getSupabaseSession(); }
    catch (error) { setCredentialError(error instanceof Error ? error.message : String(error)); }
  }

  async function load() {
    setLoading(true); setError('');
    try { await ensureWorkspaceInitialized(); await refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function perform(action: () => Promise<void>) {
    if (actionPending.current) return;
    actionPending.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { actionPending.current = false; setBusy(false); }
  }

  function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password.trim()) { setError('请填写邮箱和密码。'); return; }
    void perform(async () => {
      if (mode === 'login') {
        await signInWithPassword(email.trim(), password);
        await completeOnboarding(); await refresh(); setNotice('登录成功。');
      } else {
        const result = await signUpWithPassword(email.trim(), password);
        await completeOnboarding(); await refresh();
        if (result.needsEmailConfirmation) {
          setMode('login'); setNotice('注册成功。请先到邮箱确认账号，再返回登录。');
        } else { setNotice('注册并登录成功。'); }
      }
      setPassword('');
    });
  }

  const signedIn = state?.account_mode === 'authenticated';
  const configured = Boolean(state?.supabase.url && state.supabase.anon_key);
  const disabled = loading || busy || !state;

  return <PreferencesLayout active="account" title="账号" description="在不同设备上，接着读，接着写。">
    {loading && <p role="status" className="preference-message"><Loader2 size={16} className="animate-spin" />正在读取账号…</p>}
    {state && <>
      <section className="account-identity" aria-labelledby="account-identity-title">
        <span className="account-avatar" aria-hidden="true"><UserRound size={24} strokeWidth={1.5} /></span>
        <div className="min-w-0">
          <h2 id="account-identity-title" className="break-words">{signedIn ? state.account_email || '已登录账号' : '本机写作'}</h2>
          <p role="status" aria-label={`当前身份：${signedIn ? '已登录' : '访客'}`}>{signedIn ? '当前身份：已登录' : '当前身份：访客'}</p>
        </div>
      </section>
      {signedIn ? <>
        <section className="preference-section" aria-labelledby="account-sync-title">
          <div className="preference-section-heading"><h2 id="account-sync-title">文档同步</h2><RefreshCw size={18} aria-hidden="true" /></div>
          <p className="preference-description">{state.sync.pending_jobs ? '还有更改等待同步。' : state.sync.last_synced_at ? `上次同步：${new Date(state.sync.last_synced_at).toLocaleString()}` : '尚未同步。'}</p>
          {state.sync.last_error && <p role="alert" className="preference-error">同步未完成：{state.sync.last_error}</p>}
          <div className="preference-actions">
            <button disabled={disabled} className="ui-button ui-button-primary" onClick={() => void perform(async () => {
              const snapshot = await runSupabaseSync(); await refresh();
              setNotice(snapshot.pending_jobs ? '还有更改等待同步。' : '同步完成。');
              if (snapshot.conflict_copies) toast.info(`已保留 ${snapshot.conflict_copies} 份修改副本，可回到文档查看。`);
            })}>{busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}立即同步</button>
          </div>
        </section>
        <section className="preference-section" aria-labelledby="account-local-title">
          <h2 id="account-local-title">带上本机文档</h2>
          <p className="preference-description">将访客模式下的文档复制到账号，本机原文档会保留。</p>
          <button disabled={disabled} className="ui-button mt-4" onClick={() => {
            if (!window.confirm('复制本机文档到账号？原文档会保留，复制的文档可随账号同步。')) return;
            void perform(async () => { const count = await recoverLocalDocuments('guest'); await refresh(); setNotice(`已复制 ${count} 个文档与分组。`); });
          }}>复制本机文档到账号<ArrowRight size={16} /></button>
        </section>
        <section className="account-signout">
          <p className="preference-description">退出后可继续使用本机文档，账号文档仍会保留。</p>
          <button disabled={disabled} className="ui-button ui-button-quiet" onClick={() => void perform(async () => {
            await signOutSupabase(); await refresh(); setNotice('已退出登录，切换为访客。');
          })}><LogOut size={16} />退出登录</button>
        </section>
      </> : <section className="preference-section account-auth" aria-label="登录或注册">
        <div className="account-mode" role="group" aria-label="账号操作">
          <button type="button" aria-pressed={mode === 'login'} disabled={busy} onClick={() => { setMode('login'); setError(''); setNotice(''); }}>登录</button>
          <button type="button" aria-pressed={mode === 'register'} disabled={busy} onClick={() => { setMode('register'); setError(''); setNotice(''); }}>注册</button>
        </div>
        <p className="preference-description">{mode === 'login' ? '登录后使用账号文档，已有的本机文档会保留。' : '创建账号，在其他设备上继续使用文档。'}</p>
        <form className="account-form" onSubmit={authenticate} aria-busy={busy}>
          <label className="ui-field"><span>邮箱</span><input type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={email} disabled={busy} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></label>
          <label className="ui-field"><span>密码</span><input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required value={password} disabled={busy} onChange={event => setPassword(event.target.value)} placeholder={mode === 'login' ? '输入密码' : '设置密码'} /></label>
          <button type="submit" disabled={disabled || !configured} className="ui-button ui-button-primary w-full">{busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}{busy ? '请稍候…' : mode === 'login' ? '登录并开始同步' : '注册账号'}</button>
        </form>
        {!configured && <p className="preference-description mt-4">同步服务尚未连接。可先<AppLink href="/" className="ui-text-link">开始本机写作</AppLink>，或到<AppLink href="/settings" className="ui-text-link">设置</AppLink>连接服务。</p>}
      </section>}
    </>}
    {credentialError && <p role="alert" className="preference-error">登录信息无法读取：{credentialError}。请解锁系统凭据库或重新登录，本机文档仍可使用。</p>}
    {error && <div role="alert" className="preference-error">{error}{!state && !loading && <button className="ui-text-link ml-3" onClick={() => void load()}>重新读取</button>}</div>}
    {notice && <p role="status" className="preference-message"><Check size={17} />{notice}</p>}
    {signedIn && <AppLink href="/" className="ui-button ui-button-quiet mt-5">继续写作<ArrowRight size={16} /></AppLink>}
  </PreferencesLayout>;
}
