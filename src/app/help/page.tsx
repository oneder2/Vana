'use client';

import React from 'react';
import { TitleBar } from '@/components/TitleBar';
import { useTheme } from '@/components/ThemeProvider';
import { useRouter } from '@/lib/router';
import {
  getThemeAccentBgColor,
  getThemeAccentColor,
  getThemeBgColor,
  getThemeBorderColor,
  getThemeSurfaceColor,
} from '@/lib/themeStyles';

export default function HelpPage() {
  const { theme } = useTheme();
  const { navigate } = useRouter();
  const accent = getThemeAccentColor(theme);
  const accentBg = getThemeAccentBgColor(theme);
  const border = getThemeBorderColor(theme);
  const background = getThemeBgColor(theme);
  const surface = getThemeSurfaceColor(theme);

  const faqs = [
    {
      q: '为什么文档不会自动出现在云端文件夹里？',
      a: '当前版本已经切到 Supabase 同步，不再以 Git 仓库作为主同步形态。文档写入本地数据库，再通过同步队列增量上传。',
    },
    {
      q: '移动端和桌面端内容不一致怎么办？',
      a: '先进入设置页确认已登录同一个 Supabase 账户，然后手动执行一次同步。如果仍不一致，再检查网络和账号配置。',
    },
    {
      q: '导出支持哪些格式？',
      a: '当前支持 Markdown、DOCX 和 PDF。PDF 已切到 Typst 路线，适合后续继续提升版式稳定性。',
    },
    {
      q: '为什么有些旧功能入口消失了？',
      a: '项目正在从早期 Git/目录驱动架构收敛到 SQL/Supabase 架构。少数旧入口已移除或归档，避免继续暴露语义不清的功能。',
    },
  ];

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: background, color: accent }}>
      <TitleBar />
      <main className="mx-auto flex w-full max-w-4xl flex-1 px-6 py-10">
        <div className="w-full space-y-6">
          <section className="rounded border px-6 py-6" style={{ backgroundColor: surface, borderColor: border }}>
            <div className="mb-4">
              <button
                type="button"
                className="border px-3 py-1.5 text-sm transition-opacity hover:opacity-85"
                style={{ borderColor: border, color: accent }}
                onClick={() => navigate('/')}
              >
                返回主页
              </button>
            </div>
            <div className="shell-label">Help</div>
            <h1 className="mt-2 text-3xl font-semibold">帮助与支持</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 opacity-75">
              这里整理当前版本最常见的问题，以及出现同步、导出、账户异常时的处理方向。
            </p>
          </section>

          <section className="space-y-3">
            {faqs.map((item) => (
              <article key={item.q} className="rounded border px-5 py-4" style={{ backgroundColor: surface, borderColor: border }}>
                <h2 className="text-base font-medium">{item.q}</h2>
                <p className="mt-2 text-sm leading-7 opacity-75">{item.a}</p>
              </article>
            ))}
          </section>

          <section
            className="rounded border px-6 py-5"
            style={{ backgroundColor: `${accentBg}35`, borderColor: border }}
          >
            <div className="shell-label">Support</div>
            <p className="mt-2 text-sm leading-7 opacity-80">
              如果你需要进一步技术支持，请发送邮件到
              {' '}
              <a className="underline underline-offset-4" href="mailto:eclospy@duck.com">
                eclospy@duck.com
              </a>
              。
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
