// @vitest-environment node
// Task 6.3 — YouCam provider adapter (R4.2): secret redaction, provider ID hiding, idempotency.
// All YouCam traffic is mocked; no live calls are made.
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { parseObservations } from "../../../packages/contracts/src/index.ts";
import { ProviderError } from "../src/providers/types.ts";
import { createYouCamAnalysisProvider } from "../src/providers/youcam/analysisProvider.ts";
import { loadYouCamConfig } from "../src/providers/youcam/config.ts";
import { Secret } from "../src/secret.ts";
import {
  FACE_ATTR_SUCCESS,
  FAKE_API_KEY,
  FAKE_BASE_URL,
  FAKE_FILE_ID,
  FAKE_TASK_ID,
  FAKE_UPLOAD_URL,
  RUNNING,
  engineError,
  fakeYouCam,
  type FakeYouCamOptions,
} from "./fakeYouCam.ts";
import { memoryLogger, syntheticJpeg } from "./helpers.ts";

const image = { bytes: syntheticJpeg(1280, 720), mimeType: "image/jpeg" as const, width: 1280, height: 720 };

function setup(options: FakeYouCamOptions = {}) {
  const youcam = fakeYouCam(options);
  const logger = memoryLogger();
  const config = loadYouCamConfig({ YOUCAM_API_KEY: FAKE_API_KEY, YOUCAM_API_BASE_URL: FAKE_BASE_URL, YOUCAM_POLL_INTERVAL_MS: "1" });
  const provider = createYouCamAnalysisProvider({ config, fetch: youcam.fetch, logger });
  return { youcam, logger, provider };
}

async function analyze(provider: ReturnType<typeof setup>["provider"], signal = new AbortController().signal) {
  return provider.analyze(image, signal);
}

const PROVIDER_LEAK = new RegExp(
  [FAKE_API_KEY, FAKE_FILE_ID, FAKE_TASK_ID, "youcam", "upload\\.", "signature", "female", "Oval", "#3b2a1f", "dark brown", "34"].join("|"),
  "i",
);

describe("secret redaction", () => {
  it("never renders the API key through String, JSON, or inspect", () => {
    const secret = new Secret(FAKE_API_KEY);
    const config = loadYouCamConfig({ YOUCAM_API_KEY: FAKE_API_KEY });

    for (const rendered of [String(secret), JSON.stringify({ secret }), inspect(secret), JSON.stringify(config), inspect(config)]) {
      expect(rendered).not.toContain(FAKE_API_KEY);
    }
    expect(secret.reveal()).toBe(FAKE_API_KEY);
  });

  it("fails closed without echoing configuration when the key is missing", () => {
    expect(() => loadYouCamConfig({})).toThrow(/YOUCAM_API_KEY is required/);
    expect(() => loadYouCamConfig({ YOUCAM_API_KEY: FAKE_API_KEY, YOUCAM_API_BASE_URL: "http://plain.example" })).toThrow(
      /must use https/,
    );
  });

  it("sends the key only to the configured API host, never to the pre-signed upload URL", async () => {
    const { youcam, provider } = setup();

    await analyze(provider);

    const upload = youcam.requests.find((request) => request.url === FAKE_UPLOAD_URL)!;
    expect(upload.method).toBe("PUT");
    expect(upload.headers.authorization).toBeUndefined();
    for (const request of youcam.requests.filter((entry) => entry.url.startsWith(FAKE_BASE_URL))) {
      expect(request.headers.authorization).toBe(`Bearer ${FAKE_API_KEY}`);
    }
  });

  it("keeps the key, IDs, and URLs out of logs and error details", async () => {
    const { logger, provider } = setup({ createReply: { status: 429, body: { status: 429, error: "Too many requests" } } });

    const error = await analyze(provider).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).kind).toBe("rate-limited");
    expect(`${(error as Error).message} ${JSON.stringify(logger.entries)}`).not.toMatch(PROVIDER_LEAK);
  });
});

