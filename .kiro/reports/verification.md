# Verification Report

| Check | Command | Status | Evidence |
|---|---|---|---|
| Harness structure | `npm run verify:harness` | Pass (2026-11-16) | 17 required files present, no secret patterns |
| TypeScript/frontend build | `npm run build` | Pass (2026-11-16) | `tsc && vite build` completed |
| Rust quality and tests | `npm run verify:rust` | Pass (2026-11-16) | fmt, clippy `-D warnings`, `cargo test` on macOS |
| Rust/Tauri build | `npm run tauri build` | Pass (2026-11-16, macOS arm64) | `Interview Fit.app` (Info.plist carries the camera usage text) and `Interview Fit_0.1.0_aarch64.dmg`. The first DMG step failed on a busy `hdiutil` volume; it passed after detaching the stale image and re-running `--bundles dmg`. The packaged binary launched and ran without errors; UI rendering was not checked visually. Windows and Linux builds not run. |
| Clean install | fresh clone → `npm ci`, `verify:fast`, `build`, `verify:rust` | Pass (2026-11-16) | All exited 0; 325 tests and 17 Rust tests |
| Repository secret and image scan | `npm run verify:secrets` | Pass (2026-11-16) | Scanner verified against a planted fixture (private keys, tokens, provider key literals, env files, stray photos are flagged; marked fakes are not) |

## Task evidence

