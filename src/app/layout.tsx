/**
 * No Visitors - 根布局组件
 * Next.js App Router 的根布局
 * 包含主题提供者和全局样式
 */

import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/ThemeProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'No Visitors - Git-based Arcane Archive',
  description: '零知识加密的 Git-based 文档管理系统',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

