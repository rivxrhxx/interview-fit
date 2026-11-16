import { createContext, useContext, type ReactNode } from "react";
import { createHttpApiClient, resolveApiBaseUrl, type ApiClient } from "./api";
import { browserCameraAdapter, type CameraAdapter } from "./media/camera";
import { createImageAdapter, type ImageAdapter } from "./tauri";

/** Typed boundaries that features use for privileged or network work. Tests inject mocks. */
export interface Adapters {
  image: ImageAdapter;
  camera: CameraAdapter;
  api: ApiClient;
}

export function createDefaultAdapters(): Adapters {
  const baseUrl = resolveApiBaseUrl(import.meta.env.VITE_INTERVIEW_FIT_API_BASE_URL);
  return { image: createImageAdapter(), camera: browserCameraAdapter, api: createHttpApiClient({ baseUrl }) };
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
