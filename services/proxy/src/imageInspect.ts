import { IMAGE_MAX_BYTES, IMAGE_MAX_PIXELS } from "../../../packages/contracts/src/index.ts";

export interface ImageInfo {
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
}

export type ImageInspection = { ok: true; info: ImageInfo } | { ok: false; code: "IMAGE_INVALID" | "IMAGE_TOO_LARGE" };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// Start-of-frame markers that carry dimensions (excludes DHT C4, JPG C8, DAC CC).
const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 33 || !PNG_SIGNATURE.every((value, index) => bytes[index] === value)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = String.fromCharCode(...bytes.subarray(12, 16));
  if (view.getUint32(8) !== 13 || type !== "IHDR") return null;
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    let marker = bytes[offset + 1];
    while (marker === 0xff && offset + 2 < bytes.length) {
      offset += 1;
      marker = bytes[offset + 1];
    }
    if (marker === 0xd9 || marker === 0xda) return null; // EOI or SOS before any frame header
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    if (SOF_MARKERS.has(marker)) {
      if (length < 7) return null;
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      return { width, height };
    }
    offset += 2 + length;
  }
  return null;
}

/**
 * Backend re-validation: signature, size, and header dimensions (R2.3). The
 * desktop's checks are not trusted. Pixel data is never decoded here.
 */
export function inspectImage(bytes: Uint8Array): ImageInspection {
  if (bytes.length === 0) return { ok: false, code: "IMAGE_INVALID" };
  if (bytes.length > IMAGE_MAX_BYTES) return { ok: false, code: "IMAGE_TOO_LARGE" };
  const png = pngDimensions(bytes);
  const jpeg = png ? null : jpegDimensions(bytes);
  const dimensions = png ?? jpeg;
  if (!dimensions || dimensions.width === 0 || dimensions.height === 0) return { ok: false, code: "IMAGE_INVALID" };
  if (dimensions.width * dimensions.height > IMAGE_MAX_PIXELS) return { ok: false, code: "IMAGE_TOO_LARGE" };
  return { ok: true, info: { mimeType: png ? "image/png" : "image/jpeg", ...dimensions } };
}
