import { render } from "@testing-library/react";
import App, { type AnalysisTiming } from "../app/App";
import { AdaptersProvider, type Adapters } from "../lib/adapters";
import { createMockAdapters } from "./adapters";

const FAST_TIMING: AnalysisTiming = { pollIntervalMs: 5, timeoutMs: 2_000 };

export function renderApp(adapters: Adapters = createMockAdapters(), timing: AnalysisTiming = FAST_TIMING) {
  return {
    adapters,
    ...render(
      <AdaptersProvider adapters={adapters}>
        <App analysisTiming={timing} />
      </AdaptersProvider>,
    ),
  };
}
