// @vitest-environment node
// Defense in depth for R3.3: the backend strips metadata even if a modified client skipped it.
import { describe, expect, it } from "vitest";
import { stripImageMetadata } from "../src/imageInspect.ts";
import { syntheticJpeg, syntheticPng } from "./helpers.ts";

const MARKER = new TextEncoder().encode("GPS 48.8584N 2.2945E");

function contains(haystack: Uint8Array, needle: Uint8Array) {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

function segment(marker: number, payload: Uint8Array) {
  const out = new Uint8Array(4 + payload.length);
  out.set([0xff, marker, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff]);
  out.set(payload, 4);
  return out;
}

function insertAfterSoi(jpeg: Uint8Array, ...segments: Uint8Array[]) {
  const total = segments.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(jpeg.length + total);
  out.set(jpeg.subarray(0, 2));
  let offset = 2;
  for (const part of segments) {
    out.set(part, offset);
    offset += part.length;
  }
  out.set(jpeg.subarray(2), offset);
  return out;
}

describe("stripImageMetadata", () => {
  it("rejects structurally invalid input", () => {
    expect(stripImageMetadata(new Uint8Array([0xff, 0xd8, 0x00, 0x00, 0x00]), "image/jpeg")).toBeNull();
    expect(stripImageMetadata(syntheticPng(2, 2).subarray(0, 40), "image/png")).toBeNull();
  });

  it("removes Exif/APPn and comment segments from JPEG while keeping the frame header", () => {
    const exif = segment(0xe1, new Uint8Array([...new TextEncoder().encode("Exif\0\0"), ...MARKER]));
    const comment = segment(0xfe, MARKER);
    const source = insertAfterSoi(syntheticJpeg(320, 240), exif, comment);
    expect(contains(source, MARKER)).toBe(true);

    const stripped = stripImageMetadata(source, "image/jpeg");
    if (!stripped) throw new Error("expected a valid JPEG");

    expect(contains(stripped, MARKER)).toBe(false);
    expect(contains(stripped, new TextEncoder().encode("Exif"))).toBe(false);
    expect(Array.from(stripped.subarray(0, 2))).toEqual([0xff, 0xd8]);
    expect(contains(stripped, new Uint8Array([0xff, 0xc0]))).toBe(true);
  });

  it("removes text and eXIf chunks from PNG", () => {
    const png = syntheticPng(4, 4);
    const text = new Uint8Array([0, 0, 0, MARKER.length, ...new TextEncoder().encode("tEXt"), ...MARKER, 0, 0, 0, 0]);
    // Insert the tEXt chunk after IHDR (8-byte signature + 25-byte IHDR chunk).
    const source = new Uint8Array([...png.subarray(0, 33), ...text, ...png.subarray(33)]);
    expect(contains(source, MARKER)).toBe(true);

    const stripped = stripImageMetadata(source, "image/png");
    if (!stripped) throw new Error("expected a valid PNG");

    expect(contains(stripped, MARKER)).toBe(false);
    expect(contains(stripped, new TextEncoder().encode("IHDR"))).toBe(true);
    expect(contains(stripped, new TextEncoder().encode("IDAT"))).toBe(true);
  });
});
