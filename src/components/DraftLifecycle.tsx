import { useEffect } from 'react';
import { documentDrafts } from '@/lib/documentDrafts';
import { getCurrentTauriWindow } from '@/lib/tauriWindow';
import { useToast } from './ToastProvider';

export function DraftLifecycle() {
  const toast = useToast();
  useEffect(() => documentDrafts.subscribe((event) => {
    if (event.type === 'error') toast.error(`保存失败：${event.message}`);
  }), [toast]);

  useEffect(() => {
    const flush = () => { void documentDrafts.flushAll().catch(() => {}); };
    const visibility = () => { if (document.visibilityState === 'hidden') flush(); };
    const unload = (event: BeforeUnloadEvent) => {
      if (!documentDrafts.hasPending()) return;
      event.preventDefault();
      event.returnValue = '';
      flush();
    };
    window.addEventListener('online', flush);
    window.addEventListener('focus', flush);
    window.addEventListener('beforeunload', unload);
    document.addEventListener('visibilitychange', visibility);

    let disposed = false;
    let cleanup: (() => void) | undefined;
    let closing = false;
    void getCurrentTauriWindow().then(async (appWindow) => {
      if (!appWindow || disposed) return;
      const unlisten = await appWindow.onCloseRequested(async (event) => {
        if (!documentDrafts.hasPending()) return;
        event.preventDefault();
        if (closing) return;
        closing = true;
        try {
          await documentDrafts.flushAll();
          await appWindow.close();
        } catch { /* The draft store reports the error; keep the window open for retry. */ }
        finally { closing = false; }
      });
      if (disposed) unlisten(); else cleanup = unlisten;
    }).catch(() => {});

    return () => {
      disposed = true;
      cleanup?.();
      window.removeEventListener('online', flush);
      window.removeEventListener('focus', flush);
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  return null;
}
