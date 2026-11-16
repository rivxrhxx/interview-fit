// Task 4.1 — verifies R2.3 (format and size limits) and R3.3 (preprocessing is delegated
// to the typed native adapter before the image enters the flow).
import { describe, expect, it, vi } from "vitest";
import { ImagePreparationError, type ImageAdapter } from "../../lib/tauri";
import { IMAGE_MAX_BYTES } from "../../lib/validation/limits";
import { GIF_SIGNATURE, JPEG_SIGNATURE, PNG_SIGNATURE, fileWithReportedSize, syntheticFile } from "../../test/images";
import { preparePhoto } from "./preparePhoto";

function mockAdapter(result: Blob | Error = new Blob(["normalized"], { type: "image/jpeg" })): ImageAdapter {
  return {
    prepare: vi.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  };
}

describe("preparePhoto", () => {
  it("rejects unsupported formats by content even when the name and type claim PNG", async () => {
    const adapter = mockAdapter();
    const file = syntheticFile(GIF_SIGNATURE, "photo.png", "image/png");

    await expect(preparePhoto(file, adapter, "upload")).resolves.toEqual({ ok: false, code: "IMAGE_INVALID" });
    expect(adapter.prepare).not.toHaveBeenCalled();
  });

  it("rejects empty files", async () => {
    const adapter = mockAdapter();
    const file = new File([], "empty.jpg", { type: "image/jpeg" });

    await expect(preparePhoto(file, adapter, "upload")).resolves.toEqual({ ok: false, code: "IMAGE_INVALID" });
    expect(adapter.prepare).not.toHaveBeenCalled();
  });

  it("rejects files over 10 MiB without reading their bytes", async () => {
    const adapter = mockAdapter();
    const file = fileWithReportedSize(IMAGE_MAX_BYTES + 1);
    const read = vi.spyOn(file, "arrayBuffer");

    await expect(preparePhoto(file, adapter, "upload")).resolves.toEqual({ ok: false, code: "IMAGE_TOO_LARGE" });
    expect(read).not.toHaveBeenCalled();
    expect(adapter.prepare).not.toHaveBeenCalled();
  });

  it("passes the exact source bytes to the native adapter and returns its normalized output", async () => {
    const normalized = new Blob(["normalized-jpeg"], { type: "image/jpeg" });
    const adapter = mockAdapter(normalized);
    const file = syntheticFile(PNG_SIGNATURE, "photo.png", "image/png", 32);

    const result = await preparePhoto(file, adapter, "upload");

    expect(result).toEqual({ ok: true, image: { blob: normalized, source: "upload" } });
    const sent = vi.mocked(adapter.prepare).mock.calls[0][0];
    expect(Array.from(sent.slice(0, PNG_SIGNATURE.length))).toEqual(PNG_SIGNATURE);
    expect(sent.byteLength).toBe(32);
  });

  it("maps native validation errors such as oversized dimensions", async () => {
    const adapter = mockAdapter(new ImagePreparationError("IMAGE_TOO_LARGE"));
    const file = syntheticFile(JPEG_SIGNATURE, "wide.jpg", "image/jpeg");

    await expect(preparePhoto(file, adapter, "upload")).resolves.toEqual({ ok: false, code: "IMAGE_TOO_LARGE" });
  });

  it("maps unexpected adapter failures to a neutral internal error", async () => {
    const adapter = mockAdapter(new Error("decoder crashed at /Users/someone/private/path"));
    const file = syntheticFile(JPEG_SIGNATURE, "photo.jpg", "image/jpeg");

    await expect(preparePhoto(file, adapter, "upload")).resolves.toEqual({ ok: false, code: "INTERNAL_ERROR" });
  });
});
