// @vitest-environment node
// Task 8.1 — YouCam cloth-v4 try-on adapter (mocked): one curated style (R6.1), provider
// details hidden (R4.2), result downloaded server-side and stripped of metadata.
import { describe, expect, it } from "vitest";
import { ProviderError } from "../src/providers/types.ts";
import { loadYouCamConfig } from "../src/providers/youcam/config.ts";
import { createYouCamTryOnProvider } from "../src/providers/youcam/tryOnProvider.ts";
import {
  FAKE_API_KEY,
  FAKE_BASE_URL,
  FAKE_FILE_ID,
  FAKE_REF_URL,
  FAKE_RESULT_URL,
  RUNNING,
  clothSuccess,
  engineError,
  fakeYouCam,
  type FakeYouCamOptions,
} from "./fakeYouCam.ts";
import { memoryLogger, syntheticJpeg } from "./helpers.ts";

const image = { bytes: syntheticJpeg(1024, 768), mimeType: "image/jpeg" as const, width: 1024, height: 768 };

function resultWithExif(): Uint8Array {
  const jpeg = syntheticJpeg(1024, 768, 128);
  const marker = new TextEncoder().encode("Exif\0\0provider-camera-serial");
  const app1 = new Uint8Array([0xff, 0xe1, 0, marker.length + 2, ...marker]);
  return new Uint8Array([...jpeg.subarray(0, 2), ...app1, ...jpeg.subarray(2)]);
}

function setup(options: FakeYouCamOptions = {}, env: Record<string, string> = { YOUCAM_TRYON_REF_FILE_URL: FAKE_REF_URL }) {
  const youcam = fakeYouCam({ pollReplies: [RUNNING, clothSuccess()], resultReply: { status: 200, bytes: resultWithExif() }, ...options });
  const logger = memoryLogger();
  const config = loadYouCamConfig({
    YOUCAM_API_KEY: FAKE_API_KEY,
    YOUCAM_API_BASE_URL: FAKE_BASE_URL,
    YOUCAM_POLL_INTERVAL_MS: "1",
    ...env,
  });
  return { youcam, logger, provider: createYouCamTryOnProvider({ config, fetch: youcam.fetch, logger }) };
}

const run = (provider: ReturnType<typeof setup>["provider"]) => provider.tryOn(image, "navy-blazer", new AbortController().signal);

describe("YouCam try-on adapter", () => {
  it("requests cloth-v4 with the configured curated garment and a single-person filter", async () => {
    const { youcam, provider } = setup();

    await run(provider);

    const create = youcam.requests.find((request) => request.url === `${FAKE_BASE_URL}/s2s/v2.0/task/cloth-v4`)!;
    expect(create.body).toEqual({
      src_file_id: FAKE_FILE_ID,
      ref_file_url: FAKE_REF_URL,
      garment_category: "outer",
      filter_multi_person: "normal",
    });
    expect(youcam.requests.filter((request) => request.method === "POST" && request.url.includes("/task/"))).toHaveLength(1);
  });

  it("downloads the result server-side without credentials and strips its metadata", async () => {
    const { youcam, provider, logger } = setup();

    const result = await run(provider);

    const download = youcam.requests.find((request) => request.url === FAKE_RESULT_URL)!;
    expect(download.headers.authorization).toBeUndefined();
    expect(result.mimeType).toBe("image/jpeg");
    const text = new TextDecoder("latin1").decode(result.bytes);
    expect(text).not.toContain("Exif");
    expect(text).not.toContain("provider-camera-serial");
    expect(JSON.stringify(logger.entries)).not.toMatch(/youcam-storage|signature|yc-/);
  });

  it("makes no provider calls when no licensed garment asset is configured", async () => {
    const { youcam, provider } = setup({}, {});

    await expect(run(provider)).rejects.toMatchObject({ kind: "unavailable" });
    expect(youcam.requests).toHaveLength(0);
  });

  it.each([
    ["error_no_face", "unsuitable-image"],
    ["error_pose", "unsuitable-image"],
    ["error_multi_person", "unsuitable-image"],
    ["error_invalid_src", "unsuitable-image"],
    ["error_nsfw_content_detected", "invalid-image"],
    ["error_inference", "unavailable"],
  ])("maps %s to %s", async (code, kind) => {
    const { provider } = setup({ pollReplies: [engineError(code)] });

    await expect(run(provider)).rejects.toMatchObject({ kind });
  });

  it.each([
    ["a non-https result URL", { pollReplies: [clothSuccess("http://results.youcam-storage.test/x.jpg")] }],
    ["a missing result URL", { pollReplies: [{ status: 200, data: { task_status: "success", results: null } }] }],
    ["a result that is not an image", { resultReply: { status: 200, bytes: new TextEncoder().encode("<html>"), contentType: "text/html" } }],
    ["a failed download", { resultReply: { status: 403, bytes: new Uint8Array() } }],
  ] as const)("treats %s as a malformed response", async (_label, options) => {
    const { provider } = setup(options as FakeYouCamOptions);

    const error = await run(provider).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).kind).toBe("malformed-response");
  });

  it("rejects a non-https garment asset URL at startup", () => {
    expect(() =>
      loadYouCamConfig({ YOUCAM_API_KEY: FAKE_API_KEY, YOUCAM_TRYON_REF_FILE_URL: "http://assets.example/blazer.png" }),
    ).toThrow(/YOUCAM_TRYON_REF_FILE_URL must use https/);
  });
});
