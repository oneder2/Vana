/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tauri 开发模式不需要 standalone 输出
  // output: 'standalone', // 开发时注释掉
  // 禁用图片优化（Tauri 环境不需要）
  images: {
    unoptimized: true,
  },
  // 确保在开发模式下正确工作
  reactStrictMode: true,
}

module.exports = nextConfig

