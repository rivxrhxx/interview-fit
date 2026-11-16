# Three-minute demo

Use the simulator so the demo is deterministic and needs no credentials. Use only the synthetic portrait or a photo you have explicit permission to show.

## Setup (before recording)

```bash
npm ci
npm run demo:photo                       # demo-assets/synthetic-portrait.png
SIMULATOR_DELAY_MS=1500 npm run proxy    # terminal 1
npm run tauri dev                        # terminal 2
```

Sample job description:

> Senior consultant at a financial advisory firm. You will present findings to clients weekly. Dress code: business casual. Interviews are held over video (Zoom).

## Script

| Time | Action | Narration |
|---|---|---|
| 0:00–0:15 | Show the first screen and the 한국어 / EN switch. | "Interview Fit helps candidates prepare how they present themselves for a specific job, without judging how they look. Tauri and Rust on the device, a React UI, and a first-party backend in front of YouCam and Claude." |
| 0:15–0:45 | Paste the posting, point at the notice under the field, and analyze it. | "Only the posting text is sent here, and the app says so first. The analysis covers role, industry, atmosphere, interview format, and dress code, and every point quotes the posting or says it is not stated. Claude writes it; if Claude is unavailable, a rules engine answers and the badge says so." |
| 0:45–1:05 | Choose `demo-assets/synthetic-portrait.png` and show the preview. | "The Rust command validates the file by its signature, rotates it upright, scales it to 1024 pixels, and re-encodes it, which removes GPS and camera metadata. Nothing has left the device yet." |
| 1:05–1:20 | Open consent. Show that the box starts unchecked, then agree. | "Consent names what is sent and to whom: the photo to YouCam, and only text to Claude. Declining uploads zero bytes." |
| 1:20–1:55 | The analysis runs and the guidance appears. | "YouCam checks photo quality and runs a skin analysis, but scores never leave the backend: they become optional prep tips such as blotting shine before a video call. Each suggestion says what we noticed, an optional adjustment, and why, citing the posting." |
| 1:55–2:30 | Open the hairstyle try-on. Show the marked styles, preview one, compare, then try another. | "Six curated styles; the ones that suit a business-casual posting are marked, and the user chooses. YouCam keeps the user's own hair color. The preview is compared side by side and never saved implicitly." |
| 2:30–2:45 | Create the report and save it. | "The report is text only: the job analysis, observations, suggestions, and which style was previewed. It never embeds the photo." |
| 2:45–3:00 | Close on the `.kiro/` folder and the verification report. | "Kiro specs and steering drove every task, including this scope change. Each requirement maps to tests in `.kiro/reports/verification.md`." |

## Optional failure-path clip

Restart the backend with `SIMULATOR_SCENARIO=timeout PROVIDER_TIMEOUT_MS=3000 npm run proxy` and run an analysis. The app stops polling, asks the backend to clean up, and shows a neutral, retryable message with **Try again** and **Start over**.

## Rehearsal log

Record each rehearsal in `.kiro/reports/demo-checklist.md` with the measured duration. Do not mark narration as passing until a timed run fits within three minutes.
