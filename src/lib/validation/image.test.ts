// Task 4.1 — verifies R2.3 signature checks (content, not file name or MIME hint).
import { describe, expect, it } from "vitest";
import { GIF_SIGNATURE, JPEG_SIGNATURE, PNG_SIGNATURE } from "../../test/images";
import { IMAGE_MAX_BYTES, IMAGE_MAX_PIXELS } from "./limits";
import { sniffImageType } from "./image";

describe("sniffImageType", () => {
  it("recognizes PNG and JPEG signatures", () => {
    expect(sniffImageType(new Uint8Array([...PNG_SIGNATURE, 0, 0]))).toBe("image/png");
    expect(sniffImageType(new Uint8Array([...JPEG_SIGNATURE, 0, 0]))).toBe("image/jpeg");
  });

  it("rejects other formats and short input", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const webp = new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ");
    expect(sniffImageType(new Uint8Array(GIF_SIGNATURE))).toBeNull();
    expect(sniffImageType(svg)).toBeNull();
    expect(sniffImageType(webp)).toBeNull();
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

describe("image limits", () => {
  it("match the security steering limits", () => {
    expect(IMAGE_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(IMAGE_MAX_PIXELS).toBe(16_000_000);
  });
});
