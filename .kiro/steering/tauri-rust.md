---
inclusion: fileMatch
fileMatchPattern: "src-tauri/**"
---

# Tauri and Rust rules

- Expose only narrowly scoped, typed commands.
- Validate command inputs again in Rust; frontend validation is not a trust boundary.
- Keep capabilities explicit and minimal per window.
- Do not enable shell, process, unrestricted filesystem, global path, clipboard, or arbitrary HTTP permissions.
- Use a restrictive production CSP with no wildcard, remote scripts, or `unsafe-eval`.
- Prefer asynchronous commands for I/O and network work.
- Return serializable domain errors, not `anyhow` debug strings or stack details.
- Add negative tests for malformed, oversized, and unauthorized inputs.
- Production builds must not include the opener plugin unless a reviewed feature requires it.
