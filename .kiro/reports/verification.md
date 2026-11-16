# Verification Report

| Check | Command | Status | Evidence |
|---|---|---|---|
| Harness structure | `npm run verify:harness` | Pending | Run before updating |
| TypeScript/frontend build | `npm run build` | Pending | Run before updating |
| Rust/Tauri build | `npm run tauri build` | Blocked until prerequisites are installed | Rust and Linux Tauri system libraries required |
