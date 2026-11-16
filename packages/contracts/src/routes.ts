/** Relative first-party paths. The base URL comes from desktop configuration only (R4.1). */
export const API_ROUTES = {
  analysisJobs: "/v1/analysis-jobs",
  analysisJob: (id: string) => `/v1/analysis-jobs/${encodeURIComponent(id)}`,
  tryOnJobs: "/v1/try-on-jobs",
  tryOnJob: (id: string) => `/v1/try-on-jobs/${encodeURIComponent(id)}`,
  tryOnResult: (id: string) => `/v1/try-on-jobs/${encodeURIComponent(id)}/result`,
} as const;
