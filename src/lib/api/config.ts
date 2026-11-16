const DEFAULT_API_BASE_URL = "http://localhost:8080";

/**
 * The only network origin the desktop talks to (R4.1). It must be an http(s)
 * origin without credentials, path, query, or fragment, and must also be listed
 * in the CSP `connect-src` in src-tauri/tauri.conf.json.
 */
export function resolveApiBaseUrl(configured: string | undefined): string {
  if (!configured) return DEFAULT_API_BASE_URL;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("VITE_INTERVIEW_FIT_API_BASE_URL must be an absolute http(s) URL");
  }
  // Plain http is allowed only for a backend on this machine (development and demos).
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const valid =
    (url.protocol === "https:" || (url.protocol === "http:" && loopback)) &&
    !url.username &&
    !url.password &&
    (url.pathname === "/" || url.pathname === "") &&
    !url.search &&
    !url.hash;
  if (!valid) throw new Error("VITE_INTERVIEW_FIT_API_BASE_URL must be a bare https origin (http only for localhost)");
  return url.origin;
}
