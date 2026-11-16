/**
 * In-memory stand-in for the YouCam V2 API, shaped after the published docs
 * (POST /s2s/v2.0/file → PUT pre-signed URL → POST /s2s/v2.0/task/<tool> → GET
 * /s2s/v2.0/task/<tool>/<task_id>). No network access is involved.
 */
export const FAKE_API_KEY = "test-key-NOT-A-REAL-SECRET-0123456789";
export const FAKE_BASE_URL = "https://youcam.test";
export const FAKE_FILE_ID = "yc-file-7f3a9c";
export const FAKE_TASK_ID = "yc-task-b41d2e";
export const FAKE_UPLOAD_URL = `https://upload.youcam-storage.test/put/${FAKE_FILE_ID}?signature=sig-91ab`;
export const FAKE_RESULT_URL = "https://results.youcam-storage.test/out/yc-result-55e1.jpg?signature=sig-77cd";
export const FAKE_THUMB_BASE = "https://cdn.youcam-storage.test/thumbs";

export interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

type Reply = { status: number; body?: unknown } | "network-error";

export interface FakeYouCamOptions {
  fileReply?: Reply;
  uploadReply?: Reply;
  createReply?: Reply;
  /** Successive poll replies for face-attr-analysis and cloth-v4; the last one repeats. */
  pollReplies?: Reply[];
  /** Task creation reply for skin-analysis (defaults to success). */
  skinCreateReply?: Reply;
  /** Successive poll replies for skin-analysis; the last one repeats. */
  skinPollReplies?: Reply[];
  /** Raw bytes (or failure) served at the result URL. */
  resultReply?: { status: number; bytes: Uint8Array; contentType?: string } | "network-error";
  /** Template list pages for hair-transfer, served in order through `next_token`. */
  templatePages?: Array<Array<{ id: string; thumb: string }>>;
  /** Raw bytes served at any thumbnail URL. */
  thumbBytes?: Uint8Array;
}

export function hairSuccess(url = FAKE_RESULT_URL) {
  return { status: 200, data: { task_status: "success", error: null, results: { url } } };
}

export const FACE_ATTR_SUCCESS = {
  status: 200,
  data: {
    task_status: "success",
    error: null,
    results: {
      face_quality: { has_face: true, area: "good", frontal: "good", lighting: "dark", faceangle: "good" },
      agegender: { age: 34, gender: "female" },
      faceshape: "Oval",
      color: { hair_color: "#3b2a1f", hair_color_name: "dark brown", eye_color: "#4a3b2c" },
      facialratio: { face_aspect_ratio: [1.31] },
    },
  },
};

/** Skin-analysis JSON result with scores and mask URLs that must never leave the adapter. */
export const SKIN_SUCCESS = {
  status: 200,
  data: {
    task_status: "success",
    error: null,
    results: {
      output: [
        { type: "oiliness", ui_score: 61, raw_score: 48.25, mask_urls: ["https://results.youcam-storage.test/mask/oiliness.png?signature=sig-1"] },
        { type: "moisture", ui_score: 80, raw_score: 72.5, mask_urls: ["https://results.youcam-storage.test/mask/moisture.png?signature=sig-2"] },
        { type: "redness", ui_score: 85, raw_score: 77.75, mask_urls: [] },
        { type: "texture", ui_score: 68, raw_score: 57.5, mask_urls: [] },
      ],
    },
  },
};

export const RUNNING = { status: 200, data: { task_status: "running", error: null, results: null } };

export function engineError(code: string) {
  return { status: 200, data: { task_status: "error", error: code, error_message: `${code} for ${FAKE_TASK_ID}` } };
}

export function fakeYouCam(options: FakeYouCamOptions = {}) {
  const requests: RecordedRequest[] = [];
  let polls = 0;
  let skinPolls = 0;
  const pollReplies = options.pollReplies ?? [RUNNING, FACE_ATTR_SUCCESS];
  const skinPollReplies = options.skinPollReplies ?? [SKIN_SUCCESS];

  function respond(reply: Reply): Response {
    if (reply === "network-error") throw new TypeError("fetch failed");
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const fetchImpl = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = String(input);
    const method = init.method ?? "GET";
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    requests.push({ method, url, headers, body });

    if (method === "POST" && url === `${FAKE_BASE_URL}/s2s/v2.0/file`) {
      return respond(
        options.fileReply ?? {
          status: 200,
          body: {
            status: 200,
            data: {
              files: [
                {
                  content_type: "image/jpeg",
                  file_name: "photo.jpg",
                  file_id: FAKE_FILE_ID,
                  requests: [
                    {
                      method: "PUT",
                      url: FAKE_UPLOAD_URL,
                      headers: { "Content-Type": "image/jpeg", "Content-Length": "300" },
                    },
                  ],
                },
              ],
            },
          },
        },
      );
    }
    if (method === "PUT" && url === FAKE_UPLOAD_URL) return respond(options.uploadReply ?? { status: 200 });
    const templateList = new RegExp(`^${FAKE_BASE_URL}/s2s/v2\\.1/task/template/hair-transfer\\?(.*)$`).exec(url);
    if (method === "GET" && templateList) {
      const pages = options.templatePages ?? [[]];
      const query = new URLSearchParams(templateList[1]);
      const index = Number(query.get("starting_token") ?? "0");
      const next = index + 1 < pages.length ? String(index + 1) : null;
      return respond({ status: 200, body: { status: 200, data: { templates: pages[index] ?? [], next_token: next } } });
    }
    if (method === "GET" && url.startsWith(`${FAKE_THUMB_BASE}/`)) {
      return new Response((options.thumbBytes ?? new Uint8Array([0xff, 0xd8, 0xff, 0xd9])) as Uint8Array<ArrayBuffer>, {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      });
    }
    const match = /\/s2s\/(v2\.[01])\/task\/(face-attr-analysis|hair-transfer|skin-analysis)(\/|$)/.exec(url);
    const version = match?.[1];
    const tool = match?.[2];
    const created = { status: 200, body: { status: 200, data: { task_id: FAKE_TASK_ID } } };
    if (method === "POST" && tool && url === `${FAKE_BASE_URL}/s2s/${version}/task/${tool}`) {
      return respond((tool === "skin-analysis" ? options.skinCreateReply : options.createReply) ?? created);
    }
    if (method === "GET" && tool === "skin-analysis" && url === `${FAKE_BASE_URL}/s2s/v2.0/task/${tool}/${FAKE_TASK_ID}`) {
      const reply = skinPollReplies[Math.min(skinPolls, skinPollReplies.length - 1)];
      skinPolls += 1;
      return respond(reply === "network-error" ? reply : { status: (reply as { status: number }).status, body: reply });
    }
    if (method === "GET" && url === FAKE_RESULT_URL) {
      const reply = options.resultReply ?? { status: 200, bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) };
      if (reply === "network-error") throw new TypeError("fetch failed");
      return new Response(reply.bytes as Uint8Array<ArrayBuffer>, {
        status: reply.status,
        headers: { "Content-Type": reply.contentType ?? "image/jpeg" },
      });
    }
    if (method === "GET" && tool && url === `${FAKE_BASE_URL}/s2s/${version}/task/${tool}/${FAKE_TASK_ID}`) {
      const reply = pollReplies[Math.min(polls, pollReplies.length - 1)];
      polls += 1;
      return respond(reply === "network-error" ? reply : { status: (reply as { status: number }).status, body: reply });
    }
    return respond({ status: 404, body: { status: 404, error: "Not Found" } });
  };

  return { fetch: fetchImpl as typeof fetch, requests };
}
