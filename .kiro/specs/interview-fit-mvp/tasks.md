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

- [ ] 12.4 Implement YouCam skin-prep tips and 1024 px JPEG preprocessing
  - Requirements: R3.3, R3.4, R5.4, R5.5
  - Tests first: exactly four concerns requested, scores never leave the backend, framing errors keep other observations, Korean and English text pass the policy, consent version change, Rust resize
  - Verify: `npm run verify:fast` and `npm run verify:rust`

- [ ] 12.5 Replace the blazer try-on with the curated hairstyle try-on
  - Requirements: R6.1, R6.2, R6.3, R6.4
  - Tests first: only curated template IDs accepted, `hair_color: "src"`, thumbnails proxied, suggested styles come from job cues only, compare/reset/cancel, no persistence
  - Verify: `npm run verify:fast`

- [ ] 12.6 Update the report, demo docs, and rebuild the desktop app
  - Requirements: R7.1, R7.2, R9.1, R9.2
  - Tests first: report sections in English and Korean, source photo and try-on image absent
  - Verify: `npm run verify` and a manual golden path against the live backend
