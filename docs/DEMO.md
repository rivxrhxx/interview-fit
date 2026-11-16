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

> Senior consultant at a financial advisory firm. You will present findings to clients weekly. Interviews are held over video (Zoom).

## Script

| Time | Action | Narration |
|---|---|---|
| 0:00–0:20 | Show the first screen. | "Interview Fit helps candidates prepare their on-camera presentation for a specific job, without judging how they look. It is a Tauri desktop app with a Rust security boundary, a React UI, and a first-party backend in front of YouCam." |
| 0:20–0:40 | Paste the job description and save it. Point at the character counter. | "The posting is treated as untrusted text. It is only ever scanned for presentation-relevant cues and never interpreted as instructions." |
| 0:40–1:05 | Choose `demo-assets/synthetic-portrait.png` and show the preview. | "The Rust command validates the file by its signature, rotates it upright, and re-encodes it, which removes GPS and camera metadata. Nothing has left the device yet." |
| 1:05–1:25 | Open consent. Show that the box starts unchecked, then check it and agree. | "Consent names what is sent, why, and who receives it, including YouCam. Declining uploads zero bytes." |
| 1:25–1:55 | The analysis runs and the guidance appears. | "The backend re-validates everything and returns neutral observations only: lighting, framing, clarity. Each suggestion is split into what we noticed, an optional adjustment, and why, and quotes the cue from the posting, such as 'over video' or 'financial'." |
| 1:55–2:25 | Open the try-on, generate the preview, compare, then reset. | "There is exactly one curated style. The original and the preview sit side by side; reset deletes the preview here and on the backend. Nothing is saved implicitly." |
| 2:25–2:45 | Create the report and save it. | "The report is text only. It never embeds the photo, and the file is written only where the user chooses in the native dialog." |
| 2:45–3:00 | Close on the `.kiro/` folder and the verification report. | "Kiro specs, steering, and hooks drove every task. Each requirement maps to tests in `.kiro/reports/verification.md`." |

## Optional failure-path clip

Restart the backend with `SIMULATOR_SCENARIO=timeout PROVIDER_TIMEOUT_MS=3000 npm run proxy` and run an analysis. The app stops polling, asks the backend to clean up, and shows a neutral, retryable message with **Try again** and **Start over**.

## Rehearsal log

Record each rehearsal in `.kiro/reports/demo-checklist.md` with the measured duration. Do not mark narration as passing until a timed run fits within three minutes.
