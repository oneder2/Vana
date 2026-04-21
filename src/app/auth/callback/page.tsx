'use client';

import React, { useMemo, useState } from 'react';
import { CheckCircle2, Copy, ExternalLink } from 'lucide-react';
import { AppLink } from '@/lib/router';

function readFragment(): string {
  if (typeof window === 'undefined') return '';
  return window.location.hash ? window.location.hash.slice(1) : '';
}

export default function AuthCallbackPage() {
  const [copied, setCopied] = useState(false);
  const fragment = useMemo(() => readFragment(), []);
  const fullUrl = typeof window !== 'undefined' ? window.location.href : '';

  const handleCopy = async () => {
    const payload = fullUrl || `#${fragment}`;
    await navigator.clipboard.writeText(payload);
    setCopied(true);
  };

  return (
    <div className="min-h-screen bg-stone-950 px-4 py-10 text-stone-100">
      <div className="mx-auto max-w-2xl rounded-[28px] border border-stone-800 bg-stone-900 p-6">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 size={18} />
          Supabase 登录回调已捕获
        </div>
        <h1 className="text-2xl font-semibold">把这段回调带回 Vana 设置页即可完成登录。</h1>
        <p className="mt-3 text-sm text-stone-300">
          目前桌面主线还没有接系统 URL scheme，所以先用这页做过渡。复制完整 URL，然后在设置页的“导入会话”区域粘贴即可。
        </p>

        <div className="mt-5 rounded-2xl border border-stone-800 bg-stone-950 p-4 text-xs break-all text-stone-300">
          {fullUrl || '未检测到回调 hash。请确认邮件链接已携带 access_token。'}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={handleCopy}
            className="rounded-2xl bg-stone-100 px-4 py-3 text-sm font-medium text-stone-950"
          >
            <Copy size={14} className="mr-1 inline" />
            {copied ? '已复制' : '复制回调 URL'}
          </button>
          <AppLink href="/settings" className="rounded-2xl border border-stone-700 px-4 py-3 text-sm">
            返回设置页
          </AppLink>
          <a
            href="https://supabase.com/docs/guides/auth"
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl border border-stone-700 px-4 py-3 text-sm"
          >
            <ExternalLink size={14} className="mr-1 inline" />
            Supabase Auth Docs
          </a>
        </div>
      </div>
    </div>
  );
}
