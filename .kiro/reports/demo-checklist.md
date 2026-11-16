# Demo Readiness

Status as of 2026-11-16 on macOS (Apple silicon). "Pass" means the stated check was executed. "Partial" and "Blocked" name what is still missing.

| Item | Status | Evidence or missing step |
|---|---|---|
| Clean install succeeds on the claimed OS | Pass | Fresh `git clone` → `npm ci`, `npm run verify:fast` (325 tests), `npm run build`, `npm run verify:rust` (17 tests, fresh target dir) all exited 0. `npm run tauri build` produced `Interview Fit.app` and `Interview Fit_0.1.0_aarch64.dmg` (the first DMG attempt failed on a busy `hdiutil` volume; the retry succeeded). The packaged binary launched and stayed up without errors. |
| Golden path completes without manual recovery | Partial | Automated: `src/app/Accessibility.a11y.test.tsx` (full flow, keyboard only), `services/proxy/test/desktop-client.integration.test.ts` (real client ↔ proxy analysis and try-on). Missing: a manual run in the packaged app with `npm run proxy`. |
| Consent refusal uploads zero bytes | Pass | `src/features/consent/consent.privacy.test.tsx` (fetch, XHR, and sendBeacon spies) |
| Camera denial falls back to file selection | Pass | `src/features/capture/CameraCapture.test.tsx`. Real macOS permission prompt not exercised (task 4.2 desktop integration test is blocked on macOS). |
| Provider timeout produces a recoverable neutral message | Pass | `src/features/analysis/AnalysisFlow.test.tsx`, `services/proxy/test/analysis-jobs.integration.test.ts`; demo with `SIMULATOR_SCENARIO=timeout` |
| Cancellation removes temporary references | Pass | Proxy cancel tests (image zeroed and cleared), desktop cancel and unmount tests, try-on reset deletes the backend result |
| One virtual try-on compare/reset flow works | Pass | `src/features/try-on/TryOnFlow.test.tsx`, `services/proxy/test/try-on.integration.test.ts` |
| Export excludes the source photo by default | Pass | `src/features/report/buildReport.privacy.test.ts`, Rust `report_export` rejects embedded images. Native save dialog smoke not yet run. |
| Demo image is synthetic or explicitly permissioned | Pass | `npm run demo:photo` generates a deterministic synthetic portrait into git-ignored `demo-assets/` |
| Narration fits within three minutes | Blocked | Needs a timed human rehearsal of `docs/DEMO.md` |
| Public repository contains `.kiro/` and no secrets | Pass | `npm run verify:harness`, `npm run verify:secrets` (all tracked and new files) |
