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

// JPEG segments that may carry personal metadata: APP1–APP13, APP15 (Exif, XMP, ICC, IPTC, …) and comments.
// APP0 (JFIF) and APP14 (Adobe color transform) are kept because decoders need them.
function isJpegMetadataMarker(marker: number): boolean {
  return (marker >= 0xe1 && marker <= 0xed) || marker === 0xef || marker === 0xfe;
}

function stripJpeg(bytes: Uint8Array): Uint8Array | null {
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(bytes.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    if (marker === 0xda) {
      // Start of scan: the rest is entropy-coded image data and the end marker.
      parts.push(bytes.subarray(offset));
      return concat(parts);
    }
    if (!isJpegMetadataMarker(marker)) parts.push(bytes.subarray(offset, offset + 2 + length));
    offset += 2 + length;
  }
  return null;
}

// Critical chunks plus ancillary chunks needed for correct rendering. Text, eXIf, and time chunks are dropped.
const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "sBIT", "bKGD"]);

function stripPng(bytes: Uint8Array): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) return null;
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (PNG_KEEP.has(type)) parts.push(bytes.subarray(offset, end));
    offset = end;
    if (type === "IEND") return concat(parts);
  }
  return null;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * Removes metadata segments before anything reaches the provider. The desktop
 * already re-encodes images; this guards against modified or third-party
 * clients (R3.3 defense in depth). Returns null for structurally invalid input.
 */
export function stripImageMetadata(bytes: Uint8Array, mimeType: ImageInfo["mimeType"]): Uint8Array | null {
  return mimeType === "image/jpeg" ? stripJpeg(bytes) : stripPng(bytes);
}
