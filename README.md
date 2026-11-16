# Interview Fit

Interview Fit is a privacy-first Tauri desktop app that combines job-posting analysis, neutral interview-presentation coaching, and one virtual try-on.

This repository is prepared for the **Kiroween 2026 Frankenstein category**. The committed `.kiro/` directory is the development harness and the source of truth for product rules, architecture, implementation tasks, privacy constraints, and verification.

## What it does

1. Paste a job description. It is treated as plain text and is never interpreted as instructions.
2. Choose a photo or use the camera. The image is validated, rotated upright, and re-encoded without location or camera metadata on the device.
3. Read and agree to just-in-time consent. Nothing is uploaded before that.
4. The Interview Fit backend analyzes the photo through a normalized contract (deterministic simulator or YouCam).
5. Review neutral lighting, framing, and clarity observations, plus optional suggestions tied to explicit cues in the job description.
6. Preview one curated interview style (navy blazer) side by side with the original, then reset.
7. Export a text report. It never contains the photo.

Interview Fit does not diagnose, score appearance, infer personality, emotion, or protected traits, or predict hiring outcomes. A shared content policy enforces this on the backend and again in the desktop app.

## Architecture

```text
React UI (src/)                    feature modules, explicit state machine
  ├─ typed Tauri adapter ──────────► Rust commands (src-tauri/)
  │                                    prepare_image  validate, orient, strip metadata
  │                                    save_report    native save dialog, user-chosen path only
  └─ typed API client ─────────────► Interview Fit backend (services/proxy/)
                                       re-validation, consent check, rate limit, CORS allowlist
                                       ├─ simulator provider (deterministic demo)
                                       └─ YouCam adapter (face_quality + cloth-v4 try-on)
Shared contracts (packages/contracts/)  types, runtime parsers, error codes, content policy, fixtures
```

The desktop app never holds provider credentials and never calls the provider directly. Provider IDs, URLs, and messages stay inside the backend adapter.

## Quick start (simulator, no credentials)

Prerequisites: Node.js 22.18+ (or 23.6+), npm, Rust, and the Tauri platform prerequisites (see `docs/MACOS_SETUP.md`).

```bash
npm ci
npm run proxy          # terminal 1: backend on http://127.0.0.1:8080 with the simulator
npm run tauri dev      # terminal 2: desktop app
npm run demo:photo     # optional: writes demo-assets/synthetic-portrait.png
```

Demo failure paths: `SIMULATOR_SCENARIO=timeout npm run proxy` (also `unavailable`, `rate-limited`, `malformed`). See `docs/DEMO.md` for the three-minute walkthrough.

To use YouCam instead of the simulator, configure the backend environment as described in `services/proxy/README.md`. Never put provider keys in the desktop project.

## Commands

| Command | Purpose |
|---|---|
| `npm run verify:fast` | Harness check, repository secret and image scan, typecheck (desktop, backend, integration), all tests |
| `npm run verify` | `verify:fast` plus production web build and `verify:rust` |
| `npm run verify:rust` | `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test` |
| `npm run test:privacy` | Consent, upload, and report privacy suite |
| `npm run test:policy` | Recommendation content policy and prompt-injection suite |
| `npm run test:contracts` | Contract fixtures and parsers |
| `npm run test:proxy` | Backend integration suite, including the real desktop client against the proxy |
| `npm run test:a11y` | axe-core checks and keyboard-only walkthrough |
| `npm run tauri build` | Installable desktop bundle for the current OS |

## Repository layout

```text
src/app/                 shell, flow reducer, error panel
src/features/            job-posting, capture, consent, analysis, recommendation, try-on, report
src/lib/                 api client, tauri adapters, media helpers, validation
src-tauri/               Rust commands, capabilities, Info.plist (camera usage text)
services/proxy/          first-party backend and provider adapters
packages/contracts/      shared contracts, content policy, fixtures
scripts/                 harness verifier, repository scan, demo photo generator
.kiro/                   steering, specs, prompts, hooks, reports
```

## Harness workflow

1. Read `.kiro/steering/`.
2. Review `.kiro/specs/interview-fit-mvp/requirements.md` and `design.md`.
3. Implement one unchecked task from `tasks.md` at a time, with tests first.
4. Run the task's verification before checking it off, and record evidence in `.kiro/reports/verification.md`.
5. Record meaningful Kiro decisions in `.kiro/reports/kiro-usage-log.md`.

## Privacy boundary

Images and image-derived data are sensitive personal data. They stay in memory on the device, are uploaded only after explicit consent, and are held by the backend only temporarily: they are deleted on cancel, failure, start-over, or expiry (15 minutes by default). Results are written to disk only when the user explicitly saves a report, and the report contains no image data. The image provider's own retention terms apply to its processing.
