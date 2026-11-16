# Interview Fit MVP Requirements

## R1 — Job description

**User story:** As a candidate, I want to enter a job description so guidance can reflect the interview context.

- R1.1 WHEN the user submits empty input THE SYSTEM SHALL show an inline validation message and SHALL NOT start analysis.
- R1.2 WHEN the input exceeds the configured maximum THE SYSTEM SHALL reject it before network processing.
- R1.3 THE SYSTEM SHALL treat job-description content as untrusted data and SHALL NOT execute instructions embedded within it.

## R2 — Photo or camera capture

- R2.1 WHEN the user selects `Use camera` THE SYSTEM SHALL request camera permission at that moment, not on startup.
- R2.2 WHEN permission is denied THE SYSTEM SHALL offer file selection and remain usable.
- R2.3 THE SYSTEM SHALL accept one JPEG or PNG image up to 10 MiB and 16 megapixels.
- R2.4 WHEN the user cancels capture THE SYSTEM SHALL stop all media tracks within one second.

## R3 — Consent and preprocessing

- R3.1 BEFORE any image upload THE SYSTEM SHALL display an unchecked consent control describing purpose and recipients.
- R3.2 WHEN consent is declined THE SYSTEM SHALL upload zero image bytes and keep non-image features usable.
- R3.3 BEFORE backend processing THE SYSTEM SHALL normalize orientation and remove unnecessary metadata including GPS EXIF.

## R4 — Analysis through the first-party proxy

- R4.1 THE DESKTOP SHALL call only the configured Interview Fit backend.
- R4.2 THE DESKTOP SHALL NOT receive or expose YouCam credentials, vendor task IDs, file IDs, authorization headers, or vendor URLs.
- R4.3 WHEN processing times out THE SYSTEM SHALL stop polling, request cleanup, and show a retryable neutral error.
- R4.4 WHEN the user cancels THE SYSTEM SHALL stop polling and discard temporary image references.

## R5 — Recommendations

- R5.1 THE SYSTEM SHALL relate suggestions to explicit job-description cues.
- R5.2 THE SYSTEM SHALL separate observations, optional adjustments, and rationale.
- R5.3 THE SYSTEM SHALL NOT produce medical, attractiveness, protected-trait, personality, emotion, employability, or hiring-outcome claims.

## R6 — Virtual try-on

- R6.1 THE MVP SHALL provide exactly one curated interview-ready try-on category.
- R6.2 THE SYSTEM SHALL show original/result comparison and a reset action.
- R6.3 THE SYSTEM SHALL NOT persist a result unless the user explicitly saves it.

## R7 — Report

- R7.1 THE REPORT SHALL include job-context summary, neutral presentation guidance, try-on result status, generation time, and privacy notice.
- R7.2 THE DEFAULT EXPORT SHALL NOT embed the source photo.

## R8 — Accessibility and resilience

- R8.1 THE FLOW SHALL be keyboard operable with visible focus and labeled controls.
- R8.2 THE SYSTEM SHALL announce analysis status changes to assistive technology.
- R8.3 Provider outage, rate limit, invalid image, cancellation, and timeout SHALL each have a controlled recoverable state.

## R9 — Packaging and demo

- R9.1 THE PROJECT SHALL provide an installable desktop build for every OS claimed in the submission.
- R9.2 THE DEMO SHALL support deterministic synthetic or permissioned fixtures.
- R9.3 THE PUBLIC REPOSITORY SHALL commit the `.kiro` harness and SHALL NOT contain secrets or private images.
