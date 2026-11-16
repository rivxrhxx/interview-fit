---
inclusion: fileMatch
fileMatchPattern: "**/*.{test,spec}.{ts,tsx,rs}"
---

# Testing rules

- Every behavioral task identifies the requirement IDs it verifies.
- Test failure, cancellation, and timeout paths, not only the golden path.
- Frontend tests mock the typed Tauri/backend adapters.
- Rust tests cover each command's validation and error mapping.
- Provider tests use fixtures and a mock adapter by default; live YouCam calls are opt-in and rate-limited.
- Privacy tests verify no upload before consent, EXIF removal, cleanup after every terminal state, log redaction, and report export without the source photo.
- A checkbox in `tasks.md` may be marked complete only after its stated command has passed.
