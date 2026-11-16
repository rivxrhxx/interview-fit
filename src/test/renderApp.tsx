import { render } from "@testing-library/react";
import App from "../app/App";
import { AdaptersProvider, type Adapters } from "../lib/adapters";
import { createMockAdapters } from "./adapters";

export function renderApp(adapters: Adapters = createMockAdapters()) {
  return {
    adapters,
    ...render(
      <AdaptersProvider adapters={adapters}>
        <App />
      </AdaptersProvider>,
    ),
  };
}
