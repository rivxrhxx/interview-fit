import type { SimulatorScenario } from "./providers/simulator.ts";

export interface ProxyConfig {
  host: string;
  port: number;
  /** Exact desktop webview origins allowed by CORS. */
  allowedOrigins: string[];
  /** How long a finished job and its temporary image are retained for try-on. */
  jobTtlMs: number;
  /** How long a cancelled or failed job record (without image) stays readable. */
  terminalRetentionMs: number;
  providerTimeoutMs: number;
  rateLimitPerMinute: number;
  sweepIntervalMs: number;
  /** Upper bound on stored jobs; new uploads get PROCESSING_UNAVAILABLE beyond it. */
  maxLiveJobs: number;
  /** Upper bound on image bytes held in memory across all jobs and try-on results. */
  maxRetainedBytes: number;
  /** Try-ons queued or processing at once across all analyses (one per analysis). */
  maxActiveTryOns: number;
  provider: "simulator" | "youcam";
  simulator: { delayMs: number; scenario: SimulatorScenario };
}

const DEFAULT_ORIGINS = ["tauri://localhost", "http://tauri.localhost", "http://localhost:1420"];
const SCENARIOS: readonly SimulatorScenario[] = ["success", "timeout", "unavailable", "rate-limited", "malformed"];

function integer(value: string | undefined, fallback: number, min: number): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) throw new Error(`Invalid numeric configuration value: ${value}`);
  return parsed;
}

export function loadConfig(env: Record<string, string | undefined>): ProxyConfig {
  const provider = env.INTERVIEW_FIT_PROVIDER ?? "simulator";
  if (provider !== "simulator" && provider !== "youcam") throw new Error(`Unsupported provider: ${provider}`);
  const scenario = (env.SIMULATOR_SCENARIO ?? "success") as SimulatorScenario;
  if (!SCENARIOS.includes(scenario)) throw new Error(`Unsupported simulator scenario: ${scenario}`);

  return {
    host: env.HOST ?? "127.0.0.1",
    port: integer(env.PORT, 8080, 0),
    allowedOrigins: env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()) : DEFAULT_ORIGINS,
    jobTtlMs: integer(env.JOB_TTL_MS, 15 * 60_000, 1_000),
    terminalRetentionMs: integer(env.TERMINAL_RETENTION_MS, 60_000, 0),
    providerTimeoutMs: integer(env.PROVIDER_TIMEOUT_MS, 45_000, 10),
    rateLimitPerMinute: integer(env.RATE_LIMIT_PER_MINUTE, 10, 1),
    // At least once per second-scale interval, so expired images never wait for a lookup.
    sweepIntervalMs: integer(env.SWEEP_INTERVAL_MS, 30_000, 1_000),
    maxLiveJobs: integer(env.MAX_LIVE_JOBS, 50, 1),
    maxRetainedBytes: integer(env.MAX_RETAINED_BYTES, 256 * 1024 * 1024, 1),
    maxActiveTryOns: integer(env.MAX_ACTIVE_TRY_ONS, 3, 1),
    provider,
    simulator: { delayMs: integer(env.SIMULATOR_DELAY_MS, 1_200, 0), scenario },
  };
}
