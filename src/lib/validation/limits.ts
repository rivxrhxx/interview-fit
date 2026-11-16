/** Maximum job-description length in UTF-16 code units, measured after normalization (R1.2). */
export const JOB_DESCRIPTION_MAX_LENGTH = 12_000;

/** Maximum accepted source image size: 10 MiB (security-privacy steering, R2.3). */
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** Maximum accepted image area: 16 megapixels (security-privacy steering, R2.3). */
export const IMAGE_MAX_PIXELS = 16_000_000;
