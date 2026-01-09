/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx}',
  ],
  // 启用 JIT 模式（Tailwind v3 默认启用，但确保配置正确）
  mode: 'jit',
  theme: {
    extend: {},
  },
  plugins: [],
  // 由于我们使用内联样式来应用自定义颜色，safelist 主要用于其他 Tailwind 类
  safelist: [
    // 保留一些可能用到的类
    'bg-black',
    'text-stone-300',
    'text-stone-800',
  ],
}

