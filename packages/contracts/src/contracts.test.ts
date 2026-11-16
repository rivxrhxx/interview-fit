// @vitest-environment node
// Task 6.1 — contract fixtures for R4.1 (first-party routes only), R4.2 (no vendor
// credentials, IDs, or URLs), and R8.3 (a controlled state for every failure class).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  API_ROUTES,
  CONTRACT_VERSION,
  ContractError,
  ERROR_CODES,
  ERROR_MESSAGES,
  ERROR_POLICY,
  TRY_ON_STYLES,
  parseAnalysisJob,
  parseApiErrorBody,
  parseTryOnJob,
  type ErrorCode,
} from "./index.ts";

const fixturesDir = join(import.meta.dirname, "..", "fixtures");

function loadFixtures(dir: string): Array<{ name: string; value: unknown }> {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({ name, value: JSON.parse(readFileSync(join(dir, name), "utf8")) as unknown }));
}

const PARSERS: Record<string, (value: unknown) => unknown> = {
  "analysis-job": parseAnalysisJob,
  "try-on-job": parseTryOnJob,
  error: parseApiErrorBody,
};

function parserFor(name: string) {
  const kind = Object.keys(PARSERS).find((prefix) => name.startsWith(`${prefix}.`));
  if (!kind) throw new Error(`fixture ${name} has no known kind prefix`);
  return PARSERS[kind];
}

// Anything that would reveal the provider or a credential to the desktop (R4.2).
const VENDOR_LEAK = /youcam|perfect\s?corp|perfectcorp|task_?id|file_?id|vendor|provider_?id|authorization|bearer|api[_-]?key|https?:\/\//i;

describe("contract fixtures", () => {
  const fixtures = loadFixtures(fixturesDir);

  it("includes fixtures for every failure class (R8.3)", () => {
    const names = fixtures.map((fixture) => fixture.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "analysis-job.queued.json",
        "analysis-job.succeeded.json",
        "analysis-job.cancelled.json",
        "analysis-job.failed-timeout.json",
        "error.processing-unavailable.json",
        "error.rate-limited.json",
        "error.image-invalid.json",
        "error.consent-required.json",
        "try-on-job.succeeded.json",
      ]),
    );
  });

  it.each(loadFixtures(fixturesDir))("$name parses and contains no vendor identifiers (R4.2)", ({ name, value }) => {
    const parsed = parserFor(name)(value);

    expect(JSON.stringify(parsed)).not.toMatch(VENDOR_LEAK);
    expect(JSON.stringify(value)).not.toMatch(VENDOR_LEAK);
  });

  it.each(loadFixtures(join(fixturesDir, "leaks")))(
    "$name: unknown vendor fields are dropped by the parser (R4.2)",
    ({ name, value }) => {
      expect(JSON.stringify(value)).toMatch(VENDOR_LEAK);

      const parsed = parserFor(name)(value);

      expect(JSON.stringify(parsed)).not.toMatch(VENDOR_LEAK);
    },
  );
});

describe("parsers reject malformed payloads", () => {
  const succeeded = loadFixtures(fixturesDir).find((fixture) => fixture.name === "analysis-job.succeeded.json")!.value as Record<
    string,
    unknown
  >;

  it.each([
    ["a non-object", "not a job"],
    ["an unknown state", { ...succeeded, state: "exploded" }],
    ["a non-opaque id", { ...succeeded, id: "https://vendor.example/tasks/123" }],
    ["a succeeded job without a result", { ...succeeded, result: null }],
    ["a failed job without an error", { ...succeeded, state: "failed", result: null, error: null }],
    ["an unknown observation category", {
      ...succeeded,
      result: { ...(succeeded.result as object), observations: [{ id: "obs_1", category: "attractiveness", text: "x" }] },
    }],
  ])("rejects %s", (_label, payload) => {
    expect(() => parseAnalysisJob(payload)).toThrow(ContractError);
  });

  it("rejects an error body with an unknown code", () => {
    expect(() =>
      parseApiErrorBody({ error: { code: "YOUCAM_401", message: "x", retryable: false, correlationId: "req_12345678" } }),
    ).toThrow(ContractError);
  });

  it("rejects oversized text fields", () => {
    const huge = { ...succeeded, result: { ...(succeeded.result as object), generatedAt: "x".repeat(10_000) } };
    expect(() => parseAnalysisJob(huge)).toThrow(ContractError);
  });
});

describe("error codes", () => {
  it.each(ERROR_CODES.map((code) => [code]))("%s has a recovery policy and a neutral message (R8.3)", (code: ErrorCode) => {
    expect(ERROR_POLICY[code]).toBeDefined();
    expect(ERROR_MESSAGES[code].length).toBeGreaterThan(10);
    expect(ERROR_MESSAGES[code]).not.toMatch(VENDOR_LEAK);
  });

  it("classifies outage, rate limit, invalid image, and timeout distinctly (R8.3)", () => {
    expect(ERROR_POLICY.PROCESSING_UNAVAILABLE).toMatchObject({ retryable: true, recovery: "retry-later" });
    expect(ERROR_POLICY.RATE_LIMITED).toMatchObject({ retryable: true, recovery: "retry-later" });
    expect(ERROR_POLICY.IMAGE_INVALID).toMatchObject({ retryable: false, recovery: "choose-another-image" });
    expect(ERROR_POLICY.PROCESSING_TIMEOUT).toMatchObject({ retryable: true, recovery: "retry" });
    expect(ERROR_POLICY.CONSENT_REQUIRED).toMatchObject({ retryable: false, recovery: "review-consent" });
  });
});

describe("routes and catalog", () => {
  it("exposes only relative first-party paths (R4.1)", () => {
    const paths = [
      API_ROUTES.analysisJobs,
      API_ROUTES.analysisJob("an_0123456789abcdefghij"),
      API_ROUTES.tryOnJobs,
      API_ROUTES.tryOnJob("to_0123456789abcdefghij"),
      API_ROUTES.tryOnResult("to_0123456789abcdefghij"),
    ];
    for (const path of paths) expect(path).toMatch(/^\/v1\/[a-z-]+(\/[A-Za-z0-9_]+(\/result)?)?$/);
  });

  it("offers exactly one curated try-on style (R6.1)", () => {
    expect(TRY_ON_STYLES).toHaveLength(1);
  });

  it("declares a contract version", () => {
    expect(CONTRACT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
