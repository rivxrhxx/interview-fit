# Interview Fit backend proxy

First-party backend that the desktop app calls. It re-validates every upload, holds images only in memory, and is the only component that talks to the image provider.

## Run

```bash
npm run proxy          # simulator provider on http://127.0.0.1:8080
npm run proxy:youcam   # reads services/proxy/.env (git-ignored) for YouCam settings
npm run test:proxy     # integration suite (no network access)
```

For `proxy:youcam`, create `services/proxy/.env` with `INTERVIEW_FIT_PROVIDER=youcam`, `YOUCAM_API_KEY=…`, and optionally `YOUCAM_TRYON_REF_FILE_URL=…`. The file is git-ignored and checked by `npm run verify:secrets`.

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
| `MAX_LIVE_JOBS` | `50` | Stored jobs before new uploads get `PROCESSING_UNAVAILABLE` |
| `MAX_RETAINED_BYTES` | `268435456` | Image bytes held in memory across jobs and try-on results before new uploads are refused |
| `SWEEP_INTERVAL_MS` | `30000` | Expiry sweep interval; at least 1000 so expired images never wait for a lookup |
| `YOUCAM_STORAGE_HOSTS` | (none) | Optional comma-separated host suffixes allowed for pre-signed upload and result URLs. Set it in production once the provider's storage hosts are known |
| `ANTHROPIC_API_KEY` | (none) | Optional. Enables Claude for the job analysis and suggestions. Without it, the deterministic rules engine is used |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Claude model for both calls |
| `ANTHROPIC_TIMEOUT_MS` | `25000` | Per-call timeout; on timeout the rules engine answers instead |

## YouCam data minimization

The analysis runs two YouCam tools in parallel, each on its own upload (reusing one file ID across tools is not documented):

- `face-attr-analysis` for photo quality. The tool requires at least one attribute feature, so the adapter requests only `hairColor`, the least sensitive option, and discards its value. Only the `face_quality` block and the face-position and angle error codes become neutral lighting and framing observations. Face shape, ratios, colors, age, and gender are never read or returned.
- `skin-analysis` (SD, `format: "json"`) for prep tips, with exactly four concerns: `oiliness`, `moisture`, `redness`, `texture` (the 1-4 concern price tier). Each `raw_score` (1-100, higher means less pronounced) becomes `ok` or `adjustable` (below 60) and is then discarded. Scores, skin age, skin type, and mask URLs never leave the adapter, and the text describes how light and the camera may render the photo without naming a condition. A framing or darkness error becomes one retake hint, and any other skin failure only drops the prep tips: it never fails the analysis.
- Task creation is never retried, so a transient error cannot charge units twice. Only status reads are retried.
- The API key is sent only to the configured API host, never to the pre-signed upload URL.
- Provider file IDs, task IDs, result URLs, and messages stay inside the adapter.

## Job analysis and AI suggestions

`POST /v1/job-analyses` takes `{ jobDescription, locale }` as JSON and returns role, industry, atmosphere, interview format, and dress code, each with a verbatim quote from the posting or marked as not stated, plus a suggested dress formality. No image is involved, so no consent version is required; the desktop shows a notice before sending.

- With `ANTHROPIC_API_KEY`, Claude writes the analysis and the suggestions through the official `@anthropic-ai/sdk` with structured JSON output, low effort, and the server-side refusal fallback. The posting is wrapped in `<job_posting>` delimiters as untrusted data.
- Claude sees text only: the posting for the analysis, then the checked analysis and neutral observation text for the suggestions. Image bytes, provider scores, and face attributes are never sent.
- Every AI answer goes through the same checks as the rules engine: quotes must appear verbatim in the posting, all text must pass the content policy, and suggestions must cite known cue, point, or observation IDs. Anything that fails is dropped, and an outage, refusal, timeout, or unusable answer falls back to the rules engine. The result says which one answered (`source: "ai"` or `"rules"`).
- Analyses are cached in memory for `JOB_TTL_MS`, keyed by a SHA-256 hash of the text and locale, so the photo analysis reuses the one the user saw without a second AI call.
- Logs record only the operation, HTTP status, stop reason, duration, and a coarse failure kind. Prompts, replies, and job text are never logged.

## Cancellation and retention

- `DELETE /v1/analysis-jobs/{id}` cancels a job, zeroes its image, and deletes every try-on made from it.
- `DELETE /v1/analysis-jobs` with the upload's `Idempotency-Key` cancels a job whose ID the client never received (cancel during upload). It never creates anything and always answers 204. If the upload is still in flight, the key is remembered for 60 seconds and the job is cancelled before any provider call.
- Expired jobs are swept on a timer. Their images are zeroed, and try-on results made from them are deleted with them.
- Requests time out after 30 seconds (10 seconds for headers).

## Hairstyle try-on

`POST /v1/try-on-jobs` takes `{ analysisJobId, styleId }` and reuses the temporary image of a successful, consented analysis job, so nothing is uploaded again by the desktop. `styleId` is one of six curated hairstyles in `TRY_ON_STYLES` (R6.1). The desktop lets the user choose; suggestions come only from the posting's dress formality, never from the photo (R6.4).

- The YouCam adapter calls AI Hairstyle `hair-transfer` (v2.1) with a curated `template_id` and `hair_color: "src"`. All six templates have `keep_users_color`, so the user's own hair color is kept. The template's category tag is never shown or used. The result is downloaded on the backend, validated, stripped of metadata, and served from `GET /v1/try-on-jobs/{id}/result`. The provider's result URL is never forwarded.
- `GET /v1/try-on-styles/{styleId}/thumbnail` serves a style's example image. The backend finds the template's thumbnail in YouCam's template list, downloads it, strips its metadata, and keeps it in memory. Only curated style IDs reach the provider.
- The simulator draws illustrated hairstyles (no user pixels, no licensed assets) for deterministic demos and thumbnails.
- `DELETE /v1/try-on-jobs/{id}` cancels a running try-on or deletes a finished result (reset or another style). Results never outlive the analysis job they came from.

YouCam documents that hair-transfer task IDs stay queryable for 24 hours and result URLs for 2 hours. The proxy cannot delete provider-side data, so the consent text refers to the provider's own retention terms instead of promising a deletion time.

## Production notes

- Put the proxy behind TLS and add the deployed origin to the desktop CSP `connect-src` and `VITE_INTERVIEW_FIT_API_BASE_URL`.
- Rate limiting is keyed by the socket address. Behind a reverse proxy, all users share one bucket, and IPv6 address rotation can bypass it. Add trusted-proxy handling and per-client authentication before a public deployment.
- `ALLOWED_ORIGINS` defaults include the Vite dev origin `http://localhost:1420`. Set it explicitly in production.
- The MVP has no end-user authentication. Job IDs are 143-bit random capability tokens, and rate limiting is per client address. A public deployment needs client authentication and abuse protection.
- A live YouCam smoke test needs a real key and consumes units. It is opt-in and has not been run.
