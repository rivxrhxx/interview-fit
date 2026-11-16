import type { ErrorCode } from "../api/contracts";

export type SupportedImageType = "image/jpeg" | "image/png";

/** Client-visible image error codes shared with the native and backend boundaries. */
export type ImageErrorCode = Extract<ErrorCode, "IMAGE_INVALID" | "IMAGE_TOO_LARGE" | "INTERNAL_ERROR">;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
}

/** Identifies JPEG and PNG by content. File names and MIME hints are never trusted. */
export function sniffImageType(bytes: Uint8Array): SupportedImageType | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return "image/png";
  if (startsWith(bytes, JPEG_SIGNATURE)) return "image/jpeg";
  return null;
}
