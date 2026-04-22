'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type RouterContextValue = {
  path: string;
  navigate: (to: string) => void;
};

const RouterContext = createContext<RouterContextValue | null>(null);

function normalizeTarget(to: string): string {
  if (!to) return '/';
  if (to.startsWith('http://') || to.startsWith('https://')) return to;
  return to.startsWith('/') ? to : `/${to}`;
}

function getCurrentPath(): string {
  if (typeof window === 'undefined') return '/';
  const hashPath = window.location.hash.replace(/^#/, '');
  if (hashPath.startsWith('/')) {
    return hashPath;
  }
  return window.location.pathname || '/';
}

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [path, setPath] = useState(getCurrentPath());

  useEffect(() => {
    const handleChange = () => setPath(getCurrentPath());
    window.addEventListener('popstate', handleChange);
    window.addEventListener('hashchange', handleChange);
    return () => {
      window.removeEventListener('popstate', handleChange);
      window.removeEventListener('hashchange', handleChange);
    };
  }, []);

  const value = useMemo<RouterContextValue>(
    () => ({
      path,
      navigate: (to: string) => {
        const next = normalizeTarget(to);
        if (next.startsWith('http://') || next.startsWith('https://')) {
          window.location.href = next;
          return;
        }
        window.history.pushState({}, '', next);
        setPath(next);
      },
    }),
    [path]
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  const value = useContext(RouterContext);
  if (!value) {
    throw new Error('useRouter must be used within RouterProvider');
  }
  return value;
}

export function AppLink({
  href,
  className,
  style,
  children,
  ...props
}: {
  href: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { navigate } = useRouter();
  const normalized = normalizeTarget(href);

  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    return (
      <a href={normalized} className={className} style={style} {...props}>
        {children}
      </a>
    );
  }

  return (
    <a
      href={normalized}
      className={className}
      style={style}
      {...props}
      onClick={(event) => {
        props.onClick?.(event);
        if (event.defaultPrevented) {
          return;
        }
        event.preventDefault();
        navigate(normalized);
      }}
    >
      {children}
    </a>
  );
}
