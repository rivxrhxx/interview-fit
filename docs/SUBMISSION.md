# Kiroween Submission Notes

## Category

Frankenstein — Tauri/Rust security boundary + React UX + webcam/photo capture + YouCam analysis/try-on + recommendation AI + Kiro engineering harness.

## Public evidence to preserve

- Committed `.kiro/` directory.
- Requirements, design, and task evolution.
- Kiro usage log containing concrete decisions.
- Screenshots or clips of Kiro specs, steering, and hooks in use.
- Test and verification output.
- Public repository, English write-up, and three-minute demo.

## Verification evidence

| Evidence | Command or location |
|---|---|
| Requirement-to-test map and results | `.kiro/reports/verification.md` |
| Demo readiness | `.kiro/reports/demo-checklist.md` |
| Full automated verification | `npm run verify` |
| Repository secret and image scan | `npm run verify:secrets` |
| Privacy, policy, contract, backend, accessibility suites | `npm run test:privacy`, `test:policy`, `test:contracts`, `test:proxy`, `test:a11y` |
| Installable macOS bundle | `npm run tauri build` → `src-tauri/target/release/bundle/` |
| Deterministic synthetic demo photo | `npm run demo:photo` |

## Do not publish

- API credentials or authorization headers.
- Raw user photos or derived face data.
- Private provider responses, IDs, URLs, or logs.
- Unlicensed assets.
