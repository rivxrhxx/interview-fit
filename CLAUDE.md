# Interview Fit Agent Guide

Kiro is the primary development harness for this Kiroween project. Claude or other agents may assist, but they must follow the committed `.kiro/steering/` and `.kiro/specs/` files.

## Required reading order

1. `.kiro/steering/product.md`
2. `.kiro/steering/tech.md`
3. `.kiro/steering/structure.md`
4. `.kiro/steering/security-privacy.md`
5. `.kiro/specs/interview-fit-mvp/requirements.md`
6. `.kiro/specs/interview-fit-mvp/design.md`
7. `.kiro/specs/interview-fit-mvp/tasks.md`

## Working rules

- Implement only one named task at a time.
- Write tests before implementation when the task introduces behavior.
- Never place vendor or AI-provider credentials in desktop code, Rust binaries, fixtures, prompts, logs, or examples.
- Do not add medical, attractiveness, personality, emotion, protected-trait, employability, or hiring-outcome claims.
- Keep React provider-agnostic and route privileged operations through typed adapters.
- Run `npm run verify:fast` before marking a task complete.
- Do not claim a check passed unless it was actually executed.