| Task | Requirements | Command | Status | Evidence |
|---|---|---|---|---|
| 2.1 Application shell | R8.1 | `npm run verify:fast` | Pass (2026-11-16) | `src/app/AppShell.test.tsx`: 14 tests (state rendering, skip link, focus on step change) |
| 3.1 Job description input | R1.1, R1.2, R1.3 | `npm run verify:fast` (tests + typecheck) | Pass (2026-11-16) | `src/features/job-posting/*.test.ts(x)`, `src/app/App.test.tsx`: empty, over-limit, no truncation, instruction-like and markup content kept inert |
| 4.1 Image selection and preview | R2.2, R2.3, R3.3 | `npm run verify:fast`, `npm run verify:rust` | Pass (2026-11-16) | Frontend: `src/features/capture/*.test.ts(x)`, `src/lib/validation/image.test.ts`, `src/app/App.test.tsx` (unsupported format, oversized, object URL revoke). Rust: `image_prep` 11 tests (signature, 10 MiB, 16 MP header check, malformed input, Exif/GPS removal, orientation). Browser dev fallback (`browserImageAdapter`) is not unit-tested because jsdom has no canvas decoding |
| 4.2 Camera capture and teardown | R2.1, R2.4 | Desktop integration test | Blocked (2026-11-16) | Implemented and covered by jsdom tests (`src/features/capture/CameraCapture.test.tsx`, `src/lib/media/camera.test.ts`: permission only on `Use camera`, denial falls back to file selection, tracks stop on cancel/unmount/background/pagehide/capture and for a late-arriving stream). The stated desktop integration test is blocked: `tauri-driver` (WebdriverIO Tauri service) does not support macOS WKWebView, so it needs a Linux or Windows runner. Checkbox left open |
| 5.1 Just-in-time consent gate | R3.1, R3.2 | `npm run test:privacy`, `npm run verify:fast` | Pass (2026-11-16) | `src/features/consent/consent.privacy.test.tsx` (8 tests: unchecked control naming purpose and recipients, decline sends zero requests via fetch/XHR/sendBeacon, version mismatch invalidates consent, re-consent after photo change), `src/app/flowReducer.test.ts` (stale-version consent rejected) |
| 6.1 Normalized contracts and error codes | R4.1, R4.2, R8.3 | `npm run test:contracts`, `npm run verify:fast` | Pass (2026-11-16) | `packages/contracts/src/contracts.test.ts` (33 tests): every fixture in `packages/contracts/fixtures/` parses and contains no provider identifiers; leak fixtures prove unknown provider fields and server error text are dropped; malformed payloads rejected; each error code has a recovery policy; routes are relative first-party paths |
| 6.2 Backend analysis job flow | R4.1, R4.3, R4.4 | `npm run test:proxy`, `npm run verify:fast` | Pass (2026-11-16) | `services/proxy/test/*.test.ts` (31 tests): real HTTP server with fake and simulator providers covering consent/image/job-text re-validation, rate limiting, provider timeout with abort and image wipe, cancel, malformed provider output, TTL purge with zeroed buffers, log redaction, CORS allowlist, backend metadata stripping; real desktop client and polling runner against the proxy for success, client timeout cleanup, and abort. Frontend: `src/lib/api/client.test.ts`, `src/features/analysis/*.test.ts(x)` (timeout, cancel, rate limit, invalid image, unmount cleanup, status announcements). Smoke: `npm run proxy` booted on Node with type stripping and completed a simulator job |
| 6.3 YouCam provider adapter | R4.2 | `npm run test:proxy` (mocked provider) | Pass (2026-11-16) | `services/proxy/test/youcam.test.ts` (27 tests, fake YouCam V2 API shaped after the published docs): key redaction through String/JSON/inspect, key never sent to the pre-signed upload host, no key/IDs/URLs/attributes in logs, errors, or observations, single-feature request, framing errors become observations, engine/HTTP error mapping, one task creation per analysis with only status reads retried, polling stops on cancel. First-party idempotency: proxy `Idempotency-Key` dedupe and desktop retry with the same key. Optional live smoke: not run (no credentials; it consumes units) |
| 7.1 Policy-constrained recommendations | R5.1, R5.2, R5.3 | `npm run test:policy`, `npm run verify:fast` | Pass (2026-11-16) | 50 tests: `packages/contracts/src/policy.test.ts` (medical, attractiveness, protected-trait, personality, emotion, hiring claims flagged; neutral guidance allowed), `services/proxy/test/recommendation.policy.test.ts` (verbatim cue evidence, observation/adjustment/rationale separation, every suggestion cites a cue or an observation, prohibited claims removed from any generator, prompt-injection job texts stay inert), `src/features/recommendation/RecommendationList.policy.test.tsx` (separate labeled parts, client-side policy guard, inert markup). Engine is deterministic rules, no model |
| 8.1 One curated virtual try-on | R6.1, R6.2, R6.3 | `npm run test:proxy`, `npm run verify:fast` | Pass (2026-11-16) | Proxy: `services/proxy/test/try-on.integration.test.ts` (style allowlist, reuse of consented analysis image, cancel with provider abort, reset deletes result, TTL purge, failure mapping without provider details, deterministic simulator PNG), `services/proxy/test/youcam-try-on.test.ts` (cloth-v4 request, credential-free result download with metadata stripped, no calls without a licensed garment asset, error mapping), real client ↔ proxy try-on. Desktop: `src/features/try-on/TryOnFlow.test.tsx` (exactly one style and no picker, original/preview comparison, reset revokes URLs and deletes the backend result, cancel stops polling, no localStorage/IndexedDB writes, unsuitable-photo and retry paths, backend analysis copy deleted on start over) |
| 9.1 Report and explicit export | R7.1, R7.2 | Report tests; manual save-dialog smoke | Partial (2026-11-16): report tests pass, manual smoke not run | `src/features/report/buildReport.privacy.test.ts` (required sections, try-on status, no image data, Markdown escaping, content policy), `src/features/report/ReportFlow.test.tsx` (save only on explicit click, text-only payload, saved/cancelled/failed outcomes), Rust `report_export` 6 tests (size and embedded-image rejection, file-name sanitizing, Markdown extension, write and error mapping without paths). The native save dialog needs a person at the keyboard (`npm run tauri dev` → Create report → Save report…), so the checkbox stays open |
| 10.1 Accessibility and failure states | R8.1, R8.2, R8.3 | `npm run test:a11y`, `npm run verify:fast` | Pass (2026-11-16) | `src/app/Accessibility.a11y.test.tsx` (13 tests): axe-core reports zero violations on every golden-path step, analysis in progress, camera open, camera denial, and each failure state; a sanity test proves the checker flags real violations. Each failure class (outage, rate limit, invalid image, timeout, consent required) is announced, focuses the heading, and offers a recovery action; cancellation returns to a focused safe state. Keyboard-only walkthrough completes the golden path with simulated keys in jsdom (the OS file dialog is simulated). Color contrast is not computable in jsdom; the palette was checked by formula: every text pair is at least 4.64:1 (WCAG AA). A manual walkthrough in the packaged app belongs to the 11.1 rehearsal |
| 11.1 Package, rehearse, document | R9.1, R9.2, R9.3 | Clean install, demo rehearsal, secret scan, public repo review | Partial (2026-11-16) | Done: clean install, macOS bundle, secret scan, synthetic demo photo generator, README/DEMO/MACOS_SETUP/SUBMISSION docs, `.kiro/reports/demo-checklist.md`. Open: timed three-minute rehearsal, manual golden path in the packaged app, public repository review after push. Checkbox stays open |

## Independent privacy and security review (2026-11-16)

A separate read-only reviewer applied `.kiro/prompts/privacy-review.md` to all work since `6c160cb`. It found no critical or high issues, three medium issues, and five low issues. Medium issues 1–2 and low issue 4 were reproduced at runtime. All eight were fixed on `fix/security-review-hardening`, each with a regression test:

