import React from "react";
import ReactDOM from "react-dom/client";
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
