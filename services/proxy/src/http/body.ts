import type { IncomingMessage } from "node:http";

export class BodyTooLargeError extends Error {
  constructor() {
    super("body too large");
    this.name = "BodyTooLargeError";
  }
}

/**
 * Reads at most `limit` bytes. Larger bodies are drained without buffering so
 * the client still receives the error response.
 */
export function readBody(request: IncomingMessage, limit: number): Promise<Uint8Array> {
  const declared = Number(request.headers["content-length"] ?? "0");
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    let tooLarge = Number.isFinite(declared) && declared > limit;
    request.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (received > limit) tooLarge = true;
      if (!tooLarge) chunks.push(chunk);
    });
    request.on("end", () => {
      if (tooLarge) {
        chunks.length = 0;
        reject(new BodyTooLargeError());
      } else {
        resolve(new Uint8Array(Buffer.concat(chunks)));
      }
    });
    request.on("error", reject);
  });
}

/** Parses multipart/form-data with the platform's WHATWG implementation (no extra dependencies). */
export async function parseMultipart(body: Uint8Array, contentType: string): Promise<FormData> {
  return new Response(body as Uint8Array<ArrayBuffer>, { headers: { "content-type": contentType } }).formData();
}
