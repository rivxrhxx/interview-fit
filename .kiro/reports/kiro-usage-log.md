# Kiro Usage Log

Record only concrete contributions.

| Date | Kiro feature | Input/task | Decision or correction | Evidence |
|---|---|---|---|---|
| 2026-11-16 | Specs and steering | Initial MVP harness | Limited MVP to one analysis, one recommendation flow, and one try-on; established first-party proxy and prohibited-inference boundaries | `.kiro/specs/interview-fit-mvp/`, `.kiro/steering/` |
| 2026-11-16 | Specs and steering (edited with Claude Code) | Task 12.1 scope update | Product owner replaced the blazer try-on with a hairstyle try-on (YouCam has no S2S eyewear try-on), added Claude job analysis and suggestions, and allowed skin analysis only as non-scored prep tips; non-goals and prohibited outputs were rewritten first so later tasks are tested against them | `.kiro/steering/product.md`, `.kiro/steering/security-privacy.md`, requirements R1.4-R6.4, tasks 12.1-12.6 |
| 2026-11-17 | Hooks (migrated with Claude Code) | External review: hooks used the pre-1.0 `.kiro.hook` format | Rewrote both hooks in the documented v1 format (`.kiro/hooks/*.json`, `PostFileSave` + regex `matcher`, `agent` actions); widened the privacy matcher to the API, Tauri, media, job-text, try-on, and report boundaries; the harness verifier now rejects legacy files and Rust-incompatible regexes and tests each matcher against sample paths. Live run in Kiro still to be recorded | `.kiro/hooks/`, `scripts/verify-harness.mjs`, `docs/SUBMISSION.md` |
