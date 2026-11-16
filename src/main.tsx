import React from "react";
import ReactDOM from "react-dom/client";
// Pretendard (SIL OFL 1.1), bundled locally so the strict CSP (font-src 'self') holds.
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import App from "./app/App";
import { AdaptersProvider, createDefaultAdapters } from "./lib/adapters";

const adapters = createDefaultAdapters();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AdaptersProvider adapters={adapters}>
      <App />
    </AdaptersProvider>
  </React.StrictMode>,
);
