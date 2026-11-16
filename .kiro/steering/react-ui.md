---
inclusion: fileMatch
fileMatchPattern: "src/**/*.{ts,tsx,css}"
---

# React UI rules

- Model the user flow as explicit states: `draft`, `image-ready`, `consenting`, `analyzing`, `reviewed`, `trying-on`, `report-ready`, `error`.
- Do not use booleans that allow impossible combinations such as loading and completed simultaneously.
- Keep provider requests behind a typed first-party API adapter.
- Provide loading, cancellation, permission-denied, timeout, and retry states.
- All controls must be keyboard operable and have visible focus.
- Status changes must be announced to assistive technology.
- Do not render user-controlled HTML or SVG.
- Revoke object URLs when replaced or unmounted.
- Never store source or result image bytes in persistent browser storage.