| # | Finding | Fix | Evidence |
|---|---|---|---|
| 1 | Try-on result outlived deletion of its analysis job | Cascade delete on analysis cancel and expiry | `services/proxy/test/hardening.integration.test.ts` |
| 2 | Cancel during upload could leave an orphaned job | `DELETE /v1/analysis-jobs` with `Idempotency-Key` (with a 60-second tombstone), desktop cancels by key, server cancels when the client disconnects before the response | hardening tests, `src/lib/api/client.test.ts` |
| 3 | No global memory or provider limits | `MAX_LIVE_JOBS`, `MAX_RETAINED_BYTES`, request and header timeouts; trusted-proxy rate limiting documented as a production prerequisite | hardening tests, `services/proxy/README.md` |
| 4 | JPEG metadata after the first scan survived backend stripping | Walk every segment and truncate after EOI | hardening tests |
| 5 | Provider URLs had no host allowlist, and downloads were buffered whole | Optional `YOUCAM_STORAGE_HOSTS`, streaming byte cap | `services/proxy/test/youcam-try-on.test.ts` |
| 6 | Capability broader than needed | `core:default` removed; CSP `asset:` removed | `verify:rust` (build-time capability validation) |
| 7 | Configuration footguns | Sweep interval of at least 1 s; http only for loopback API URLs | hardening tests, client tests |
| 8 | `save_report` could overwrite a path the dialog never confirmed | `create_new` when `.md` had to be appended | Rust `report_export` tests |

The consent text now states the 15-minute backend retention, and the consent version moved to `2026-11-16.v2`. After the fixes, `npm run verify:fast` (344 tests), `npm run build`, `npm run verify:rust` (19 tests), and every named suite exited 0. Removing `core:default` still needs a manual check in the packaged app: `invoke` of the two app commands should still be allowed.

## Scope update (2026-11-16): job analysis, skin prep, Claude suggestions, hairstyle try-on

Tasks 12.1–12.6 (see `tasks.md`) were implemented one branch each, tests first.

| Task | Requirements | Evidence |
|---|---|---|
| 12.1 Spec and steering update | R1.4–R6.4 | `npm run verify:harness` |
| 12.2 Job and company-atmosphere analysis | R1.3, R1.4, R1.5 | `services/proxy/test/job-analysis.test.ts`, `src/features/job-posting/JobInsight.test.tsx`, `src/lib/api/client.test.ts` |
| 12.3 Claude adapter with rules fallback | R1.6, R5.3, R5.6 | `services/proxy/test/claude-writer.test.ts` (SDK against a fake API, no network) |
| 12.4 Skin-prep tips and 1024 px photos | R3.3, R3.4, R5.4, R5.5 | `services/proxy/test/skin-prep.test.ts`, `capture-basics.test.ts`, Rust `image_prep` tests, `src/lib/tauri/image.test.ts`, consent tests (version `2026-11-16.v3`) |
| 12.5 Curated hairstyle try-on | R6.1–R6.4 | `services/proxy/test/youcam-try-on.test.ts`, `try-on.integration.test.ts`, `src/features/try-on/TryOnFlow.test.tsx` |
| 12.6 Report and docs | R7.1, R7.2 | `src/features/report/buildReport.privacy.test.ts`; Chrome screenshots of the full Korean (light) and English (dark) flow against the simulator, with no console errors |

A live smoke test with a faceless synthetic image against the real YouCam API confirmed that the `skin-analysis`, `hair-transfer` (v2.1, `template_id`, `hair_color: "src"`), and template-list request formats are accepted (HTTP 200 on task creation; the tasks then reported no face, which YouCam does not charge for). A real style thumbnail was downloaded and stripped. The success shape of `skin-analysis` with a real face has not been checked live yet.

Reviewing the screenshots found two defects, both fixed with tests: every 1024 px photo was flagged as below HD resolution, and "business casual" was read as a casual workplace.

### Independent review of the new backend code

A separate read-only reviewer reported 3 high, 3 medium, and 3 low findings, two of them reproduced with local probes. All nine were fixed with regression tests:

