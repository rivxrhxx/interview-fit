import React from "react";
import ReactDOM from "react-dom/client";
// Pretendard (SIL OFL 1.1), bundled locally so the strict CSP (font-src 'self') holds.
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import App from "./app/App";
import { AdaptersProvider, createDefaultAdapters } from "./lib/adapters";
import { I18nProvider } from "./lib/i18n";

const adapters = createDefaultAdapters();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <AdaptersProvider adapters={adapters}>
        <App />
      </AdaptersProvider>
    </I18nProvider>
  </React.StrictMode>,
);
