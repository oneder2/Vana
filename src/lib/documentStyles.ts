import type { CSSProperties } from 'react';
import type { Theme } from './themes';
import {
  getThemeAccentColor,
  getThemeBgColor,
  getThemeBorderColor,
  getThemeSurfaceColor,
} from './themeStyles';

function rgbaToRgb(color: string): string {
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!rgbaMatch) {
    return color;
  }

  const [, r, g, b] = rgbaMatch;
  return `rgb(${r}, ${g}, ${b})`;
}

function withAlpha(color: string, alpha: number): string {
  const hex = color.trim().replace('#', '');
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!rgbMatch) {
    return color;
  }

  const [, r, g, b] = rgbMatch;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function pxToHalfPoints(px: number): number {
  return Math.round(px * 1.5);
}

export interface DocumentStyleTokens {
  pageBackgroundColor: string;
  surfaceColor: string;
  borderColor: string;
  accentColor: string;
  textColor: string;
  mutedColor: string;
  inlineCodeBackgroundColor: string;
  inlineCodeTextColor: string;
  codeBlockBackgroundColor: string;
  blockquoteBackgroundColor: string;
  blockquoteBorderColor: string;
  bodyFontSizePx: number;
  lineHeight: number;
  paragraphSpacingRem: number;
  h1SizeRem: number;
  h2SizeRem: number;
  h3SizeRem: number;
  headingMarginTopRem: number;
  headingMarginBottomRem: number;
  blockquotePaddingRem: number;
  blockquoteMarginYRem: number;
  blockquoteBorderWidthPx: number;
  blockquoteRadiusRem: number;
  listPaddingLeftRem: number;
  listItemSpacingRem: number;
  codeInlinePaddingYRem: number;
  codeInlinePaddingXRem: number;
  codeInlineRadiusRem: number;
  codeBlockPaddingRem: number;
  codeBlockMarginYRem: number;
  codeBlockRadiusRem: number;
  titleSizeRem: number;
  metaFontSizeRem: number;
  bodyFontFamily: string;
  headingFontFamily: string;
  monoFontFamily: string;
  headingLetterSpacingEm: number;
  titleLetterSpacingEm: number;
  typstSerifFonts: string[];
  typstSansFonts: string[];
  typstMonoFonts: string[];
}

export function getDocumentStyleTokens(theme: Theme): DocumentStyleTokens {
  const surfaceColor = getThemeSurfaceColor(theme);
  const accentColor = getThemeAccentColor(theme);
  const borderColor = rgbaToRgb(getThemeBorderColor(theme));
  const textColor = theme.id === 'vellum' ? '#292524' : '#d6d3d1';
  const mutedColor = theme.id === 'vellum' ? '#78716c' : '#a8a29e';
  const inlineCodeBackgroundColor = theme.id === 'vellum'
    ? withAlpha('#d3cebe', 0.6)
    : withAlpha(surfaceColor, 0.9);
  const codeBlockBackgroundColor = theme.id === 'vellum'
    ? withAlpha(surfaceColor, 0.95)
    : withAlpha('#0f0d17', 0.98);
  const blockquoteBackgroundColor = theme.id === 'vellum'
    ? withAlpha(surfaceColor, 0.85)
    : withAlpha(surfaceColor, 0.72);
  const isTerminal = theme.id === 'terminal';
  const isArcane = theme.id === 'arcane';

  return {
    pageBackgroundColor: getThemeBgColor(theme),
    surfaceColor,
    borderColor,
    accentColor,
    textColor,
    mutedColor,
    inlineCodeBackgroundColor,
    inlineCodeTextColor: textColor,
    codeBlockBackgroundColor,
    blockquoteBackgroundColor,
    blockquoteBorderColor: accentColor,
    bodyFontSizePx: 17,
    lineHeight: 1.72,
    paragraphSpacingRem: 0.8,
    h1SizeRem: 2.15,
    h2SizeRem: 1.6,
    h3SizeRem: 1.25,
    headingMarginTopRem: 1.45,
    headingMarginBottomRem: 0.65,
    blockquotePaddingRem: 1,
    blockquoteMarginYRem: 1.15,
    blockquoteBorderWidthPx: 3,
    blockquoteRadiusRem: 0.8,
    listPaddingLeftRem: 1.45,
    listItemSpacingRem: 0.35,
    codeInlinePaddingYRem: 0.08,
    codeInlinePaddingXRem: 0.35,
    codeInlineRadiusRem: 0.35,
    codeBlockPaddingRem: 1,
    codeBlockMarginYRem: 1,
    codeBlockRadiusRem: 0.8,
    titleSizeRem: 1.95,
    metaFontSizeRem: 0.78,
    bodyFontFamily: isTerminal
      ? '"IBM Plex Mono", "Sarasa Mono SC", "Noto Sans Mono CJK SC", "SFMono-Regular", Consolas, monospace'
      : '"Iowan Old Style", "Source Han Serif SC", "Noto Serif CJK SC", Georgia, serif',
    headingFontFamily: isTerminal
      ? '"IBM Plex Mono", "Sarasa Mono SC", "Noto Sans Mono CJK SC", Consolas, monospace'
      : '"Iowan Old Style", "Source Han Serif SC", "Noto Serif CJK SC", Georgia, serif',
    monoFontFamily: '"IBM Plex Mono", "Sarasa Mono SC", "Noto Sans Mono CJK SC", "SFMono-Regular", Consolas, monospace',
    headingLetterSpacingEm: isTerminal ? 0.02 : isArcane ? 0.04 : 0.01,
    titleLetterSpacingEm: isTerminal ? 0.03 : isArcane ? 0.05 : 0.015,
    typstSerifFonts: [
      'Source Han Serif SC',
      'Noto Serif CJK SC',
      'Noto Serif CJK JP',
      'Noto Serif SC',
      'Songti SC',
      'SimSun',
      'Libertinus Serif',
      'DejaVu Serif',
    ],
    typstSansFonts: [
      'Source Han Sans SC',
      'Noto Sans CJK SC',
      'Noto Sans CJK JP',
      'Noto Sans SC',
      'PingFang SC',
      'Microsoft YaHei',
      'WenQuanYi Micro Hei',
      'DejaVu Sans',
    ],
    typstMonoFonts: [
      'Sarasa Mono SC',
      'Noto Sans Mono CJK SC',
      'Noto Sans Mono CJK JP',
      'Source Han Mono SC',
      'DejaVu Sans Mono',
      'Liberation Mono',
    ],
  };
}

