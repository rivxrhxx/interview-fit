import { render } from "@testing-library/react";
import { vi } from "vitest";
import App from "../app/App";
import { AdaptersProvider, type Adapters } from "../lib/adapters";

export function createMockAdapters(overrides: Partial<Adapters> = {}): Adapters {
  return {
    image: { prepare: vi.fn(async () => new Blob(["normalized"], { type: "image/jpeg" })) },
    ...overrides,
  };
}

export function renderApp(adapters: Adapters = createMockAdapters()) {
  return { adapters, ...render(<AdaptersProvider adapters={adapters}><App /></AdaptersProvider>) };
}
