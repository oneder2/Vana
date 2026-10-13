import React, { useEffect } from 'react';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ToastProvider } from '@/components/ToastProvider';
import { Toast } from '@/components/Toast';
import { RouterProvider, useRouter } from '@/lib/router';
import { ensureWorkspaceInitialized, getAppState, type AppState } from '@/lib/api';
import HomePage from '@/app/page';
import SettingsPage from '@/app/settings/page';
import AuthCallbackPage from '@/app/auth/callback/page';
import HelpPage from '@/app/help/page';
import WelcomePage from '@/app/welcome/page';
import '@/app/globals.css';
import { DraftLifecycle } from '@/components/DraftLifecycle';

function RoutedApp() {
  const { path, navigationVersion } = useRouter();
  const [appState, setAppState] = React.useState<AppState | null>(null);
  const [loading, setLoading] = React.useState(true);

  useEffect(() => {
    document.title = 'Vana';
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await ensureWorkspaceInitialized();
        const nextState = await getAppState();
        if (!cancelled) {
          setAppState(nextState);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path, navigationVersion]);

  if (loading) {
    return null;
  }

  if (path === '/settings') {
    return <SettingsPage />;
  }

  if (path === '/auth/callback') {
    return <AuthCallbackPage />;
  }

  if (path === '/help') {
    return <HelpPage />;
  }

  if (path === '/welcome') {
    return <WelcomePage />;
  }

  if (!appState?.onboarding_completed && appState?.account_mode === 'guest') {
    return <WelcomePage />;
  }

  return <HomePage />;
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <RouterProvider>
          <DraftLifecycle />
          <RoutedApp />
          <Toast />
        </RouterProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
