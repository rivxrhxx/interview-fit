# Interview Fit MVP Design

## Trust boundaries

```text
React UI
  -> typed Tauri/Rust boundary
  -> Interview Fit first-party backend
      -> YouCam provider adapter
      -> recommendation provider adapter
  <- normalized contracts and opaque Interview Fit job IDs
```

The desktop never communicates directly with a vendor host and never receives provider credentials or identifiers.

## UI state machine

```text
draft -> image-ready -> consenting -> analyzing -> reviewed
      -> trying-on -> report-ready

Any network state -> error or cancelled -> previous safe state
```

## Planned modules

- `src/features/job-posting`: input and untrusted-text boundaries.
- `src/features/capture`: camera/upload and preview lifecycle.
- `src/features/consent`: versioned just-in-time consent.
- `src/features/analysis`: status state machine and normalized results.
- `src/features/recommendation`: neutral policy-filtered coaching.
- `src/features/try-on`: one curated comparison flow.
- `src/features/report`: export without source image by default.
- `src/lib/api`: first-party backend client.
- `src/lib/tauri`: typed privileged command adapter.
- `src-tauri/src/commands`: image selection, temporary-file lifecycle, explicit save.
- `services/proxy`: authentication, validation, provider adapters, cleanup.

## Backend contract sketch

- `POST /v1/analysis-jobs`: consent version, job description, normalized image upload; returns opaque job ID.
- `GET /v1/analysis-jobs/{id}`: normalized state and result.
- `DELETE /v1/analysis-jobs/{id}`: cancel and schedule cleanup.
- `POST /v1/try-on-jobs`: one curated style request.

Errors use `{ error: { code, message, retryable, correlationId } }` and never include vendor details.

## Security decisions

- Restrictive CSP and explicit Tauri capabilities.
- No vendor secrets in desktop artifacts.
- JPEG/PNG signature and decode validation; metadata removal.
- Bounded polling, timeout, retry, and cleanup.
- No durable image history; explicit result export only.
- Treat job text as untrusted prompt content.
- YouCam analysis uses `face-attr-analysis` with the single least sensitive required feature (`hairColor`). The adapter translates only `face_quality` and face-position errors into neutral observations and drops every facial attribute. Skin analysis is not used. Decision approved by the project owner on 2026-11-16; details in `services/proxy/README.md`.

## Test strategy

- React unit tests with mocked adapters.
- Rust command validation tests.
- Backend contract and provider-simulator tests.
- Privacy tests for consent, metadata, persistence, logs, and cleanup.
- Packaged desktop golden-path and failure-path E2E tests.
