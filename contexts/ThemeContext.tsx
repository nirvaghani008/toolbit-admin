'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  applyTheme: () => void;
  pendingTheme: Theme;
  setPendingTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  setTheme: () => {},
  applyTheme: () => {},
  pendingTheme: 'dark',
  setPendingTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [pendingTheme, setPendingTheme] = useState<Theme>('dark');

  function applyToDOM(t: Theme) {
    const root = document.documentElement;
    if (t === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }

  useEffect(() => {
    const stored = localStorage.getItem('toolbit-theme') as Theme | null;
    const initial = stored || 'dark';
    setThemeState(initial);
    setPendingTheme(initial);
    applyToDOM(initial);
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    setPendingTheme(t);
    localStorage.setItem('toolbit-theme', t);
    applyToDOM(t);
  }

  function applyTheme() {
    setTheme(pendingTheme);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, applyTheme, pendingTheme, setPendingTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

import { useServerInsertedHTML } from 'next/navigation';

export function ThemeInitScript() {
  useServerInsertedHTML(() => {
    return (
      <script
        id="theme-init"
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem('toolbit-theme')||'dark';if(t==='dark')document.documentElement.classList.add('dark');else document.documentElement.classList.remove('dark');}catch(e){}})();`,
        }}
      />
    );
  });
  return null;
}

