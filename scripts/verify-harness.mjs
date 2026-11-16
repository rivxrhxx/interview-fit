import { readFile, readdir, access } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const required = [
  "CLAUDE.md",
  ".kiroignore",
  ".kiro/steering/product.md",
  ".kiro/steering/tech.md",
  ".kiro/steering/structure.md",
  ".kiro/steering/security-privacy.md",
  ".kiro/steering/react-ui.md",
  ".kiro/steering/tauri-rust.md",
  ".kiro/steering/testing.md",
  ".kiro/specs/interview-fit-mvp/requirements.md",
  ".kiro/specs/interview-fit-mvp/design.md",
  ".kiro/specs/interview-fit-mvp/tasks.md",
  ".kiro/prompts/implement-task.md",
  ".kiro/prompts/privacy-review.md",
  ".kiro/hooks/typescript-quality.json",
  ".kiro/hooks/privacy-review.json",
  ".kiro/reports/kiro-usage-log.md",
];

const errors = [];
for (const file of required) {
  try {
    await access(join(root, file));
  } catch {
    errors.push(`missing: ${file}`);
  }
}

// Kiro hook files: `.kiro/hooks/*.json`, schema "v1" (kiro.dev/docs/hooks, IDE 1.0+ / CLI 3.0+).
// The pre-1.0 `.kiro.hook` format (`when`/`then`, `askAgent`, `fileEdited`) no longer runs.
const HOOK_TRIGGERS = new Set([
  "UserPromptSubmit",
  "Stop",
  "SessionStart",
  "SessionEnd",
  "PreCompact",
  "PostCompact",
  "PreToolUse",
  "PostToolUse",
  "PostFileCreate",
  "PostFileSave",
  "PostFileDelete",
  "PreTaskExec",
  "PostTaskExec",
  "Manual",
]);
const HOOK_FIELDS = new Set(["name", "description", "trigger", "matcher", "action", "timeout", "enabled", "confirm"]);

/** Paths each committed hook must (and must not) fire for; matchers are regexes against the file path. */
const HOOK_MATCHER_CASES = {
  "TypeScript quality gate": {
    matches: ["src/app/App.tsx", "src/lib/api/client.ts", "services/proxy/src/server.ts", "/work/interview-fit/packages/contracts/src/policy.ts"],
    ignores: ["README.md", "src/app/App.css", "src-tauri/src/lib.rs", "scripts/scan-repo.mjs"],
  },
  "Privacy boundary review": {
    matches: [
      "src-tauri/src/image_prep.rs",
      "src-tauri/capabilities/default.json",
      "services/proxy/src/server.ts",
      "src/features/consent/ConsentGate.tsx",
      "src/features/capture/CameraCapture.tsx",
      "src/features/analysis/AnalysisProgress.tsx",
      "src/features/report/buildReport.ts",
      "src/lib/api/client.ts",
      "/work/interview-fit/packages/contracts/src/consent.ts",
    ],
    ignores: ["src/app/App.css", "src/app/StepProgress.tsx", "src/features/recommendation/RecommendationList.tsx", "README.md", ".kiro/steering/product.md"],
  },
};

const hookDir = join(root, ".kiro/hooks");
const hookFiles = await readdir(hookDir).catch(() => []);
for (const legacy of hookFiles.filter((file) => file.endsWith(".kiro.hook"))) {
  errors.push(`legacy hook format, migrate to .kiro/hooks/*.json (v1): .kiro/hooks/${legacy}`);
}
const hookNames = new Set();
for (const file of hookFiles.filter((file) => file.endsWith(".json"))) {
  const label = `.kiro/hooks/${file}`;
  let config;
  try {
    config = JSON.parse(await readFile(join(hookDir, file), "utf8"));
  } catch (error) {
    errors.push(`invalid hook JSON: ${label} (${error.message})`);
    continue;
  }
  if (config?.version !== "v1") errors.push(`${label}: "version" must be "v1"`);
  if (!Array.isArray(config?.hooks) || config.hooks.length === 0) {
    errors.push(`${label}: "hooks" must be a non-empty array`);
    continue;
  }
  for (const [index, hook] of config.hooks.entries()) {
    const at = `${label} hooks[${index}]`;
    for (const key of Object.keys(hook ?? {})) if (!HOOK_FIELDS.has(key)) errors.push(`${at}: unknown field "${key}"`);
    if (typeof hook?.name !== "string" || !hook.name) errors.push(`${at}: "name" is required`);
    else if (hookNames.has(hook.name)) errors.push(`${at}: duplicate hook name "${hook.name}"`);
    else hookNames.add(hook.name);
    if (!HOOK_TRIGGERS.has(hook?.trigger)) errors.push(`${at}: unknown trigger "${hook?.trigger}" (PascalCase, e.g. PostFileSave)`);
    if (hook?.enabled !== undefined && typeof hook.enabled !== "boolean") errors.push(`${at}: "enabled" must be a boolean`);
    const action = hook?.action;
    if (action?.type === "agent") {
      if (typeof action.prompt !== "string" || !action.prompt.trim()) errors.push(`${at}: agent action needs a "prompt"`);
    } else if (action?.type === "command") {
      if (typeof action.command !== "string" || !action.command.trim()) errors.push(`${at}: command action needs a "command"`);
    } else {
      errors.push(`${at}: action.type must be "agent" or "command"`);
    }
    if (hook?.matcher !== undefined) {
      let matcher;
      try {
        matcher = new RegExp(hook.matcher);
      } catch (error) {
        errors.push(`${at}: matcher is not a valid regex (${error.message})`);
        continue;
      }
      const cases = HOOK_MATCHER_CASES[hook.name];
      for (const path of cases?.matches ?? []) if (!matcher.test(path)) errors.push(`${at}: matcher should fire for ${path}`);
      for (const path of cases?.ignores ?? []) if (matcher.test(path)) errors.push(`${at}: matcher should not fire for ${path}`);
    }
  }
}
for (const name of Object.keys(HOOK_MATCHER_CASES)) {
  if (!hookNames.has(name)) errors.push(`missing hook: "${name}"`);
}

const forbiddenPatterns = [
  /Authorization:\s*Bearer\s+[A-Za-z0-9._-]{12,}/gi,
  /YOUCAM_(API_)?KEY\s*=\s*[^\s#]+/gi,
  /PERFECTCORP_(API_)?KEY\s*=\s*[^\s#]+/gi,
  /ANTHROPIC_(API_)?KEY\s*=\s*[^\s#]+/gi,
];
const scanTargets = [
  "README.md",
  "CLAUDE.md",
  ".env.example",
  ".kiro/specs/interview-fit-mvp/requirements.md",
  ".kiro/specs/interview-fit-mvp/design.md",
  ".kiro/specs/interview-fit-mvp/tasks.md",
];
for (const file of scanTargets) {
  const text = await readFile(join(root, file), "utf8");
  for (const pattern of forbiddenPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) errors.push(`possible committed secret in ${file}`);
  }
}

if (errors.length) {
  console.error("Harness verification failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Harness verification passed (${required.length} required files).`);
