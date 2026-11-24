export type TextFont = 'song' | 'brush' | 'sans' | 'mono';

export const TEXT_FONTS: Record<TextFont, { name: string; family: string }> = {
  song: { name: '书刻', family: '"Vana Book", "Noto Serif CJK SC", serif' },
  brush: { name: '笔迹', family: '"Vana Brush", "KaiTi", cursive' },
  sans: { name: '清晰', family: '"Noto Sans CJK SC", "Microsoft YaHei", sans-serif' },
  mono: { name: '电码', family: '"Liberation Mono", "Noto Sans CJK SC", monospace' },
};
