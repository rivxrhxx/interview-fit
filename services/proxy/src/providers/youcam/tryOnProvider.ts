import { IMAGE_MAX_BYTES } from "../../../../../packages/contracts/src/index.ts";
import { inspectImage, stripImageMetadata } from "../../imageInspect.ts";
import type { Logger } from "../../logger.ts";
import { ProviderError, type TryOnProvider } from "../types.ts";
import { createYouCamClient } from "./client.ts";
import type { YouCamConfig } from "./config.ts";
import { INVALID_IMAGE_ERRORS } from "./faceQuality.ts";

const TOOL = "cloth-v4";

/** cloth-v4 errors that mean this photo cannot be used for a try-on; the user can pick another. */
const UNSUITABLE_ERRORS = new Set([
  "error_no_face",
  "error_pose",
  "error_face_parsing",
  "error_multi_person",
  "error_invalid_src",
  "error_apply_region_mismatch",
]);

/**
 * AI Clothes V4 adapter for the single curated style (R6.1). The result is
 * downloaded here, validated, and stripped of metadata; the provider's result URL
 * never leaves the backend (R4.2).
 */
export function createYouCamTryOnProvider(options: {
  config: YouCamConfig;
  logger: Logger;
  fetch?: typeof fetch;
}): TryOnProvider {
  const { config, logger } = options;
  const client = createYouCamClient(options);

  return {
    async tryOn(image, _style, signal) {
      const refFileUrl = config.tryOn.refFileUrl;
      if (!refFileUrl) {
        logger.log({ level: "error", event: "try_on_not_configured" });
        throw new ProviderError("unavailable");
      }

      const fileId = await client.uploadImage(image, signal);
      const taskId = await client.createTask(
        TOOL,
        {
          src_file_id: fileId,
          ref_file_url: refFileUrl,
          garment_category: config.tryOn.garmentCategory,
          filter_multi_person: "normal",
        },
        signal,
      );
      const outcome = await client.waitForTask(TOOL, taskId, signal);

      if (outcome.status === "error") {
        if (UNSUITABLE_ERRORS.has(outcome.code)) throw new ProviderError("unsuitable-image");
        throw new ProviderError(INVALID_IMAGE_ERRORS.has(outcome.code) ? "invalid-image" : "unavailable");
      }

      const results = outcome.results as { url?: unknown } | null;
      const bytes = await client.downloadResult(results?.url, IMAGE_MAX_BYTES, signal);
      const inspection = inspectImage(bytes);
      if (!inspection.ok) throw new ProviderError("malformed-response");
      const clean = stripImageMetadata(bytes, inspection.info.mimeType);
      bytes.fill(0);
      if (!clean) throw new ProviderError("malformed-response");
      return { bytes: clean, mimeType: inspection.info.mimeType };
    },
  };
}
