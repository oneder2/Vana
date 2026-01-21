/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tauri 生产构建需要静态导出
  output: 'export',
  // 禁用图片优化（Tauri 环境不需要）
  images: {
    unoptimized: true,
  },
  // 确保在开发模式下正确工作
  reactStrictMode: true,
}

module.exports = nextConfig

