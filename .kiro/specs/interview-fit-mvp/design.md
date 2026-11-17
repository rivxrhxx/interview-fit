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
- `DELETE /v1/analysis-jobs/{id}`: cancel, or delete a finished job's image and result (R4.7).
- `POST /v1/job-analyses`: job description and locale (JSON); returns the job analysis. No image.
- `GET /v1/try-on-styles`: the curated hairstyle list with suggested flags.
- `GET /v1/try-on-styles/{id}/thumbnail`: style preview image proxied by the backend (the desktop never loads vendor URLs).
- `POST /v1/try-on-jobs`: one curated hairstyle request for a consented analysis job, with an `Idempotency-Key`; at most one per analysis, within the memory reservation (R4.6).
- `DELETE /v1/try-on-jobs/{id}`: cancel, or delete a finished result.
- `DELETE /v1/analysis-jobs` and `DELETE /v1/try-on-jobs` with an `Idempotency-Key`: cancel a job whose ID the desktop never received (R4.4, R4.5).

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
- The AI provider is Claude (`claude-opus-5-5`, low effort, structured JSON output, server-side refusal fallback) through the official `@anthropic-ai/sdk`, called only from the backend with `ANTHROPIC_API_KEY`. Prompts wrap job text in delimiters as untrusted data. Inputs are job text and neutral observation text; never image bytes, scores, or attributes. For the job analysis the model may only choose catalog entries with verbatim quotes (and a verbatim title), filling fields the rules left empty; displayed values are catalog labels, the summary is rebuilt, and formality is derived deterministically. Suggestions are validated (known IDs, content policy); skin-prep and hair wording always comes from reviewed templates. Each AI call has its own time budget; any failure or timeout falls back to the rules engine, and only the caller's own cancellation stops a request (R1.6, R5.6). Job analyses are cached in memory by a hash of text and locale, independent of any single request, so the photo analysis reuses the same result.
- Decisions approved by the project owner on 2026-11-16: skin analysis as prep tips only, hairstyle try-on (eyewear has no S2S API), Claude for job analysis and suggestions. Details in `services/proxy/README.md`.

## Test strategy

- React unit tests with mocked adapters.
- Rust command validation tests.
- Backend contract and provider-simulator tests.
- Privacy tests for consent, metadata, persistence, logs, and cleanup.
- Packaged desktop golden-path and failure-path E2E tests.

## Submission readiness

This section records design clarifications added during the 2026-11-17 external review.

### Blocker 1 — Kiro hooks schema (task 13.1)

Both `.kiro/hooks/*.json` files already use `"version": "v1"` with `PostFileSave` triggers, `agent` actions, `enabled` booleans, and regex matchers. The official `v1` schema (Kiro IDE 1.0 / CLI V3) has no additional required fields beyond `name`, `trigger`, and `action` for these hook types. The harness verifier (`scripts/verify-harness.mjs`) checks the `v1` version marker, PascalCase triggers from the allowed set, boolean `enabled`, `agent`/`command` action types with their required fields, and matcher path coverage. No schema migration is needed; task 13.1 is open only for a recorded live run.

### Blocker 2 — Consent and error copy (task 13.2, R3.5)

The copy in `src/lib/i18n/messages/en.ts` separates four distinct events:

1. **Job-text transmission** — happens at the job-analysis step. `job.sendNotice` reads: *"Analyzing sends the posting text to the Interview Fit backend and its AI provider (Anthropic). No photo is sent at this step."*
2. **Photo transmission** — happens only after the user agrees on the consent step. `steps.consenting.description` reads: *"No photo leaves your device until you agree below."* The consent groups also describe the 15-minute temporary copy held by the backend and YouCam's own retention terms.
3. **Interview Fit storage** — the error step copy. `steps.error.description` reads: *"Nothing was saved by Interview Fit."* This names Interview Fit explicitly and does not claim nothing has left the device at all, since the job text and (if analysis ran) the photo already left at earlier steps.
4. **Provider-side retention** — disclosed in the consent recipient text. `consent.groups[2]` ("Who receives it") states that YouCam's *"own retention terms apply to its processing"* and that Anthropic receives posting and observation text only, never the photo.

R3.5 therefore requires the consent step to say the photo specifically has not yet left, not that nothing has, and requires the error step to name Interview Fit as the party that saved nothing rather than making a broader claim.

### Blocker 3 — Memory limit and live-job cap (task 13.3, R4.6)

`tryOnJobs.ts` reserves `2 × photoBytes` (`reservationFor`) before accepting a new try-on. That reservation counts in `retainedBytes()` (result bytes of completed try-ons plus `reservedBytes` of running ones). Before creating a new try-on, `create` checks `fits(reservedBytes − freed)`, where `freed` is the sum of result bytes and reservation of any previous try-on for the same analysis that would be discarded to make room. Only after the capacity check passes are previous try-ons discarded. When the actual result arrives, `source.fill(0)` and `reservedBytes = 0` release the reservation before `fits(result.bytes.length)` is called, so the recheck reflects the true size without double-counting the reservation.

`server.ts` wires the global cap by passing `fits: (bytes) => retainedBytes() + bytes <= config.maxRetainedBytes` to `createTryOnJobs`, where `retainedBytes()` sums `store.retainedBytes()` (analysis photos) and `tryOns.retainedBytes()` (try-on results and reservations). The `maxActive` option (exposed as `config.maxActiveTryOns`, default 3) caps try-ons in progress across all analyses. Because each analysis keeps at most one try-on and there are at most `maxLiveJobs` analyses, at most `maxLiveJobs` try-on results are stored at once, and their bytes, together with the analysis photos and running reservations, always stay within `maxRetainedBytes`. These checks are atomic within the single-threaded Node.js event loop.

