# Interview Fit MVP Tasks

Only mark a task complete after its verification command passes and evidence is recorded.

- [x] 1.1 Scaffold Tauri 2 + React + TypeScript
  - Requirements: R9.1, R9.3
  - Verify: `npm run build`

- [x] 1.2 Commit Kiro harness and static verifier
  - Requirements: R9.3
  - Verify: `npm run verify:harness`

- [x] 2.1 Create feature-oriented application shell
  - Requirements: R8.1
  - Tests first: keyboard navigation and state rendering
  - Verify: `npm run verify:fast`

- [x] 3.1 Implement job-description input and validation
  - Requirements: R1.1, R1.2, R1.3
  - Tests first: empty, excessive, and instruction-like content
  - Verify: frontend test suite and typecheck

- [x] 4.1 Implement image selection and preview lifecycle
  - Requirements: R2.2, R2.3, R3.3
  - Tests first: unsupported format, oversized image, object URL cleanup
  - Verify: frontend and Rust tests

- [ ] 4.2 Implement camera capture and teardown
  - Requirements: R2.1, R2.4
  - Tests first: permission denied, cancel, navigation, background
  - Verify: desktop integration test

- [x] 5.1 Implement just-in-time consent gate
  - Requirements: R3.1, R3.2
  - Tests first: decline causes zero upload bytes; version changes invalidate consent
  - Verify: privacy test suite

- [x] 6.1 Define normalized analysis contracts and error codes
  - Requirements: R4.1, R4.2, R8.3
  - Verify: contract fixtures

- [x] 6.2 Implement first-party backend analysis job flow
  - Requirements: R4.1, R4.3, R4.4
  - Tests first: timeout, cancel, rate limit, malformed provider response, cleanup
  - Verify: proxy integration suite

- [x] 6.3 Implement YouCam provider adapter
  - Requirements: R4.2
  - Tests first: secret redaction, provider ID hiding, idempotency
  - Verify: mocked provider tests; optional low-volume live smoke

- [x] 7.1 Implement policy-constrained recommendations
  - Requirements: R5.1, R5.2, R5.3
  - Tests first: prohibited claims and prompt-injection attempts
  - Verify: recommendation policy suite

- [x] 8.1 Implement one curated virtual try-on
  - Requirements: R6.1, R6.2, R6.3
  - Tests first: compare, reset, cancellation, no implicit persistence
  - Verify: integration suite

- [ ] 9.1 Implement report and explicit export
  - Requirements: R7.1, R7.2
  - Tests first: source photo absent by default
  - Verify: report tests and manual save-dialog smoke

- [x] 10.1 Complete accessibility and failure states
  - Requirements: R8.1, R8.2, R8.3
  - Verify: automated accessibility checks and keyboard walkthrough

- [ ] 11.1 Package, rehearse, and document submission
  - Requirements: R9.1, R9.2, R9.3
  - Verify: clean install, three-minute demo rehearsal, secret scan, public repo review

## Scope update 2026-11-16 — job analysis, skin prep, AI suggestions, hairstyle try-on

Approved by the project owner: skin analysis as prep tips only, a hairstyle try-on replacing the blazer (YouCam has no S2S eyewear try-on), and Claude for the job analysis and suggestions.

- [x] 12.1 Update steering, requirements, design, and tasks for the new scope
  - Requirements: R1.4-R1.6, R3.3-R3.4, R5.4-R5.6, R6.1-R6.4, R7.1
  - Verify: `npm run verify:harness`

- [x] 12.2 Implement the job and company-atmosphere analysis step (rules engine)
  - Requirements: R1.3, R1.4, R1.5
  - Tests first: evidence quoted verbatim, "not stated" fields, prompt-injection text treated as data, Korean postings, notice shown before sending, retry on failure
  - Verify: `npm run verify:fast`

- [x] 12.3 Implement the Claude AI provider adapter with rules fallback
  - Requirements: R1.6, R5.3, R5.6
  - Tests first: missing key uses rules, timeout, refusal, malformed JSON, unknown IDs, policy violations, no image data or scores in the prompt, key redaction
  - Verify: `npm run verify:fast`

- [x] 12.4 Implement YouCam skin-prep tips and 1024 px JPEG preprocessing
  - Requirements: R3.3, R3.4, R5.4, R5.5
  - Tests first: exactly four concerns requested, scores never leave the backend, framing errors keep other observations, Korean and English text pass the policy, consent version change, Rust resize
  - Verify: `npm run verify:fast` and `npm run verify:rust`

- [x] 12.5 Replace the blazer try-on with the curated hairstyle try-on
  - Requirements: R6.1, R6.2, R6.3, R6.4
  - Tests first: only curated template IDs accepted, `hair_color: "src"`, thumbnails proxied, suggested styles come from job cues only, compare/reset/cancel, no persistence
  - Verify: `npm run verify:fast`

- [ ] 12.6 Update the report, demo docs, and rebuild the desktop app
  - Requirements: R7.1, R7.2, R9.1, R9.2
  - Tests first: report sections in English and Korean, source photo and try-on image absent
  - Verify: `npm run verify` and a manual golden path against the live backend

