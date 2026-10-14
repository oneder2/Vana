import type { ReactNode } from 'react';
import { ArrowLeft, Settings2, UserRound } from 'lucide-react';
import { AppLink } from '@/lib/router';
import { TitleBar } from './TitleBar';
import { FadeContent } from './motion/FadeContent';

export function PreferencesLayout({ active, title, description, children }: {
  active: 'account' | 'settings';
  title: string;
  description: string;
  children: ReactNode;
}) {
  return <div className="preferences-page">
    <TitleBar />
    <div className="preferences-layout">
      <aside className="preferences-rail">
        <AppLink href="/" className="preferences-back"><ArrowLeft size={16} />返回文档</AppLink>
        <nav aria-label="个人选项" className="preferences-nav">
          <AppLink href="/account" aria-current={active === 'account' ? 'page' : undefined} className="preferences-nav-item"><UserRound size={18} />账号</AppLink>
          <AppLink href="/settings" aria-current={active === 'settings' ? 'page' : undefined} className="preferences-nav-item"><Settings2 size={18} />设置</AppLink>
        </nav>
      </aside>
      <main className="preferences-content">
        <FadeContent key={active}>
          <header className="preferences-heading"><h1>{title}</h1><p>{description}</p></header>
          {children}
        </FadeContent>
      </main>
    </div>
  </div>;
}