export function getDocumentStyleCssVars(theme: Theme): CSSProperties {
  const tokens = getDocumentStyleTokens(theme);

  return {
    '--doc-text-color': tokens.textColor,
    '--doc-muted-color': tokens.mutedColor,
    '--doc-accent-color': tokens.accentColor,
    '--doc-border-color': tokens.borderColor,
    '--doc-surface-color': tokens.surfaceColor,
    '--doc-inline-code-bg': tokens.inlineCodeBackgroundColor,
    '--doc-inline-code-color': tokens.inlineCodeTextColor,
    '--doc-code-bg': tokens.codeBlockBackgroundColor,
    '--doc-blockquote-bg': tokens.blockquoteBackgroundColor,
    '--doc-blockquote-border': tokens.blockquoteBorderColor,
    '--doc-body-font-size': `${tokens.bodyFontSizePx}px`,
    '--doc-line-height': `${tokens.lineHeight}`,
    '--doc-paragraph-space': `${tokens.paragraphSpacingRem}rem`,
    '--doc-h1-size': `${tokens.h1SizeRem}rem`,
    '--doc-h2-size': `${tokens.h2SizeRem}rem`,
    '--doc-h3-size': `${tokens.h3SizeRem}rem`,
    '--doc-heading-margin-top': `${tokens.headingMarginTopRem}rem`,
    '--doc-heading-margin-bottom': `${tokens.headingMarginBottomRem}rem`,
    '--doc-blockquote-padding': `${tokens.blockquotePaddingRem}rem`,
    '--doc-blockquote-margin-y': `${tokens.blockquoteMarginYRem}rem`,
    '--doc-blockquote-border-width': `${tokens.blockquoteBorderWidthPx}px`,
    '--doc-blockquote-radius': `${tokens.blockquoteRadiusRem}rem`,
    '--doc-list-padding-left': `${tokens.listPaddingLeftRem}rem`,
    '--doc-list-item-space': `${tokens.listItemSpacingRem}rem`,
    '--doc-code-inline-pad-y': `${tokens.codeInlinePaddingYRem}rem`,
    '--doc-code-inline-pad-x': `${tokens.codeInlinePaddingXRem}rem`,
    '--doc-code-inline-radius': `${tokens.codeInlineRadiusRem}rem`,
    '--doc-code-block-padding': `${tokens.codeBlockPaddingRem}rem`,
    '--doc-code-block-margin-y': `${tokens.codeBlockMarginYRem}rem`,
    '--doc-code-block-radius': `${tokens.codeBlockRadiusRem}rem`,
    '--doc-body-font-family': tokens.bodyFontFamily,
    '--doc-heading-font-family': tokens.headingFontFamily,
    '--doc-mono-font-family': tokens.monoFontFamily,
    '--doc-heading-letter-spacing': `${tokens.headingLetterSpacingEm}em`,
    '--doc-title-letter-spacing': `${tokens.titleLetterSpacingEm}em`,
  } as CSSProperties;
}

export function getDocumentDocxSizes(theme: Theme) {
  const tokens = getDocumentStyleTokens(theme);

  return {
    body: pxToHalfPoints(tokens.bodyFontSizePx),
    h1: pxToHalfPoints(tokens.h1SizeRem * 16),
    h2: pxToHalfPoints(tokens.h2SizeRem * 16),
    h3: pxToHalfPoints(tokens.h3SizeRem * 16),
    meta: pxToHalfPoints(tokens.metaFontSizeRem * 16),
  };
}
