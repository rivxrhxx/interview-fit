/**
 * Version of the consent text shown before upload. Changing what is sent, why,
 * or to whom requires a new version; the backend rejects any other version
 * with CONSENT_REQUIRED.
 */
// v2 (2026-11-16): states how long the backend keeps the temporary copy.
// v3 (2026-11-16): adds the AI provider (text only), skin-prep tips, 1024 px photos, and the hairstyle try-on.
export const CURRENT_CONSENT_VERSION = "2026-11-16.v3";
