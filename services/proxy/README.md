# Interview Fit backend proxy

First-party backend that the desktop app calls. It re-validates every upload, holds images only in memory, and is the only component that talks to the image provider.

## Run

```bash
npm run proxy          # simulator provider on http://127.0.0.1:8080
npm run test:proxy     # integration suite (no network access)
```

Node 22.18+ or 23.6+ runs the TypeScript sources directly through type stripping.

## Configuration

All settings come from the backend environment. Never put provider credentials in desktop code, `.env.example`, fixtures, prompts, or logs.

| Variable | Default | Purpose |
|---|---|---|
| `HOST` / `PORT` | `127.0.0.1` / `8080` | Listen address |
| `ALLOWED_ORIGINS` | `tauri://localhost,http://tauri.localhost,http://localhost:1420` | Exact CORS origins of the desktop webview |
| `INTERVIEW_FIT_PROVIDER` | `simulator` | `simulator` or `youcam` |
| `SIMULATOR_SCENARIO` | `success` | `success`, `timeout`, `unavailable`, `rate-limited`, `malformed` (demo failure paths) |
| `SIMULATOR_DELAY_MS` | `1200` | Simulated processing time |
| `YOUCAM_API_KEY` | (none) | Required for `youcam`. Read only by the proxy, wrapped in a redacting `Secret` |
| `YOUCAM_API_BASE_URL` | `https://yce-api-01.makeupar.com` | Must be https |
| `YOUCAM_POLL_INTERVAL_MS` | `2000` | Status polling interval |
| `PROVIDER_TIMEOUT_MS` | `45000` | Hard deadline per analysis |
| `JOB_TTL_MS` | `900000` | How long a finished job and its image are kept for try-on |
| `TERMINAL_RETENTION_MS` | `60000` | How long a failed or cancelled job record (without image) stays readable |
| `RATE_LIMIT_PER_MINUTE` | `10` | Job creations per client address |

## YouCam data minimization

YouCam's analysis tools are skin analysis (dermatological, excluded by the product rules) and the Face Attributes & Ratio Analyzer. The adapter uses `face-attr-analysis` because it returns a `face_quality` block (`has_face`, `area`, `frontal`, `lighting`, `faceangle`):

- The tool requires at least one attribute feature, so the adapter requests only `hairColor`, the least sensitive option, and discards its value.
- Only `face_quality` and the face-position and angle error codes are translated, into neutral lighting and framing observations. Face shape, ratios, colors, age, and gender are never read or returned.
- Task creation is never retried, so a transient error cannot charge units twice. Only status reads are retried.
- The API key is sent only to the configured API host, never to the pre-signed upload URL.
- Provider file IDs, task IDs, result URLs, and messages stay inside the adapter.

YouCam documents that task results stay queryable for 24 hours and result URLs for 2 hours. The proxy cannot delete provider-side data, so the consent text refers to the provider's own retention terms instead of promising a deletion time.

## Production notes

- Put the proxy behind TLS and add the deployed origin to the desktop CSP `connect-src` and `VITE_INTERVIEW_FIT_API_BASE_URL`.
- The MVP has no end-user authentication. Job IDs are 143-bit random capability tokens, and rate limiting is per client address. A public deployment needs client authentication and abuse protection.
- A live YouCam smoke test needs a real key and consumes units. It is opt-in and has not been run.
