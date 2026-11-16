import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isLocale, type Locale } from "../api/contracts";
import { en, type Messages } from "./messages/en";
import { ko } from "./messages/ko";

export type { Messages } from "./messages/en";
export type { Locale } from "../api/contracts";

export const MESSAGES: Record<Locale, Messages> = { en, ko };

/** Only the language preference is stored; never images or results. */
const STORAGE_KEY = "interview-fit.locale";

function readStoredLocale(): Locale | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** A saved choice wins; otherwise Korean for Korean system languages, else English. */
export function detectLocale(): Locale {
  const stored = readStoredLocale();
  if (stored) return stored;
  const languages = typeof navigator === "undefined" ? [] : [...(navigator.languages ?? []), navigator.language];
  return languages.some((language) => language?.toLowerCase().startsWith("ko")) ? "ko" : "en";
}

interface I18nValue {
  locale: Locale;
  m: Messages;
  setLocale: (locale: Locale) => void;
}

// Without a provider (isolated component tests) the UI renders in English.
const I18nContext = createContext<I18nValue>({ locale: "en", m: en, setLocale: () => {} });

export function I18nProvider({ initialLocale, children }: { initialLocale?: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale ?? detectLocale());

  useEffect(() => {
    // Screen readers and hyphenation follow the document language.
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable; the choice still applies for this session.
    }
  }, []);

  const value = useMemo(() => ({ locale, m: MESSAGES[locale], setLocale }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
