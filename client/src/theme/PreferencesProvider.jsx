import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';
import { useTranslation } from 'react-i18next';
import { createAppTheme } from './createAppTheme';

// Two style caches: RTL flips margins/paddings/positions automatically for Arabic
const caches = {
  rtl: createCache({ key: 'mui-rtl', stylisPlugins: [prefixer, rtlPlugin] }),
  ltr: createCache({ key: 'mui-ltr', stylisPlugins: [prefixer] }),
};

const read = (key, fallback) => {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, value); } catch { /* private mode: ignore */ }
};

const PreferencesContext = createContext(null);

export function PreferencesProvider({ children }) {
  const { i18n } = useTranslation();
  const systemDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const [mode, setMode] = useState(() => read('hs.mode', systemDark ? 'dark' : 'light'));

  const lang = i18n.language?.startsWith('ar') ? 'ar' : 'en';
  const direction = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.dir = direction;
    document.documentElement.lang = lang;
  }, [direction, lang]);

  const value = useMemo(() => ({
    mode,
    lang,
    direction,
    toggleMode: () => setMode((m) => { const next = m === 'light' ? 'dark' : 'light'; write('hs.mode', next); return next; }),
    setLang: (l) => { i18n.changeLanguage(l); write('hs.lang', l); },
  }), [mode, lang, direction, i18n]);

  const theme = useMemo(() => createAppTheme(mode, direction), [mode, direction]);
  const ltrTheme = useMemo(() => createAppTheme(mode, 'ltr'), [mode]);

  return (
    <PreferencesContext.Provider value={{ ...value, ltrTheme }}>
      <CacheProvider value={caches[direction]}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          {children}
        </ThemeProvider>
      </CacheProvider>
    </PreferencesContext.Provider>
  );
}

export const usePreferences = () => useContext(PreferencesContext);

/**
 * Renders children with left-to-right styles even inside the Arabic layout.
 * For charts: time runs left to right and the RTL plugin would mirror the chart internals.
 */
export function LtrZone({ children }) {
  const { ltrTheme } = useContext(PreferencesContext);
  return (
    <CacheProvider value={caches.ltr}>
      <ThemeProvider theme={ltrTheme}>
        <div dir="ltr">{children}</div>
      </ThemeProvider>
    </CacheProvider>
  );
}