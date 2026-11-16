import type { Logger } from "../../logger.ts";
import { ProviderError, type ProviderImage } from "../types.ts";
import type { YouCamConfig } from "./config.ts";

/**
 * Minimal YouCam V2 client: file registration, pre-signed upload, task
 * creation, and status polling. Vendor IDs and URLs stay inside this module's
 * callers in the adapter; nothing here is logged except operation and status.
 */
export type TaskOutcome = { status: "success"; results: unknown } | { status: "error"; code: string };

/** Task API version; hair-transfer exists only under v2.1. */
export type TaskVersion = "v2.0" | "v2.1";

export interface YouCamTemplate {
  id: string;
  thumb: string;
}

export interface YouCamClient {
  uploadImage(image: ProviderImage, signal: AbortSignal): Promise<string>;
  createTask(tool: string, body: Record<string, unknown>, signal: AbortSignal, version?: TaskVersion): Promise<string>;
  waitForTask(tool: string, taskId: string, signal: AbortSignal, version?: TaskVersion): Promise<TaskOutcome>;
  /** One page of a tool's preset templates (id and thumbnail URL only). */
  listTemplates(
    tool: string,
    version: TaskVersion,
    startingToken: string | null,
    signal: AbortSignal,
  ): Promise<{ templates: YouCamTemplate[]; nextToken: string | null }>;
  /** Downloads a result from a pre-signed https URL without credentials. */
  downloadResult(url: unknown, maxBytes: number, signal: AbortSignal): Promise<Uint8Array>;
}

interface Reply {
  status: number;
  body: unknown;
}

// Headers from the file API that must not be forwarded to the storage host.
const BLOCKED_UPLOAD_HEADERS = new Set(["authorization", "cookie", "host", "content-length"]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 512 ? value : null;
}

