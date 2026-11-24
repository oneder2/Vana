export async function copyText(text: string) {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; } } catch { /* Older WebViews use a selection fallback. */ }
  const previous = document.activeElement as HTMLElement | null, field = document.createElement('textarea'); field.value = text;
  field.style.cssText = 'position:fixed;left:-10000px;top:0'; document.body.append(field); field.select();
  const copied = document.execCommand('copy'); field.remove(); previous?.focus();
  if (!copied) throw new Error('无法复制，请检查系统剪贴板权限');
}
