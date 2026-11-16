# Interview Fit

Interview Fit is a privacy-first Tauri desktop application that combines job-posting analysis, neutral interview-presentation coaching, and one virtual try-on experience.

This repository is prepared for the **Kiroween 2026 Frankenstein category**. The committed `.kiro/` directory is the development harness and source of truth for product rules, architecture, implementation tasks, privacy constraints, and verification.

## MVP

1. Paste a job description.
2. Select or capture a self-photo after explicit consent.
3. Send the normalized image through the Interview Fit backend proxy.
4. Receive YouCam-derived analysis through a normalized contract.
5. Generate non-judgmental, job-contextual presentation guidance.
6. Preview one interview-ready virtual style.
7. Export a report without embedding the source photo by default.

## Stack

- Tauri 2
- React 19 + TypeScript + Vite
- Rust command boundary
- First-party backend proxy for YouCam and recommendation providers
- Kiro specs, steering, prompts, and hooks

## Commands

```bash
npm install
npm run dev
npm run build
npm run verify:harness
npm run verify:fast
npm run tauri dev
```

`npm run tauri dev` additionally requires Rust and the platform-specific Tauri prerequisites.

## Harness workflow

1. Read `.kiro/steering/`.
2. Review `.kiro/specs/interview-fit-mvp/requirements.md`.
3. Approve the design before implementation.
4. Implement one unchecked task from `tasks.md` at a time.
5. Run `npm run verify:fast` before checking off a task.
6. Record meaningful Kiro decisions in `.kiro/reports/kiro-usage-log.md`.

## Privacy boundary

The desktop application must never contain or receive YouCam credentials. It communicates only with the first-party Interview Fit backend. Images and image-derived data are sensitive personal data and must not be used for medical diagnosis, attractiveness scoring, personality inference, candidate ranking, or hiring-outcome prediction.
