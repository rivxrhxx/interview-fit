---
inclusion: always
---

# Security and privacy

All submitted images, derived images, metadata, face geometry, and analysis results are sensitive personal data.

## Non-negotiable rules

- The desktop MUST communicate only with the first-party Interview Fit backend.
- YouCam and AI-provider (Anthropic) secrets MUST NOT appear in React, Rust, Tauri config, desktop binaries, fixtures, prompts, logs, or `.env.example`.
- The AI provider receives job-description text and neutral observation text only. Image bytes, provider scores, and face attributes are never sent to it.
- Before job text leaves the device, tell the user it goes to the Interview Fit backend and its AI provider and that no photo is sent at that step.
- Do not assume compiling a secret into Rust protects it.
- Obtain explicit, unchecked-by-default consent before the first image upload.
- Request camera permission only after the user chooses `Use camera`.
- Stop camera tracks on capture, cancellation, navigation, backgrounding, and close.
- Do not persist source images in localStorage, sessionStorage, IndexedDB, application history, analytics, or logs.
- Strip EXIF and location metadata before backend processing.
- Accept only decoded JPEG or PNG images, at most 10 MiB and 16 megapixels.
- Save a result only after an explicit native save action.
- Use synthetic or explicitly permissioned images in tests and the public repository.
- Never promise vendor deletion timing without verifying the current vendor contract and policy.

## Prohibited outputs

The system MUST NOT diagnose health or skin conditions; show skin scores, skin age, or skin type; score attractiveness; infer personality, emotion, race, ethnicity, health, disability, religion, sexual orientation, or gender identity; predict interview success; rank candidates; or recommend hiring decisions.

## Safe output style

Use optional, neutral phrasing such as `Consider increasing front lighting for clearer video.` Never criticize the user's body or appearance. Skin-prep tips describe how the camera and lighting may render the photo and offer optional lighting or grooming steps; they never name a condition.

## Client-visible errors

Use stable codes such as `CONSENT_REQUIRED`, `IMAGE_INVALID`, `IMAGE_TOO_LARGE`, `RATE_LIMITED`, `PROCESSING_TIMEOUT`, `PROCESSING_UNAVAILABLE`, and `INTERNAL_ERROR`. Never return provider IDs, raw provider messages, stack traces, internal hosts, paths, or secret fragments.
