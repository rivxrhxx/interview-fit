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
  /** Successive poll replies; the last one repeats. */
  pollReplies?: Reply[];
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

export const RUNNING = { status: 200, data: { task_status: "running", error: null, results: null } };

export function engineError(code: string) {
  return { status: 200, data: { task_status: "error", error: code, error_message: `${code} for ${FAKE_TASK_ID}` } };
}

export function fakeYouCam(options: FakeYouCamOptions = {}) {
  const requests: RecordedRequest[] = [];
  let polls = 0;
  const pollReplies = options.pollReplies ?? [RUNNING, FACE_ATTR_SUCCESS];

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
    if (method === "POST" && url === `${FAKE_BASE_URL}/s2s/v2.0/task/face-attr-analysis`) {
      return respond(options.createReply ?? { status: 200, body: { status: 200, data: { task_id: FAKE_TASK_ID } } });
    }
    if (method === "GET" && url === `${FAKE_BASE_URL}/s2s/v2.0/task/face-attr-analysis/${FAKE_TASK_ID}`) {
      const reply = pollReplies[Math.min(polls, pollReplies.length - 1)];
      polls += 1;
      return respond(reply === "network-error" ? reply : { status: (reply as { status: number }).status, body: reply });
    }
    return respond({ status: 404, body: { status: 404, error: "Not Found" } });
  };

  return { fetch: fetchImpl as typeof fetch, requests };
}
