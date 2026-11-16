# Interview Fit MVP Design

## Trust boundaries

```text
React UI
  -> typed Tauri/Rust boundary
  -> Interview Fit first-party backend
      -> YouCam provider adapter (photo quality, skin prep, hairstyle try-on)
      -> AI provider adapter (Claude: job analysis, interview-style suggestions; text only)
      -> deterministic rules engine (fallback and policy reference)
  <- normalized contracts and opaque Interview Fit job IDs
```

The desktop never communicates directly with a vendor host and never receives provider credentials or identifiers.

## UI state machine

```text
draft -> job-reviewed -> image-ready -> consenting -> analyzing -> reviewed
      -> trying-on -> report-ready

Any network state -> error or cancelled -> previous safe state
```

## Planned modules

- `src/features/job-posting`: input, untrusted-text boundaries, and the job and company-atmosphere analysis view.
- `src/features/capture`: camera/upload and preview lifecycle.
- `src/features/consent`: versioned just-in-time consent.
- `src/features/analysis`: status state machine and normalized results.
- `src/features/recommendation`: neutral policy-filtered coaching.
- `src/features/try-on`: curated hairstyle picker and before/after comparison.
- `src/features/report`: export without source image by default.
- `src/lib/api`: first-party backend client.
- `src/lib/tauri`: typed privileged command adapter.
- `src-tauri/src/commands`: image selection, temporary-file lifecycle, explicit save.
- `services/proxy`: authentication, validation, provider adapters, cleanup.

## Backend contract sketch

- `POST /v1/analysis-jobs`: consent version, job description, normalized image upload; returns opaque job ID.
- `GET /v1/analysis-jobs/{id}`: normalized state and result.
- `DELETE /v1/analysis-jobs/{id}`: cancel and schedule cleanup.
- `POST /v1/job-analyses`: job description and locale (JSON); returns the job analysis. No image.
- `GET /v1/try-on-styles`: the curated hairstyle list with suggested flags.
- `GET /v1/try-on-styles/{id}/thumbnail`: style preview image proxied by the backend (the desktop never loads vendor URLs).
- `POST /v1/try-on-jobs`: one curated hairstyle request for a consented analysis job.

Errors use `{ error: { code, message, retryable, correlationId } }` and never include vendor details.

## Security decisions

- Restrictive CSP and explicit Tauri capabilities.
- No vendor secrets in desktop artifacts.
- JPEG/PNG signature and decode validation; metadata removal.
- Bounded polling, timeout, retry, and cleanup.
- No durable image history; explicit result export only.
- Treat job text as untrusted prompt content.
- Photos are re-encoded on the device as baseline JPEG with the long side capped at 1024 px (hair-transfer accepts only JPEG up to 1024 px; skin analysis needs a short side of at least 480 px).
- YouCam photo quality uses `face-attr-analysis` with the single least sensitive required feature (`hairColor`); the adapter keeps only `face_quality` and face-position errors and drops every facial attribute.
- YouCam skin prep uses `skin-analysis` (SD, `format: "json"`) with exactly four concerns: `oiliness`, `moisture`, `redness`, `texture` (the 1-4 concern price tier). The adapter reads `raw_score` (1-100, higher means less pronounced), maps each concern to `ok` or `adjustable` with a fixed threshold, and discards every score. Tips describe camera and lighting rendering and optional prep steps; they never name a condition. Framing errors (`error_src_face_too_small`, `error_src_face_out_of_bound`) become one framing observation and the analysis continues (R5.5).
- YouCam hairstyle try-on uses `hair-transfer` (v2.1) with `template_id` from a curated list of six templates whose `keep_users_color` is true, sent with `hair_color: "src"`. Template category tags are never shown or used for filtering (R6.4). The result URL stays in the backend.
- The AI provider is Claude (`claude-opus-5-5`, low effort, structured JSON output, server-side refusal fallback) through the official `@anthropic-ai/sdk`, called only from the backend with `ANTHROPIC_API_KEY`. Prompts wrap job text in delimiters as untrusted data. Inputs are job text and neutral observation text; never image bytes, scores, or attributes. Outputs are validated (schema, lengths, known IDs) and checked by the content policy; any failure falls back to the rules engine (R1.6, R5.6). Job analyses are cached in memory by text and locale for the job TTL so the photo analysis reuses the same result.
- Decisions approved by the project owner on 2026-11-16: skin analysis as prep tips only, hairstyle try-on (eyewear has no S2S API), Claude for job analysis and suggestions. Details in `services/proxy/README.md`.

## Test strategy

- React unit tests with mocked adapters.
- Rust command validation tests.
- Backend contract and provider-simulator tests.
- Privacy tests for consent, metadata, persistence, logs, and cleanup.
- Packaged desktop golden-path and failure-path E2E tests.
