/** Attributes crossing into HTML/Typst/DOCX must be values, never markup. */
export function exportAlignment(value: unknown): 'left' | 'center' | 'right' | 'justify' {
  return value === 'center' || value === 'right' || value === 'justify' ? value : 'left';
}
export function exportHeadingLevel(value: unknown): number {
  const level = Number(value ?? 1);
  return Number.isInteger(level) ? Math.min(3, Math.max(1, level)) : 1;
}
