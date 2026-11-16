import type { Logger } from "../../logger.ts";
import { captureBasics } from "../captureBasics.ts";
import { ProviderError, type AnalysisProvider } from "../types.ts";
import { createYouCamClient } from "./client.ts";
import type { YouCamConfig } from "./config.ts";
import { INVALID_IMAGE_ERRORS, faceQualityObservations, framingErrorText } from "./faceQuality.ts";

const TOOL = "face-attr-analysis";

/**
 * The tool requires at least one attribute feature. `hairColor` is the least
 * sensitive option; its value is discarded. "flexible" angle strictness turns
 * fewer photos into hard rejections so users get guidance instead.
 */
const TASK_OPTIONS = { features: ["hairColor"], face_angle_strictness_level: "flexible" } as const;

export function createYouCamAnalysisProvider(options: {
  config: YouCamConfig;
  logger: Logger;
  fetch?: typeof fetch;
}): AnalysisProvider {
  const client = createYouCamClient(options);

  return {
    async analyze(image, signal, locale = "en") {
      const fileId = await client.uploadImage(image, signal);
      const taskId = await client.createTask(TOOL, { src_file_id: fileId, ...TASK_OPTIONS }, signal);
      const outcome = await client.waitForTask(TOOL, taskId, signal);
      const basics = captureBasics(image, locale);

      if (outcome.status === "error") {
        const framing = framingErrorText(outcome.code, locale);
        if (framing) return [...basics, { id: "obs_face_position", category: "framing", assessment: "adjustable", text: framing }];
        throw new ProviderError(INVALID_IMAGE_ERRORS.has(outcome.code) ? "invalid-image" : "unavailable");
      }

      const quality = faceQualityObservations(outcome.results, locale);
      if (!quality) throw new ProviderError("malformed-response");
      return [...basics, ...quality];
    },
  };
}
