import { IMAGE_MAX_BYTES, type TryOnStyleId } from "../../../../../packages/contracts/src/index.ts";
import { inspectImage, stripImageMetadata } from "../../imageInspect.ts";
import type { Logger } from "../../logger.ts";
import { ProviderError, type TryOnProvider, type TryOnResult } from "../types.ts";
import { createYouCamClient, type YouCamClient } from "./client.ts";
import type { YouCamConfig } from "./config.ts";
import { INVALID_IMAGE_ERRORS } from "./faceQuality.ts";

const TOOL = "hair-transfer";
const VERSION = "v2.1";

/**
 * Curated YouCam hairstyle templates (R6.1). Each one keeps the user's own hair
 * color (`keep_users_color`), and the request also sends `hair_color: "src"`.
 * Template category tags are never used to choose or filter styles (R6.4).
 */
export const STYLE_TEMPLATES: Record<TryOnStyleId, string> = {
  "sleek-middle-part": "female_sleek_middle_part",
  "neat-updo": "female_casual_updo",
  "side-swept-cut": "all_side_swept_undercut",
  "side-part-straight": "female_side_part_straight",
  "short-bob": "all_short_bob",
  "textured-comma": "male_textured_comma",
};

/** hair-transfer errors that mean this photo cannot be used for a try-on; the user can pick another. */
const UNSUITABLE_ERRORS = new Set([
  "error_no_face",
  "error_pose",
  "error_face_pose",
  "error_no_shoulder",
  "error_large_face_angle",
  "error_insufficient_landmarks",
  "error_hair_too_short",
  "error_multi_person",
  "error_invalid_src",
]);

const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
const MAX_TEMPLATE_PAGES = 10;
/** Template thumbnail URLs may be signed and expire, so the list is refreshed periodically. */
const TEMPLATE_LIST_TTL_MS = 30 * 60_000;

/** Downloads a provider image, validates it, and strips metadata; the URL never leaves the backend (R4.2). */
async function fetchClean(client: YouCamClient, url: string, maxBytes: number, signal: AbortSignal): Promise<TryOnResult> {
  const bytes = await client.downloadResult(url, maxBytes, signal);
  const inspection = inspectImage(bytes);
  if (!inspection.ok) throw new ProviderError("malformed-response");
  const clean = stripImageMetadata(bytes, inspection.info.mimeType);
  bytes.fill(0);
  if (!clean) throw new ProviderError("malformed-response");
  return { bytes: clean, mimeType: inspection.info.mimeType };
}

/** YouCam AI Hairstyle (hair-transfer v2.1) adapter with backend-proxied style thumbnails. */
export function createYouCamTryOnProvider(options: {
  config: YouCamConfig;
  logger: Logger;
  fetch?: typeof fetch;
  now?: () => number;
}): TryOnProvider {
  const client = createYouCamClient(options);
  const now = options.now ?? Date.now;
  let thumbUrls: { expiresAt: number; value: Promise<Map<string, string>> } | null = null;
  const thumbnails = new Map<TryOnStyleId, Promise<TryOnResult>>();

  /** Finds the thumbnail URLs of the curated templates in the provider's template list. */
  async function loadThumbUrls(signal: AbortSignal): Promise<Map<string, string>> {
    const wanted = new Set(Object.values(STYLE_TEMPLATES));
    const found = new Map<string, string>();
    let token: string | null = null;
    for (let page = 0; page < MAX_TEMPLATE_PAGES && found.size < wanted.size; page++) {
      const { templates, nextToken } = await client.listTemplates(TOOL, VERSION, token, signal);
      for (const template of templates) if (wanted.has(template.id)) found.set(template.id, template.thumb);
      if (!nextToken) break;
      token = nextToken;
    }
    return found;
  }

  return {
    async tryOn(image, style, signal) {
      const templateId = STYLE_TEMPLATES[style];
      if (!templateId) throw new ProviderError("unavailable");
      const fileId = await client.uploadImage(image, signal);
      const taskId = await client.createTask(TOOL, { src_file_id: fileId, template_id: templateId, hair_color: "src" }, signal, VERSION);
      const outcome = await client.waitForTask(TOOL, taskId, signal, VERSION);

      if (outcome.status === "error") {
        if (UNSUITABLE_ERRORS.has(outcome.code)) throw new ProviderError("unsuitable-image");
        throw new ProviderError(INVALID_IMAGE_ERRORS.has(outcome.code) ? "invalid-image" : "unavailable");
      }
      const results = outcome.results as { url?: unknown } | null;
      return fetchClean(client, String(results?.url ?? ""), IMAGE_MAX_BYTES, signal);
    },

    thumbnail(style, signal) {
      const cached = thumbnails.get(style);
      if (cached) return cached;
      const work = (async () => {
        if (!thumbUrls || thumbUrls.expiresAt <= now()) {
          thumbUrls = { expiresAt: now() + TEMPLATE_LIST_TTL_MS, value: loadThumbUrls(signal) };
        }
        const list = thumbUrls;
        try {
          const url = (await list.value).get(STYLE_TEMPLATES[style]);
          if (!url) {
            options.logger.log({ level: "warn", event: "style_thumbnail_missing" });
            throw new ProviderError("unavailable");
          }
          return await fetchClean(client, url, THUMBNAIL_MAX_BYTES, signal);
        } catch (error) {
          // A failed listing, a missing template, or a stale URL: list again next time.
          if (thumbUrls === list) thumbUrls = null;
          throw error;
        }
      })();
      thumbnails.set(style, work);
      // A failed download is retried on the next request instead of being cached.
      work.catch(() => thumbnails.delete(style));
      return work;
    },
  };
}
