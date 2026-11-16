import { render } from "@testing-library/react";
import App, { type AnalysisTiming } from "../app/App";
import { AdaptersProvider, type Adapters } from "../lib/adapters";
import { I18nProvider, type Locale } from "../lib/i18n";
import { createMockAdapters } from "./adapters";

const FAST_TIMING: AnalysisTiming = { pollIntervalMs: 5, timeoutMs: 2_000 };

export function renderApp(
  adapters: Adapters = createMockAdapters(),
  timing: AnalysisTiming = FAST_TIMING,
  locale: Locale = "en",
) {
  return {
    adapters,
    ...render(
      <I18nProvider initialLocale={locale}>
        <AdaptersProvider adapters={adapters}>
          <App analysisTiming={timing} />
        </AdaptersProvider>
      </I18nProvider>,
    ),
  };
}
