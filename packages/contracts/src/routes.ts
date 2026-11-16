/** Relative first-party paths. The base URL comes from desktop configuration only (R4.1). */
export const API_ROUTES = {
  jobAnalyses: "/v1/job-analyses",
  analysisJobs: "/v1/analysis-jobs",
  analysisJob: (id: string) => `/v1/analysis-jobs/${encodeURIComponent(id)}`,
  tryOnJobs: "/v1/try-on-jobs",
  tryOnJob: (id: string) => `/v1/try-on-jobs/${encodeURIComponent(id)}`,
  tryOnResult: (id: string) => `/v1/try-on-jobs/${encodeURIComponent(id)}/result`,
  /** Preview image of a curated style, served by the backend so the desktop never loads vendor URLs. */
  tryOnStyleThumbnail: (styleId: string) => `/v1/try-on-styles/${encodeURIComponent(styleId)}/thumbnail`,
} as const;
