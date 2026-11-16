import { ImagePreparationError, type ImageAdapter } from "../../lib/tauri";
import { sniffImageType, type ImageErrorCode } from "../../lib/validation/image";
import { IMAGE_MAX_BYTES } from "../../lib/validation/limits";
import type { PreparedImage } from "./types";

export type PreparePhotoResult = { ok: true; image: PreparedImage } | { ok: false; code: ImageErrorCode };

/**
 * Fast client checks for immediate feedback, then native validation and
 * preprocessing (orientation + metadata removal). The client checks are a UX aid,
 * not a trust boundary: the native command and the backend validate again.
 */
export async function preparePhoto(
  file: Blob,
  adapter: ImageAdapter,
  source: PreparedImage["source"],
): Promise<PreparePhotoResult> {
  if (file.size === 0) return { ok: false, code: "IMAGE_INVALID" };
  if (file.size > IMAGE_MAX_BYTES) return { ok: false, code: "IMAGE_TOO_LARGE" };

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!sniffImageType(bytes)) return { ok: false, code: "IMAGE_INVALID" };

  try {
    const blob = await adapter.prepare(bytes);
    return { ok: true, image: { blob, source } };
  } catch (error) {
    return { ok: false, code: error instanceof ImagePreparationError ? error.code : "INTERNAL_ERROR" };
  }
}
