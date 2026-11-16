import { Secret } from "../../secret.ts";

export interface YouCamConfig {
  apiKey: Secret;
  baseUrl: string;
  pollIntervalMs: number;
  /** Consecutive failed status reads tolerated before the job fails. */
  maxPollFailures: number;
  /**
   * Optional allowlist of storage host suffixes for pre-signed upload and result
   * URLs returned by the provider. When unset, any https host is accepted.
   */
  storageHosts: string[] | null;
}

const DEFAULT_BASE_URL = "https://yce-api-01.makeupar.com";

/** Reads YouCam settings from the backend environment only. Never bundled into the desktop. */
export function loadYouCamConfig(env: Record<string, string | undefined>): YouCamConfig {
  const key = env.YOUCAM_API_KEY?.trim();
  if (!key) throw new Error("YOUCAM_API_KEY is required when INTERVIEW_FIT_PROVIDER=youcam");

  let base: URL;
  try {
    base = new URL(env.YOUCAM_API_BASE_URL ?? DEFAULT_BASE_URL);
  } catch {
    throw new Error("YOUCAM_API_BASE_URL must be an absolute URL");
  }
  if (base.protocol !== "https:") throw new Error("YOUCAM_API_BASE_URL must use https");

  const pollIntervalMs = Number(env.YOUCAM_POLL_INTERVAL_MS ?? "2000");
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 1) throw new Error("YOUCAM_POLL_INTERVAL_MS must be a positive integer");

  return {
    apiKey: new Secret(key),
    baseUrl: base.origin,
    pollIntervalMs,
    maxPollFailures: 3,
    storageHosts: env.YOUCAM_STORAGE_HOSTS
      ? env.YOUCAM_STORAGE_HOSTS.split(",").map((host) => host.trim().toLowerCase()).filter(Boolean)
      : null,
  };
}
