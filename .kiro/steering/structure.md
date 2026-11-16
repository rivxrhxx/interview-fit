---
inclusion: always
---

# Repository structure

```text
src/
  app/                  application shell and routing
  features/
    job-posting/
    capture/
    consent/
    analysis/
    recommendation/
    try-on/
    report/
  lib/
    api/                 first-party backend adapter
    tauri/               typed IPC adapter
    validation/
src-tauri/
  src/commands/          narrow privileged commands
  capabilities/         explicit per-window permissions
services/proxy/          future backend proxy service
packages/contracts/      shared API schemas and fixtures
tests/                   contract and desktop E2E tests
.kiro/                   committed development harness
```

## Dependency rules

- Features may import `src/lib`, but feature modules must not import another feature's internals.
- React components must not import provider-specific YouCam types.
- React must not access filesystem, shell, arbitrary HTTP, or secrets directly.
- Rust commands must remain thin and delegate domain logic to testable modules.
- Provider-specific translation belongs only in the backend proxy adapter.
- Use stable internal error codes instead of exposing vendor errors.