/** Accepts only https URLs without credentials, on an allowlisted host when one is configured. */
function safeStorageUrl(value: unknown, allowedHosts: string[] | null): string | null {
  const location = nonEmptyString(value);
  if (!location) return null;
  let url: URL;
  try {
    url = new URL(location);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (allowedHosts && !allowedHosts.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) return null;
  return location;
}

/** Reads a response body with a running byte cap instead of buffering it whole. */
async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      chunks.forEach((chunk) => chunk.fill(0));
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

export function createYouCamClient(options: { config: YouCamConfig; logger: Logger; fetch?: typeof fetch }): YouCamClient {
  const { config, logger } = options;
  const fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));

  async function send(operation: string, url: string, init: RequestInit, authenticated: boolean): Promise<Reply> {
    const headers = new Headers(init.headers);
    if (authenticated) headers.set("Authorization", `Bearer ${config.apiKey.reveal()}`);
    let response: Response;
    try {
      response = await fetchImpl(url, { ...init, headers, redirect: "error" });
    } catch {
      if (init.signal?.aborted) throw init.signal.reason;
      logger.log({ level: "warn", event: "provider_request", operation, status: 0 });
      throw new ProviderError("unavailable");
    }
    logger.log({ level: response.ok ? "info" : "warn", event: "provider_request", operation, status: response.status });
    const text = await response.text().catch(() => "");
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return { status: response.status, body };
  }

  function failure(reply: Reply): ProviderError {
    if (reply.status === 429) return new ProviderError("rate-limited");
    if (reply.status === 401 || reply.status === 403) {
      logger.log({ level: "error", event: "provider_auth_failed", status: reply.status });
    }
    // Auth, exhausted units, invalid parameters, and server errors are not the user's to fix.
    return new ProviderError("unavailable");
  }

  function api(path: string) {
    return `${config.baseUrl}${path}`;
  }

  return {
    async uploadImage(image, signal) {
      const fileName = image.mimeType === "image/png" ? "photo.png" : "photo.jpg";
      const registered = await send(
        "file_register",
        api("/s2s/v2.0/file"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: [{ content_type: image.mimeType, file_name: fileName, file_size: image.bytes.length }] }),
          signal,
        },
        true,
      );
      if (registered.status !== 200) throw failure(registered);

      const files = record(record(registered.body)?.data)?.files;
      const entry = Array.isArray(files) ? record(files[0]) : null;
      const fileId = nonEmptyString(entry?.file_id);
      const upload = Array.isArray(entry?.requests) ? record(entry.requests[0]) : null;
      const uploadUrl = safeStorageUrl(upload?.url, config.storageHosts);
      if (!fileId || !upload || !uploadUrl || upload.method !== "PUT") throw new ProviderError("malformed-response");

      const uploadHeaders = new Headers();
      for (const [name, value] of Object.entries(record(upload.headers) ?? {})) {
        if (typeof value === "string" && !BLOCKED_UPLOAD_HEADERS.has(name.toLowerCase())) uploadHeaders.set(name, value);
      }
      // The API key is never sent to the storage host.
      const uploaded = await send(
        "file_upload",
        uploadUrl,
        { method: "PUT", headers: uploadHeaders, body: image.bytes as Uint8Array<ArrayBuffer>, signal },
        false,
      );
      if (uploaded.status < 200 || uploaded.status >= 300) throw failure(uploaded);
      return fileId;
    },

    async createTask(tool, body, signal, version = "v2.0") {
      // Task creation consumes units and has no idempotency key, so it is never retried.
      const created = await send(
        "task_create",
        api(`/s2s/${version}/task/${tool}`),
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal },
        true,
      );
      if (created.status !== 200) throw failure(created);
      const taskId = nonEmptyString(record(record(created.body)?.data)?.task_id);
      if (!taskId) throw new ProviderError("malformed-response");
      return taskId;
    },

    async downloadResult(url, maxBytes, signal) {
      const location = safeStorageUrl(url, config.storageHosts);
      if (!location) throw new ProviderError("malformed-response");
      let response: Response;
      try {
        response = await fetchImpl(location, { method: "GET", redirect: "error", signal });
      } catch {
        if (signal.aborted) throw signal.reason;
        logger.log({ level: "warn", event: "provider_request", operation: "result_download", status: 0 });
        throw new ProviderError("unavailable");
      }
      logger.log({ level: response.ok ? "info" : "warn", event: "provider_request", operation: "result_download", status: response.status });
      if (response.status !== 200) throw new ProviderError("malformed-response");
      const declared = Number(response.headers.get("content-length") ?? "0");
      if (declared > maxBytes) throw new ProviderError("malformed-response");
      const bytes = await readCapped(response, maxBytes);
      if (!bytes || bytes.length === 0) throw new ProviderError("malformed-response");
      return bytes;
    },

    async listTemplates(tool, version, startingToken, signal) {
      const query = new URLSearchParams({ page_size: "20" });
      if (startingToken) query.set("starting_token", startingToken);
      const reply = await send("template_list", api(`/s2s/${version}/task/template/${tool}?${query}`), { method: "GET", signal }, true);
      if (reply.status !== 200) throw failure(reply);
      const data = record(record(reply.body)?.data);
      if (!data || !Array.isArray(data.templates)) throw new ProviderError("malformed-response");
      const templates = data.templates.flatMap((entry) => {
        const template = record(entry);
        const id = nonEmptyString(template?.id);
        const thumb = nonEmptyString(template?.thumb);
        return id && thumb ? [{ id, thumb }] : [];
      });
      const next = data.next_token;
      return { templates, nextToken: typeof next === "string" && next.length > 0 ? next : typeof next === "number" ? String(next) : null };
    },

    async waitForTask(tool, taskId, signal, version = "v2.0") {
      let failures = 0;
      for (;;) {
        if (signal.aborted) throw signal.reason;
        let reply: Reply | null = null;
        try {
          reply = await send(
            "task_poll",
            api(`/s2s/${version}/task/${tool}/${encodeURIComponent(taskId)}`),
            { method: "GET", signal },
            true,
          );
        } catch (error) {
          if (signal.aborted) throw signal.reason;
          if (!(error instanceof ProviderError)) throw error;
        }

        if (!reply || reply.status !== 200) {
          // Status reads are safe to repeat; tolerate brief outages.
          failures += 1;
          if (failures >= config.maxPollFailures) throw reply ? failure(reply) : new ProviderError("unavailable");
          await sleep(config.pollIntervalMs, signal);
          continue;
        }
        failures = 0;

        const data = record(record(reply.body)?.data);
        switch (data?.task_status) {
          case "running":
            await sleep(config.pollIntervalMs, signal);
            continue;
          case "success":
            return { status: "success", results: data.results };
          case "error":
            return { status: "error", code: nonEmptyString(data.error) ?? "unknown_internal_error" };
          default:
            throw new ProviderError("malformed-response");
        }
      }
    },
  };
}
