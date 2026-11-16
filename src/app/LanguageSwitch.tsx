import { useI18n, type Locale } from "../lib/i18n";

const OPTIONS: Array<{ locale: Locale; short: string; name: string }> = [
  { locale: "ko", short: "한국어", name: "한국어" },
  { locale: "en", short: "EN", name: "English" },
];

/** Segmented language switch. Each option is a toggle button announced in its own language. */
export function LanguageSwitch() {
  const { locale, m, setLocale } = useI18n();
  return (
    <div className="language-switch" role="group" aria-label={m.shell.languageGroup}>
      {OPTIONS.map((option) => (
        <button
          key={option.locale}
          type="button"
          lang={option.locale}
          aria-label={option.name}
          aria-pressed={locale === option.locale}
          onClick={() => setLocale(option.locale)}
        >
          {option.short}
        </button>
      ))}
    </div>
  );
}
