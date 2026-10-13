/** Escape user input before using it as a literal, case-insensitive highlight. */
export function splitLiteralMatches(text: string, query: string): string[] {
  if (!query) return [text];
  const literal = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.split(new RegExp(`(${literal})`, 'gi'));
}
