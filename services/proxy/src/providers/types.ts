import type { Locale, Observation, TryOnStyleId } from "../../../../packages/contracts/src/index.ts";
import type { ImageInfo } from "../imageInspect.ts";

export interface ProviderImage extends ImageInfo {
  bytes: Uint8Array;
}

export type ProviderErrorKind =
  | "rate-limited"
  | "unavailable"
  | "timeout"
  | "invalid-image"
  | "unsuitable-image"
  | "malformed-response";

/**
 * Raised by provider adapters. `detail` is for local debugging only and is
 * never logged or returned to the desktop.
 */
export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;

  constructor(kind: ProviderErrorKind, detail: string = kind) {
    super(detail);
    this.name = "ProviderError";
    this.kind = kind;
  }
}

/**
 * Image-analysis provider boundary. Adapters translate vendor output into
 * neutral observations; vendor IDs, URLs, and messages stay inside the adapter.
 */
export interface AnalysisProvider {
  /** `locale` selects the language of observation text (default "en"). */
  analyze(image: ProviderImage, signal: AbortSignal, locale?: Locale): Promise<Observation[]>;
}

export interface TryOnResult {
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png";
}

/** Virtual try-on boundary for the single curated style (R6.1). */
export interface TryOnProvider {
  tryOn(image: ProviderImage, style: TryOnStyleId, signal: AbortSignal): Promise<TryOnResult>;
}
