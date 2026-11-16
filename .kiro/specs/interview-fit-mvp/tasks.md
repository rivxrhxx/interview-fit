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

- [ ] 7.1 Implement policy-constrained recommendations
  - Requirements: R5.1, R5.2, R5.3
  - Tests first: prohibited claims and prompt-injection attempts
  - Verify: recommendation policy suite

- [ ] 8.1 Implement one curated virtual try-on
  - Requirements: R6.1, R6.2, R6.3
  - Tests first: compare, reset, cancellation, no implicit persistence
  - Verify: integration suite

- [ ] 9.1 Implement report and explicit export
  - Requirements: R7.1, R7.2
  - Tests first: source photo absent by default
  - Verify: report tests and manual save-dialog smoke

- [ ] 10.1 Complete accessibility and failure states
  - Requirements: R8.1, R8.2, R8.3
  - Verify: automated accessibility checks and keyboard walkthrough

- [ ] 11.1 Package, rehearse, and document submission
  - Requirements: R9.1, R9.2, R9.3
  - Verify: clean install, three-minute demo rehearsal, secret scan, public repo review
