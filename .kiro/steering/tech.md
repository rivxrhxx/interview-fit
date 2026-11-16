---
inclusion: always
---

# Technology constraints

- Desktop shell: Tauri 2.
- UI: React 19, TypeScript strict mode, Vite.
- Native boundary: Rust commands with typed serializable inputs and outputs.
- Package manager: npm. Do not introduce pnpm, Yarn, or Bun.
- Desktop calls only the Interview Fit backend; it never calls YouCam directly.
- Shared contracts use JSON-compatible TypeScript types until a schema package is introduced.
- Frontend tests: Vitest and React Testing Library when added.
- Rust tests: cargo test; quality: cargo fmt and clippy.
- E2E target: WebdriverIO Tauri service after the MVP shell is stable.

Do not replace the selected stack without an approved architecture decision record.
