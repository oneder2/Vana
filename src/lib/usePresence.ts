import { useEffect, useState } from 'react';

/** Keep floating UI mounted briefly so its closing motion can finish. */
export function usePresence(open: boolean, duration = 180) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) { setMounted(true); return; }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setMounted(false); return; }
    const timer = window.setTimeout(() => setMounted(false), duration);
    return () => window.clearTimeout(timer);
  }, [open, duration]);
  return open || mounted;
}
