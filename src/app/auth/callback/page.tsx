'use client';

import { useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { AppLink } from '@/lib/router';

export default function AuthCallbackPage() {
  useEffect(() => {
    // Email confirmation needs no copied bearer/refresh tokens. Remove any
    // legacy implicit-flow fragment from the address bar and browser history.
    if (window.location.hash) window.history.replaceState({}, '', window.location.pathname);
  }, []);
  return <div className="preferences-page px-6 py-12">
    <main className="mx-auto max-w-xl">
      <CheckCircle2 size={24} className="mb-4" />
      <h1 className="text-xl font-medium">返回 Vana 完成登录</h1>
      <p className="mt-3 text-sm leading-7">邮箱确认完成后，请在 Vana 账号页使用邮箱和密码登录。</p>
      <AppLink href="/account" className="ui-button ui-button-primary mt-5">返回账号页</AppLink>
    </main>
  </div>;
}
