/**
 * A validated, metadata-free JPEG held only in memory. It is never written to
 * persistent browser storage and is discarded when the flow leaves the image steps.
 */
export interface PreparedImage {
  readonly blob: Blob;
  readonly source: "upload" | "camera";
}