describe("provider ID hiding and data minimization", () => {
  it("requests a single non-sensitive feature and lenient angle checks", async () => {
    const { youcam, provider } = setup();

    await analyze(provider);

    const create = youcam.requests.find((request) => request.url.endsWith("/task/face-attr-analysis"))!;
    expect(create.body).toEqual({ src_file_id: FAKE_FILE_ID, features: ["hairColor"], face_angle_strictness_level: "flexible" });
  });

  it("returns only neutral observations built from face_quality; attributes and IDs never leave the adapter", async () => {
    const { provider } = setup();

    const observations = await analyze(provider);

    expect(parseObservations(observations)).toEqual(observations);
    expect(JSON.stringify(observations)).not.toMatch(PROVIDER_LEAK);
    expect(observations.find((observation) => observation.category === "lighting")?.text).toBe(
      "The light on your face could be brighter or more even.",
    );
    expect(observations.map((observation) => observation.category)).toEqual(
      expect.arrayContaining(["image-clarity", "framing", "lighting"]),
    );
  });

  it.each([
    ["error_face_position_too_small", "Your face appears small in the frame."],
    ["error_face_position_out_of_boundary", "Part of your face is outside the frame."],
    ["error_face_angle_left_tilt", "Your head appears tilted."],
    ["error_no_face", "No face was clearly detected in the photo."],
  ])("turns the framing check %s into a neutral observation instead of a failure", async (code, text) => {
    const { provider } = setup({ pollReplies: [engineError(code)] });

    const observations = await analyze(provider);

    expect(observations).toContainEqual(expect.objectContaining({ category: "framing", text }));
    expect(JSON.stringify(observations)).not.toMatch(PROVIDER_LEAK);
  });

  it.each([
    ["error_decode_image", "invalid-image"],
    ["error_nsfw_content_detected", "invalid-image"],
    ["exceed_max_filesize", "invalid-image"],
    ["unknown_internal_error", "unavailable"],
    ["something_new", "unavailable"],
  ])("maps engine error %s to %s", async (code, kind) => {
    const { provider } = setup({ pollReplies: [engineError(code)] });

    await expect(analyze(provider)).rejects.toMatchObject({ kind });
  });

  it.each([
    ["auth failure", { createReply: { status: 401, body: { status: 401, error: "Invalid API key" } } }, "unavailable"],
    ["exhausted units", { createReply: { status: 400, body: { status: 400, error: "x", error_code: "CreditInsufficiency" } } }, "unavailable"],
    ["outage", { fileReply: { status: 503, body: {} } }, "unavailable"],
    ["unreachable API", { fileReply: "network-error" as const }, "unavailable"],
    ["missing file_id", { fileReply: { status: 200, body: { status: 200, data: { files: [{}] } } } }, "malformed-response"],
    ["non-https upload URL", {
      fileReply: {
        status: 200,
        body: { status: 200, data: { files: [{ file_id: FAKE_FILE_ID, requests: [{ method: "PUT", url: "http://insecure.test/x", headers: {} }] }] } },
      },
    }, "malformed-response"],
    ["missing face_quality", { pollReplies: [{ status: 200, data: { task_status: "success", results: {} } }] }, "malformed-response"],
    ["unknown task status", { pollReplies: [{ status: 200, data: { task_status: "exploded" } }] }, "malformed-response"],
  ] as const)("maps %s to %s", async (_label, options, kind) => {
    const { provider } = setup(options as FakeYouCamOptions);

    await expect(analyze(provider)).rejects.toMatchObject({ kind });
  });
});

describe("idempotency", () => {
  it("creates exactly one task per analysis and retries only the safe polling reads", async () => {
    const { youcam, provider } = setup({
      pollReplies: [RUNNING, { status: 503, data: null } as never, "network-error", FACE_ATTR_SUCCESS],
    });

    await analyze(provider);

    const creates = (tool: string) => youcam.requests.filter((request) => request.method === "POST" && request.url.endsWith(`/task/${tool}`));
    const uploads = youcam.requests.filter((request) => request.method === "PUT");
    const polls = (tool: string) => youcam.requests.filter((request) => request.method === "GET" && request.url.includes(`/task/${tool}/`));
    expect(creates("face-attr-analysis")).toHaveLength(1);
    expect(creates("skin-analysis")).toHaveLength(1);
    // One upload per tool: reusing a file ID across tools is not documented.
    expect(uploads).toHaveLength(2);
    expect(polls("face-attr-analysis")).toHaveLength(4);
    expect(polls("skin-analysis")).toHaveLength(1);
  });

  it("never re-submits a task when creation fails, so units are not charged twice", async () => {
    const { youcam, provider } = setup({ createReply: { status: 502, body: {} } });

    await expect(analyze(provider)).rejects.toMatchObject({ kind: "unavailable" });

    expect(youcam.requests.filter((request) => request.url.endsWith("/task/face-attr-analysis"))).toHaveLength(1);
  });

  it("gives up after repeated polling failures", async () => {
    const { provider } = setup({ pollReplies: ["network-error"] });

    await expect(analyze(provider)).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("stops polling as soon as the job is cancelled", async () => {
    const { youcam, provider } = setup({ pollReplies: [RUNNING] });
    const controller = new AbortController();

    const pending = analyze(provider, controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort(new Error("cancelled"));
    await expect(pending).rejects.toBeDefined();
    const pollsAtAbort = youcam.requests.filter((request) => request.method === "GET").length;
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(youcam.requests.filter((request) => request.method === "GET")).toHaveLength(pollsAtAbort);
  });
});
