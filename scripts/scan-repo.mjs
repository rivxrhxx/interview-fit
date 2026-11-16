// Repository-wide publication check (R9.3): no credentials, no environment files,
// and no images outside the allowlisted asset folders in any tracked file.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SECRET_PATTERNS = [
  ["private key", /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ["OpenAI-style key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/],
  ["Anthropic key", /\bsk-ant-[A-Za-z0-9_-]{20,}\b/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  // A literal bearer credential (not a template such as `Bearer ${...}` or a <placeholder>).
  ["bearer token", /Authorization:\s*["']?Bearer\s+(?![<$`{])[A-Za-z0-9._~+/-]{20,}/i],
  // Env-style assignment (`YOUCAM_API_KEY=value`) or a quoted literal in code; constant references are fine.
  ["assigned provider key", /^\s*(?:export\s+)?(?:YOUCAM|PERFECTCORP|ANTHROPIC)_(?:API_)?KEY\s*=\s*[^\s#"']+/],
  ["provider key literal", /\b(?:YOUCAM|PERFECTCORP|ANTHROPIC)_(?:API_)?KEY["']?\s*[:=]\s*["'](?![<$`{])[^"'\s]+["']/],
];

// Values in test fixtures that are deliberately fake.
const ALLOWED_FAKES = [/NOT-A-REAL-SECRET/, /placeholder-not-real/];

const IMAGE_EXTENSIONS = /\.(?:jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i;
const IMAGE_ALLOWLIST = [/^src-tauri\/icons\//, /^public\//];
const ENV_FILE = /(?:^|\/)\.env(?:\.[^/]*)?$/;
const BINARY = /\.(?:icns|ico|png|jpe?g|gif|webp|woff2?|ttf)$/i;
/** Desktop sources: AI and vendor SDKs or hosts must never appear here (security-privacy steering). */
const DESKTOP_SOURCE = /^(?:src|src-tauri\/src)\//;
const DESKTOP_FORBIDDEN = [
  ["AI SDK import", /@anthropic-ai\//],
  ["AI provider host", /api\.anthropic\.com/],
  ["vendor API host", /makeupar\.com|perfectcorp\.com/],
];

export function scanFiles(root, files) {
  const findings = [];
  for (const file of files) {
    if (ENV_FILE.test(file) && !file.endsWith(".env.example")) findings.push(`${file}: environment file is tracked`);
    if (IMAGE_EXTENSIONS.test(file) && !IMAGE_ALLOWLIST.some((pattern) => pattern.test(file))) {
      findings.push(`${file}: image outside the allowlisted asset folders`);
    }
    if (BINARY.test(file)) continue;
    let text;
    try {
      text = readFileSync(join(root, file), "utf8");
    } catch {
      continue;
    }
    text.split("\n").forEach((line, index) => {
      if (ALLOWED_FAKES.some((pattern) => pattern.test(line))) return;
      for (const [label, pattern] of SECRET_PATTERNS) {
        if (pattern.test(line)) findings.push(`${file}:${index + 1}: possible ${label}`);
      }
      if (DESKTOP_SOURCE.test(file)) {
        for (const [label, pattern] of DESKTOP_FORBIDDEN) {
          if (pattern.test(line)) findings.push(`${file}:${index + 1}: ${label} in desktop code`);
        }
      }
    });
  }
  return findings;
}

function trackedFiles(root) {
  return execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.argv[2] ?? process.cwd();
  const files = trackedFiles(root);
  const findings = scanFiles(root, files);
  if (findings.length) {
    console.error("Repository scan failed:");
    for (const finding of findings) console.error(`- ${finding}`);
    process.exit(1);
  }
  console.log(`Repository scan passed (${files.length} tracked or new files, no credentials or private images).`);
}