| # | Finding | Fix |
|---|---|---|
| 1 | AI job-analysis text (summary, values, formality) could carry injected text | The model chooses catalog IDs with verbatim quotes and a verbatim title only, fills only fields the rules left empty, quotes need two letters and no links or contact details, the summary is always rebuilt, formality is derived deterministically |
| 2 | A slow AI failed the request instead of falling back | Per-call AI budgets via `AbortSignal.timeout` / `AbortSignal.any`, no SDK retries, suggestions limited to the time left before the photo deadline; only the caller's own cancellation stops a request |
| 3 | The shared analysis cache was tied to the first caller's signal; a failed job left sibling provider work running | Shared work runs independently and every caller races it against its own signal; `withDeadline` aborts the controller on any failure |
| 4 | A slow skin task failed the whole analysis | 10-second grace after photo quality, then the skin task is stopped and skipped |
| 5 | AI skin-prep or hair wording could slip past the deny-list | Skin-prep and hair wording always comes from reviewed templates, prep tips must answer an adjustable skin-prep observation, and the deny-list gained skin-condition and gendered terms in English and Korean |
| 6 | The thumbnail URL list was cached forever; the thumbnail route had no rate limit | 30-minute list TTL, re-list after any failed download, separate thumbnail rate limit |
| 7 | Cache bookkeeping could evict or delete the wrong entry | In-flight entries are never evicted; deletion checks entry identity |
| 8 | Text analyses used up the upload rate limit, even on cache hits | Separate bucket; cached analyses are free |
| 9 | The photo step could show a different analysis than the job step | The analysis cache now lasts at least an hour. A language switch between the two steps still produces a fresh analysis in the new language |

After the fixes, `npm run verify` exited 0: 503 tests, the production web build, and 22 Rust tests. Task 12.6 stays open until a manual golden path with a real, permissioned face photo runs against the live backend.

## Review fixes 2026-11-17 (tasks 13.1-13.6)

An external review before submission reported six issues. Each fix has its own branch, tests written first, and a requirement (R3.5, R4.5-R4.7, R7.3).

| Task | Finding | Fix | Evidence |
|---|---|---|---|
| 13.1 | Hooks used the pre-1.0 `.kiro.hook` format (`when`/`then`, `askAgent`, `fileEdited`) and would not run | `.kiro/hooks/*.json`, `"version": "v1"`, `PostFileSave` with regex `matcher`, `agent` actions; legacy files removed | `npm run verify:harness` (schema, Rust-compatible regex, sample paths). Live Kiro run still to be recorded |
| 13.2 | Consent said "Nothing leaves your device", but the posting is sent at the job-analysis step | Copy now limits the claim to the photo; the error step names Interview Fit; a test rejects "nothing leaves / is sent / is uploaded" claims in both languages | `src/features/consent/consent.privacy.test.tsx` |
| 13.3 | Try-on results bypassed `MAX_RETAINED_BYTES` (a 500-byte limit held 666 bytes) | Reserve twice the photo size before starting, recheck the real size before storing, zero results that do not fit, one try-on per analysis, `MAX_ACTIVE_TRY_ONS` (3) | `services/proxy/test/try-on.integration.test.ts` samples retained bytes every millisecond |
| 13.4 | A try-on cancelled before its ID arrived kept running | `Idempotency-Key` on try-on creation, `DELETE /v1/try-on-jobs` by key, cancel on early connection close, shared registry | Server and client tests, including raw-socket disconnects |
| 13.5 | Deleting a finished analysis left its result readable | Result and job text are cleared and the state becomes `cancelled` | `services/proxy/test/analysis-jobs.integration.test.ts` |
| 13.6 | Closing the try-on screen made the report say no preview was created | Session-level `lastTryOn` | `src/app/flowReducer.test.ts`, `src/features/try-on/TryOnFlow.test.tsx` |

A separate read-only reviewer then checked these fixes and reported 2 medium and 4 low findings, three of them reproduced with probes. All were fixed with regression tests:

| Severity | Finding | Fix |
|---|---|---|
| Medium | The photo hint and the consent-declined notice still said nothing was uploaded | Both now speak about the photo only; the copy test also rejects "uploaded" / "업로드" / "올리" claims |
| Medium | A try-on cancelled by the backend (replaced, closed connection) left the screen on "running" | The desktop treats a cancel it did not request as a retryable failure |
| Low | Two in-flight requests with the same key created two jobs, and the later try-on cancelled the earlier | The key is checked again after the body arrives, for try-ons and uploads |
| Low | A try-on refused for capacity, or cancelled by key before it arrived, still deleted the previous result | Capacity is checked as if the previous try-on were gone, and it is discarded only after acceptance; a request cancelled first gets `JOB_NOT_FOUND` and changes nothing |
| Low | Hook matchers missed tests, scripts, build config, and the app files that wire adapters and consent; the validator accepted regexes Rust rejects | Broadened matchers, Rust-compatibility check |
| Low | Cancel-by-key tombstones were unbounded | At most 1,024, oldest dropped first |

The reviewer also noted that a provider ignoring cancellation could leave a result on a removed try-on; removed try-ons are now marked ended so a late result is zeroed.
