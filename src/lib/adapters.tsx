import { createContext, useContext, type ReactNode } from "react";
import { createImageAdapter, type ImageAdapter } from "./tauri";

/** Typed boundaries that features use for privileged or network work. Tests inject mocks. */
export interface Adapters {
  image: ImageAdapter;
}

export function createDefaultAdapters(): Adapters {
  return { image: createImageAdapter() };
}

const AdaptersContext = createContext<Adapters | null>(null);

export function AdaptersProvider({ adapters, children }: { adapters: Adapters; children: ReactNode }) {
  return <AdaptersContext.Provider value={adapters}>{children}</AdaptersContext.Provider>;
}

export function useAdapters(): Adapters {
  const adapters = useContext(AdaptersContext);
  if (!adapters) throw new Error("useAdapters must be used inside AdaptersProvider");
  return adapters;
}
