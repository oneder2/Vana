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
  return <div className="min-h-screen bg-stone-950 px-4 py-10 text-stone-100">
    <div className="mx-auto max-w-xl rounded-xl border border-stone-800 bg-stone-900 p-6">
      <CheckCircle2 size={24} className="mb-4" />
      <h1 className="text-xl font-medium">返回 Vana 完成登录</h1>
      <p className="mt-3 text-sm leading-7 text-stone-300">邮箱确认完成后，请在 Vana 设置页使用邮箱和密码登录。</p>
      <AppLink href="/settings" className="mt-5 inline-flex rounded-md border border-stone-700 px-4 py-3 text-sm">返回设置页</AppLink>
    </div>
  </div>;
}
