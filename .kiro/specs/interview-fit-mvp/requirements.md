# Interview Fit MVP Requirements

## R1 — Job description

**User story:** As a candidate, I want to enter a job description so guidance can reflect the interview context.

- R1.1 WHEN the user submits empty input THE SYSTEM SHALL show an inline validation message and SHALL NOT start analysis.
- R1.2 WHEN the input exceeds the configured maximum THE SYSTEM SHALL reject it before network processing.
- R1.3 THE SYSTEM SHALL treat job-description content as untrusted data and SHALL NOT execute instructions embedded within it.
- R1.4 WHEN the user saves a job description THE SYSTEM SHALL show a job analysis covering role, industry, workplace atmosphere, interview format, and dress-code context; each point SHALL quote its evidence from the posting or say it is not stated.
- R1.5 BEFORE job text leaves the device THE SYSTEM SHALL state that it goes to the Interview Fit backend and its AI provider and that no photo is sent at that step.
- R1.6 WHEN the AI provider is not configured, fails, times out, or returns output that fails validation THE SYSTEM SHALL use deterministic rules instead and SHALL label the result source.

## R2 — Photo or camera capture

- R2.1 WHEN the user selects `Use camera` THE SYSTEM SHALL request camera permission at that moment, not on startup.
- R2.2 WHEN permission is denied THE SYSTEM SHALL offer file selection and remain usable.
- R2.3 THE SYSTEM SHALL accept one JPEG or PNG image up to 10 MiB and 16 megapixels.
- R2.4 WHEN the user cancels capture THE SYSTEM SHALL stop all media tracks within one second.

## R3 — Consent and preprocessing

- R3.1 BEFORE any image upload THE SYSTEM SHALL display an unchecked consent control describing purpose and recipients.
- R3.2 WHEN consent is declined THE SYSTEM SHALL upload zero image bytes and keep non-image features usable.
- R3.3 BEFORE backend processing THE SYSTEM SHALL normalize orientation, remove unnecessary metadata including GPS EXIF, and re-encode the photo as a JPEG whose long side is at most 1024 pixels.
- R3.4 THE CONSENT TEXT SHALL name YouCam as the recipient of the photo and the AI provider as the recipient of job text and neutral observation text, and SHALL state that the photo is never sent to the AI provider.

## R4 — Analysis through the first-party proxy

- R4.1 THE DESKTOP SHALL call only the configured Interview Fit backend.
- R4.2 THE DESKTOP SHALL NOT receive or expose YouCam credentials, vendor task IDs, file IDs, authorization headers, or vendor URLs.
- R4.3 WHEN processing times out THE SYSTEM SHALL stop polling, request cleanup, and show a retryable neutral error.
- R4.4 WHEN the user cancels THE SYSTEM SHALL stop polling and discard temporary image references.

## R5 — Recommendations

- R5.1 THE SYSTEM SHALL relate suggestions to explicit job-description cues.
- R5.2 THE SYSTEM SHALL separate observations, optional adjustments, and rationale.
- R5.3 THE SYSTEM SHALL NOT produce medical, attractiveness, protected-trait, personality, emotion, employability, or hiring-outcome claims.
- R5.4 THE SYSTEM SHALL request at most four camera-visible skin concerns (oiliness, moisture, redness, texture) and SHALL translate them into optional lighting and grooming-prep tips. Scores, skin age, skin type, and condition names SHALL NOT leave the backend.
- R5.5 WHEN a photo does not meet the skin-analysis framing requirements THE SYSTEM SHALL keep the other observations and explain how to retake the photo to get prep tips.
- R5.6 THE BACKEND MAY use an AI provider to write suggestions from the job analysis and neutral observations only. Every AI-written string SHALL pass the content policy and reference only known observation, cue, and style IDs; otherwise the rules engine output SHALL be used.

## R6 — Hairstyle try-on

- R6.1 THE MVP SHALL provide exactly one try-on category, hairstyle, with a curated set of at most six interview-appropriate styles that keep the user's own hair color.
- R6.2 THE SYSTEM SHALL show original/result comparison and a reset action.
- R6.3 THE SYSTEM SHALL NOT persist a result unless the user explicitly saves it.
- R6.4 THE SYSTEM SHALL let the user choose the style and SHALL NOT infer gender or other traits from the photo to choose or filter styles. Suggested styles are based only on job-context cues.

## R7 — Report

- R7.1 THE REPORT SHALL include the job analysis, neutral observations including skin-prep tips, interview-style suggestions, the hairstyle try-on status and chosen style name, generation time, and privacy notice.
- R7.2 THE DEFAULT EXPORT SHALL NOT embed the source photo.

## R8 — Accessibility and resilience

- R8.1 THE FLOW SHALL be keyboard operable with visible focus and labeled controls.
- R8.2 THE SYSTEM SHALL announce analysis status changes to assistive technology.
- R8.3 Provider outage, rate limit, invalid image, cancellation, and timeout SHALL each have a controlled recoverable state.

## R9 — Packaging and demo

- R9.1 THE PROJECT SHALL provide an installable desktop build for every OS claimed in the submission.
- R9.2 THE DEMO SHALL support deterministic synthetic or permissioned fixtures.
- R9.3 THE PUBLIC REPOSITORY SHALL commit the `.kiro` harness and SHALL NOT contain secrets or private images.
