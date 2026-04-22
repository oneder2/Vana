import React, { useEffect } from 'react';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ToastProvider } from '@/components/ToastProvider';
import { Toast } from '@/components/Toast';
import { RouterProvider, useRouter } from '@/lib/router';
import HomePage from '@/app/page';
import SettingsPage from '@/app/settings/page';
import AuthCallbackPage from '@/app/auth/callback/page';
import HelpPage from '@/app/help/page';
import '@/app/globals.css';

function RoutedApp() {
  const { path } = useRouter();

  useEffect(() => {
    document.title = 'Vana - No Visitors';
  }, []);

  if (path === '/settings') {
    return <SettingsPage />;
  }

  if (path === '/auth/callback') {
    return <AuthCallbackPage />;
  }

  if (path === '/help') {
    return <HelpPage />;
  }

  return <HomePage />;
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <RouterProvider>
          <RoutedApp />
          <Toast />
        </RouterProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
