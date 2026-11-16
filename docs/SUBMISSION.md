# Kiroween Submission Notes

## Category

Frankenstein — Tauri/Rust security boundary + React UX + webcam/photo capture + YouCam photo-quality, skin-prep, and hairstyle try-on + Claude job analysis and suggestions behind a deterministic rules fallback + Kiro engineering harness.

## Public evidence to preserve

- Committed `.kiro/` directory.
- Requirements, design, and task evolution.
- Kiro usage log containing concrete decisions.
- Screenshots or clips of Kiro specs, steering, and hooks in use.
- Test and verification output.
- Public repository, English write-up, and three-minute demo.

## Kiro hooks evidence

The hooks use the current Kiro format: `.kiro/hooks/*.json`, `"version": "v1"`, a `hooks` array, `PostFileSave` triggers with a regex `matcher` on the file path, and `"type": "agent"` actions. The legacy `.kiro.hook` files were removed. `npm run verify:harness` checks the schema and tests each matcher against sample paths.

| Hook | File | Fires for | Action |
|---|---|---|---|
| TypeScript quality gate | `.kiro/hooks/typescript-quality.json` | `.ts`/`.tsx` under any `src/` (desktop, backend, contracts) | Runs `npm run verify:fast`; fixes only errors the edit caused |
| Privacy boundary review | `.kiro/hooks/privacy-review.json` | `src-tauri/`, `services/proxy/`, photo upload, capture, consent, job text, try-on, report, API/Tauri/media adapters, consent and policy contracts | Applies `.kiro/prompts/privacy-review.md` to `git diff` |

To capture evidence in Kiro (IDE 1.0+ or CLI 3.0+):

1. Open the repository and check the Agent Hooks panel lists both hooks as enabled.
2. Ask the Kiro agent to make a small edit to a TypeScript file, for example a comment in `src/app/flow.ts`. File triggers fire for changes the agent makes, not for saves typed by hand in the editor.
3. Record the TypeScript quality gate running `npm run verify:fast`.
4. Ask the agent to edit a file under `services/proxy/src/` and record the privacy review output.
5. Save the screenshots or clip next to the other submission media, add a row to `.kiro/reports/kiro-usage-log.md`, then revert the test edits.

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

- API credentials or authorization headers (YouCam or Anthropic).
- Raw user photos or derived face data.
- Private provider responses, IDs, URLs, or logs.
- Unlicensed assets.
