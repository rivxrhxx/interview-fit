// @vitest-environment node
// Tasks 8.1 and 12.5 — YouCam hair-transfer try-on adapter (mocked): curated styles that
// keep the user's hair color (R6.1, R6.4), provider details hidden (R4.2), results and
// thumbnails downloaded server-side and stripped of metadata.
import { describe, expect, it } from "vitest";
import { ProviderError } from "../src/providers/types.ts";
import { loadYouCamConfig } from "../src/providers/youcam/config.ts";
import { STYLE_TEMPLATES, createYouCamTryOnProvider } from "../src/providers/youcam/tryOnProvider.ts";
import { TRY_ON_STYLES } from "../../../packages/contracts/src/index.ts";
import {
  FAKE_API_KEY,
  FAKE_BASE_URL,
  FAKE_FILE_ID,
  FAKE_RESULT_URL,
  FAKE_THUMB_BASE,
  RUNNING,
  engineError,
  fakeYouCam,
  hairSuccess,
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

function setup(options: FakeYouCamOptions = {}, env: Record<string, string> = {}) {
  const youcam = fakeYouCam({ pollReplies: [RUNNING, hairSuccess()], resultReply: { status: 200, bytes: resultWithExif() }, ...options });
  const logger = memoryLogger();
  const config = loadYouCamConfig({
    YOUCAM_API_KEY: FAKE_API_KEY,
    YOUCAM_API_BASE_URL: FAKE_BASE_URL,
    YOUCAM_POLL_INTERVAL_MS: "1",
    ...env,
  });
  return { youcam, logger, provider: createYouCamTryOnProvider({ config, fetch: youcam.fetch, logger }) };
}

const run = (provider: ReturnType<typeof setup>["provider"]) => provider.tryOn(image, "neat-updo", new AbortController().signal);

describe("YouCam try-on adapter", () => {
  it("requests hair-transfer v2.1 with the curated template and the user's own hair color", async () => {
    const { youcam, provider } = setup();

    await run(provider);

    const create = youcam.requests.find((request) => request.url === `${FAKE_BASE_URL}/s2s/v2.1/task/hair-transfer`)!;
    expect(create.body).toEqual({ src_file_id: FAKE_FILE_ID, template_id: "female_casual_updo", hair_color: "src" });
    expect(youcam.requests.filter((request) => request.method === "POST" && request.url.includes("/task/"))).toHaveLength(1);
    expect(youcam.requests.some((request) => request.url === `${FAKE_BASE_URL}/s2s/v2.1/task/hair-transfer/yc-task-b41d2e`)).toBe(true);
  });

  it("maps every curated style to a template", () => {
    expect(Object.keys(STYLE_TEMPLATES).sort()).toEqual(TRY_ON_STYLES.map((style) => style.id).sort());
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

  it.each([
    ["error_no_face", "unsuitable-image"],
    ["error_pose", "unsuitable-image"],
    ["error_no_shoulder", "unsuitable-image"],
    ["error_large_face_angle", "unsuitable-image"],
    ["error_hair_too_short", "unsuitable-image"],
    ["error_nsfw_content_detected", "invalid-image"],
    ["error_inference", "unavailable"],
  ])("maps %s to %s", async (code, kind) => {
    const { provider } = setup({ pollReplies: [engineError(code)] });

    await expect(run(provider)).rejects.toMatchObject({ kind });
  });

  it.each([
    ["a non-https result URL", { pollReplies: [hairSuccess("http://results.youcam-storage.test/x.jpg")] }],
    ["a missing result URL", { pollReplies: [{ status: 200, data: { task_status: "success", results: null } }] }],
    ["a result that is not an image", { resultReply: { status: 200, bytes: new TextEncoder().encode("<html>"), contentType: "text/html" } }],
    ["a failed download", { resultReply: { status: 403, bytes: new Uint8Array() } }],
  ] as const)("treats %s as a malformed response", async (_label, options) => {
    const { provider } = setup(options as FakeYouCamOptions);

    const error = await run(provider).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).kind).toBe("malformed-response");
  });

});

describe("style thumbnails", () => {
  const pages = [
    [{ id: "male_short_curly", thumb: `${FAKE_THUMB_BASE}/short-curly.jpg` }],
    Object.values(STYLE_TEMPLATES).map((id) => ({ id, thumb: `${FAKE_THUMB_BASE}/${id}.jpg?signature=sig-th` })),
  ];

  it("finds the curated template across pages, downloads it without credentials, and strips metadata", async () => {
    const { youcam, provider, logger } = setup({ templatePages: pages, thumbBytes: resultWithExif() });

    const thumbnail = await provider.thumbnail("side-swept-cut", new AbortController().signal);

    const lists = youcam.requests.filter((request) => request.url.includes("/task/template/hair-transfer"));
    expect(lists).toHaveLength(2);
    expect(lists[0].headers.authorization).toBe(`Bearer ${FAKE_API_KEY}`);
    const download = youcam.requests.find((request) => request.url.startsWith(`${FAKE_THUMB_BASE}/all_side_swept_undercut`))!;
    expect(download.headers.authorization).toBeUndefined();
    expect(new TextDecoder("latin1").decode(thumbnail.bytes)).not.toContain("provider-camera-serial");
    expect(JSON.stringify(logger.entries)).not.toMatch(/youcam-storage|signature|undercut/);
  });

  it("caches thumbnails and the template list", async () => {
    const { youcam, provider } = setup({ templatePages: pages, thumbBytes: resultWithExif() });
    const signal = new AbortController().signal;

    await provider.thumbnail("neat-updo", signal);
    await provider.thumbnail("neat-updo", signal);
    await provider.thumbnail("short-bob", signal);

    expect(youcam.requests.filter((request) => request.url.includes("/task/template/"))).toHaveLength(2);
    expect(youcam.requests.filter((request) => request.url.startsWith(FAKE_THUMB_BASE))).toHaveLength(2);
  });

  it("is unavailable when the provider no longer lists a curated template", async () => {
    const { provider } = setup({ templatePages: [[{ id: "female_blunt_bob", thumb: `${FAKE_THUMB_BASE}/x.jpg` }]] });

    await expect(provider.thumbnail("neat-updo", new AbortController().signal)).rejects.toMatchObject({ kind: "unavailable" });
  });
});

describe("bounded provider downloads (review finding 5)", () => {
  it("rejects a result without Content-Length that grows past the size cap", async () => {
    const huge = new Uint8Array(10 * 1024 * 1024 + 1);
    huge.set([0xff, 0xd8, 0xff]);
    const { provider } = setup({ resultReply: { status: 200, bytes: huge } });

    await expect(run(provider)).rejects.toMatchObject({ kind: "malformed-response" });
  });

  it("enforces the optional storage host allowlist", async () => {
    const { provider } = setup({}, { YOUCAM_STORAGE_HOSTS: "results.example-cdn.test" });

    await expect(run(provider)).rejects.toMatchObject({ kind: "malformed-response" });
  });

  it("accepts a result from an allowlisted host suffix", async () => {
    const { provider } = setup({}, { YOUCAM_STORAGE_HOSTS: "youcam-storage.test" });

    await expect(run(provider)).resolves.toMatchObject({ mimeType: "image/jpeg" });
  });
});