### Blocker 4 — Idempotency and cancel-by-key (task 13.4, R4.5)

`http/idempotency.ts` maps `Idempotency-Key` header values (scoped by peer address; must match `[A-Za-z0-9_-]{16,128}`) to job IDs, and records tombstones for cancels that arrive before their job exists. The tombstone map is capped at `MAX_TOMBSTONES = 1_024` entries; when full, the oldest entry is evicted before the new one is inserted.

Three cancel scenarios in `server.ts`:

1. **Server-detected disconnect** — if the socket is already closed, or if the `close` event fires before `writableFinished`, the server calls `tryOns.cancel(record.id)` directly, because nobody else can. This covers the case where the server did receive the full body and create the job, but the client closed the connection before the 202 response arrived.
2. **Desktop cancel by key after abort or unknown outcome** — `createWithKey` in `src/lib/api/client.ts` catches an `AbortError` or a `PROCESSING_UNAVAILABLE` error and immediately issues `DELETE /v1/try-on-jobs` with the same `Idempotency-Key` (no job ID). If the job exists under that key, `server.ts` calls `tryOns.cancel`; if it does not exist yet, `tryOnKeys.tombstone(key)` is recorded so the subsequent `POST` is rejected.
3. **Tombstone checked after body arrives** — after the full body has been parsed and before the job is created, `server.ts` calls `tryOnKeys.takeTombstone(key)`. If the tombstone is present, the server throws `JOB_NOT_FOUND` (404) and creates nothing. This closes the race where the `DELETE` arrived while the `POST` body was still in transit.

A `POST` whose key was already tombstoned returns 404 `JOB_NOT_FOUND`, not 409.

### Blocker 5 — Cascade delete analysis result (task 13.5, R4.7)

In `services/proxy/src/jobs/analysisJobs.ts`, `cancel` on a finished job clears the image buffer, job description text, image info, and result field in-place, then shortens the TTL to `terminalRetentionMs`. The `createJobStore` `onRemove` hook calls `tryOnCascade(id)` → `tryOns.removeForAnalysis(id)` so expiry sweeps cascade too.

After `DELETE /v1/analysis-jobs/{id}` on a completed job, `GET /v1/analysis-jobs/{id}` returns `state: "cancelled"` with `result: null` immediately — the job record is still present but emptied. The record itself becomes 404 only after `terminalRetentionMs` elapses and the sweep removes it. This is verified by the test `"deletes the result of a finished analysis too, so it cannot be read again (R4.7)"` in `services/proxy/test/analysis-jobs.integration.test.ts`, which asserts `{ state: "cancelled", result: null }` right after DELETE, advances the clock past `terminalRetentionMs`, and then asserts 404.

### Blocker 6 — Preserve try-on status in report (task 13.6, R7.3)

`src/app/flowReducer.ts` stores `lastTryOn: LastTryOn` on the `reviewed`, `trying-on`, and `report-ready` states, where `LastTryOn = { status: "created"; styleId: TryOnStyleId } | { status: "unavailable" } | null`. It is set to `null` by `ANALYSIS_SUCCEEDED` (a new analysis always starts with no try-on record), and cleared entirely by `START_OVER` (which resets the whole flow state). Closing, resetting, or a later failed attempt never downgrades a `"created"` record to `null` or `"unavailable"`.

`reportFrom` reads `lastTryOn` to derive `tryOn: TryOnReportStatus` (`"created" | "not-created" | "unavailable"`) and `tryOnStyleId: TryOnStyleId | null`, which `buildReport` uses for the report section. The try-on preview blob is not carried into the report; only the status and style ID are (R6.3, R7.1).

Evidence: `src/app/flowReducer.test.ts` — `describe("try-on status in the report (R7.3)")` — covers created-after-close, created-after-reset-then-fail, latest-created-style, report-closed-and-reopened, unavailable-after-fail, and start-over clears. `src/features/try-on/TryOnFlow.test.tsx` — `"keeps a created preview in the report after going back to guidance (R7.3)"` — verifies the same through the full rendered app.

### Blocker 7 — Camera button disabled until video ready (task 14.1, R2.5)

`CameraCapture.tsx` currently sets `phase = "live"` when `camera.open()` resolves and the stream is attached to `videoRef.current.srcObject`. The `disabled={phase !== "live"}` check on the Take Photo button therefore enables the button before the video element has decoded any frame, which can produce a blank or partial capture on slow devices.

The fix adds a `videoReady` boolean state (initially `false`) and a `checkReady` function that sets it to `true` when `video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA (2)`. `readyState >= 2` is sufficient for `drawImage` to produce a real frame and is the threshold that fires before `HAVE_ENOUGH_DATA (4)`, which some streams never reach. `checkReady` is called once immediately after the stream is assigned to `srcObject`, and registered as a listener on `loadedmetadata`, `loadeddata`, `canplay`, and `resize` events (the last covering resolution changes on a live stream). The disabled predicate becomes `phase !== "live" || !videoReady`, and `stopTracks` resets `videoReady` to `false` so the button is re-disabled if the stream is restarted.
