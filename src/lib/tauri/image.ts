import { invoke, isTauri } from "@tauri-apps/api/core";
import { IMAGE_MAX_PIXELS } from "../validation/limits";
import { sniffImageType, type ImageErrorCode } from "../validation/image";

export class ImagePreparationError extends Error {
  readonly code: ImageErrorCode;

  constructor(code: ImageErrorCode) {
    super(code);
    this.name = "ImagePreparationError";
    this.code = code;
  }
}

/**
 * Validates an image and returns a metadata-free, orientation-normalized JPEG.
 * Throws {@link ImagePreparationError} with a stable code on rejection.
 */
export interface ImageAdapter {
  prepare(bytes: Uint8Array<ArrayBuffer>): Promise<Blob>;
}

const IMAGE_ERROR_CODES: readonly ImageErrorCode[] = ["IMAGE_INVALID", "IMAGE_TOO_LARGE", "INTERNAL_ERROR"];

function toImageError(error: unknown): ImagePreparationError {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (IMAGE_ERROR_CODES.includes(code as ImageErrorCode)) return new ImagePreparationError(code as ImageErrorCode);
  }
  return new ImagePreparationError("INTERNAL_ERROR");
}

/** Desktop implementation: the Rust `prepare_image` command validates, rotates, and re-encodes. */
export const nativeImageAdapter: ImageAdapter = {
  async prepare(bytes) {
    try {
      const jpeg = await invoke<ArrayBuffer>("prepare_image", bytes);
      return new Blob([jpeg], { type: "image/jpeg" });
    } catch (error) {
      throw toImageError(error);
    }
  },
};

/** Long-side cap shared with the native command (R3.3). */
export const MAX_OUTPUT_LONG_SIDE = 1024;

/** Output size that fits the long side within the cap without upscaling. */
export function fitWithin(width: number, height: number, maxLongSide = MAX_OUTPUT_LONG_SIDE) {
  const scale = Math.min(1, maxLongSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Browser-only development fallback for `npm run dev` outside the desktop shell.
 * Canvas re-encoding applies orientation, scales to the 1024 px cap, and drops all
 * source metadata.
 */
export const browserImageAdapter: ImageAdapter = {
  async prepare(bytes) {
    const type = sniffImageType(bytes);
    if (!type) throw new ImagePreparationError("IMAGE_INVALID");

    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(new Blob([bytes], { type }), { imageOrientation: "from-image" });
    } catch {
      throw new ImagePreparationError("IMAGE_INVALID");
    }

    try {
      if (bitmap.width * bitmap.height > IMAGE_MAX_PIXELS) throw new ImagePreparationError("IMAGE_TOO_LARGE");
      const size = fitWithin(bitmap.width, bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d");
      if (!context) throw new ImagePreparationError("INTERNAL_ERROR");
      context.drawImage(bitmap, 0, 0, size.width, size.height);
      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new ImagePreparationError("INTERNAL_ERROR"))),
          "image/jpeg",
          0.9,
        );
      });
    } finally {
      bitmap.close();
    }
  },
};

export function createImageAdapter(): ImageAdapter {
  return isTauri() ? nativeImageAdapter : browserImageAdapter;
}
