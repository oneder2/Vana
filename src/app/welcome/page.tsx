import { useState } from 'react';
import { ArrowRight, BookOpen, Loader2 } from 'lucide-react';
import { TitleBar } from '@/components/TitleBar';
import { FadeContent } from '@/components/motion/FadeContent';
import { useToast } from '@/components/ToastProvider';
import { completeOnboarding } from '@/lib/api';
import { AppLink, useRouter } from '@/lib/router';

export default function WelcomePage() {
  const toast = useToast();
  const { navigate } = useRouter();
  const [busy, setBusy] = useState(false);
  async function begin() {
    if (busy) return;
    setBusy(true);
    try { await completeOnboarding(); navigate('/'); }
    catch (error) { toast.error(error instanceof Error ? error.message : String(error)); setBusy(false); }
  }
  return <div className="welcome-page">
    <TitleBar />
    <main className="welcome-main">
      <FadeContent className="welcome-content">
        <div className="welcome-bookmark" aria-hidden="true"><BookOpen size={24} strokeWidth={1.5} /></div>
        <p className="welcome-brand">Vana</p>
        <h1>留一页，<br />给自己的想法。</h1>
        <p className="welcome-description">写下来，慢慢读。<br />用文档整理思考，随时回看修改。</p>
        <button type="button" className="ui-button ui-button-primary welcome-start" disabled={busy} onClick={() => void begin()}>开始写作{busy ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />}</button>
        <p className="welcome-local">无需账号，文档保存在此设备。</p>
        <AppLink href="/account" className="welcome-account">登录或注册<ArrowRight size={14} /></AppLink>
      </FadeContent>
    </main>
  </div>;
}
