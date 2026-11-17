// העדפות אישיות שנשמרות בטלפון
import { useEffect, useState } from 'react';
import { getTheme, type ThemeId } from './themes';
import { useI18n } from './i18n';

function usePersisted<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key);
      return s ? (JSON.parse(s) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = (nv: T) => {
    setV(nv);
    localStorage.setItem(key, JSON.stringify(nv));
  };
  return [v, set];
}

export function useThemePref() {
  const { lang } = useI18n();
  const [id, setId] = usePersisted<ThemeId>('theme', 'classic');
  const theme = getTheme(id, lang);
  useEffect(() => {
    for (const [k, v] of Object.entries(theme.vars)) document.documentElement.style.setProperty(k, v);
    document.documentElement.dataset.theme = theme.id;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.vars['--bg']);
  }, [theme.id, theme.vars]);
  return { theme, setTheme: setId };
}

export function useTipsPref() {
  return usePersisted<boolean>('tips', true);
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}
