/** Synthetic image byte fixtures. No real photos are used in tests. */
export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const JPEG_SIGNATURE = [0xff, 0xd8, 0xff, 0xe0];
export const GIF_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];

export function syntheticFile(signature: number[], name: string, type: string, size = 64): File {
  const bytes = new Uint8Array(Math.max(size, signature.length));
  bytes.set(signature);
  return new File([bytes], name, { type });
}

/** A file that reports `size` bytes without allocating them. */
export function fileWithReportedSize(size: number, name = "large.jpg", type = "image/jpeg"): File {
  const file = syntheticFile(JPEG_SIGNATURE, name, type);
  Object.defineProperty(file, "size", { value: size });
  return file;
}