## Review fixes 2026-11-17

From an external review before submission.

- [ ] 13.1 Migrate Kiro hooks to the v1 format and record a live run
  - Requirements: R9.3
  - Tests first: harness verifier rejects legacy `.kiro.hook` files, unknown triggers, missing actions, and invalid matchers, and checks each matcher against sample paths
  - Verify: `npm run verify:harness`, then a recorded hook run in Kiro (pending: needs the Kiro app)

- [x] 13.2 Make consent and error copy match the actual data flow
  - Requirements: R3.5
  - Tests first: consent step says no photo leaves before agreement; error step names Interview Fit; English and Korean
  - Verify: `npm run verify:fast`

- [x] 13.3 Keep try-on results within the backend memory limit
  - Requirements: R4.6
  - Tests first: reservation refused before start, oversized result discarded, retained bytes never exceed the limit, one try-on in progress per analysis, global in-progress cap
  - Verify: `npm run verify:fast`

- [x] 13.4 Cancel try-ons created before the desktop learned their ID
  - Requirements: R4.5
  - Tests first: repeated key returns the same job, DELETE by key before and after creation, connection closed before the response, desktop cancels by key on abort
  - Verify: `npm run verify:fast`

- [x] 13.5 Delete the analysis result when a finished analysis is deleted
  - Requirements: R4.7
  - Tests first: GET after DELETE returns no result; try-on refused
  - Verify: `npm run verify:fast`

- [x] 13.6 Keep the created hairstyle preview in the report after the try-on screen closes
  - Requirements: R7.1, R7.3
  - Tests first: close, reset, failed retry, and report back-and-forth keep the created style; start over clears it
  - Verify: `npm run verify:fast`

## Submission readiness 2026-11-17

Blockers identified by the external review before submission. Blockers 1–6 are covered by existing tasks 13.1–13.6 (see evidence column). Blocker 7 is a new gap with no prior task.

### Blocker coverage

| Blocker | Requirement | Covered by | Evidence |
|---------|-------------|------------|----------|
| 1 — Hooks schema migration | R9.3 | Task 13.1 (open) | Both hooks are `v1`; verifier checks schema; task open only for live-run evidence |
| 2 — Consent and error copy | R3.5 | Task 13.2 ✓ | `consent.privacy.test.tsx`: R3.5 copy tests in en and ko pass |
| 3 — Memory limit and live-job cap | R4.6 | Task 13.3 ✓ | `try-on.integration.test.ts`: four reservation/capacity cases pass |
| 4 — Idempotency and cancel-by-key | R4.5 | Task 13.4 ✓ | `try-on.integration.test.ts`: tombstone, pre-create DELETE, disconnect abort |
| 5 — Cascade delete analysis result | R4.7 | Task 13.5 ✓ | `analysis-jobs.integration.test.ts`: `"deletes the result of a finished analysis too, so it cannot be read again (R4.7)"` |
| 6 — Preserve try-on status in report | R7.3 | Task 13.6 ✓ | `flowReducer.test.ts`: `describe("try-on status in the report (R7.3)")` · `TryOnFlow.test.tsx`: `"keeps a created preview in the report after going back to guidance (R7.3)"` |
| 7 — Camera button disabled until video ready | R2.5 | **Task 14.1** (new) | — |

- [ ] 14.1 Disable the camera capture button until the video element is ready
  - Requirements: R2.5
  - Failing regression test to write first: `CameraCapture.test.tsx` — add three cases inside a new `describe("video readiness gate (R2.5)")` block:
    1. `"keeps Take Photo disabled while the stream is live but readyState is HAVE_METADATA (1) with 0×0 dimensions"` — mock `camera.open()` resolving immediately; after phase becomes `"live"`, set `video.readyState = 1` and leave `videoWidth`/`videoHeight` at `0`; assert the button is disabled.
    2. `"enables Take Photo after loadeddata fires with readyState 2 and 640×480 dimensions"` — same setup; then set `video.readyState = 2`, `video.videoWidth = 640`, `video.videoHeight = 480`, and fire a `loadeddata` event on the video element; assert the button becomes enabled.
    3. `"keeps Take Photo disabled if an event fires while dimensions are still 0"` — same setup; fire a `loadeddata` event while `videoWidth` is still `0`; assert the button remains disabled.
  - Implementation: add a `videoReady` boolean state (initially `false`) to `CameraCapture`; add a `checkReady` function that reads `video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2` (`HAVE_CURRENT_DATA`) from the ref and calls `setVideoReady(true)` when met; in the effect that assigns `srcObject`, call `checkReady()` once immediately and attach it as a listener on `loadedmetadata`, `loadeddata`, `canplay`, and `resize`; remove those listeners in the effect cleanup; in `stopTracks`, call `setVideoReady(false)`; change the Take Photo button's `disabled` predicate from `phase !== "live"` to `phase !== "live" || !videoReady`.
  - Verify: `npm run verify:fast`
