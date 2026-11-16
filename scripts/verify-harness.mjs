import { readFile, access } from "node:fs/promises";
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
  ".kiro/hooks/typescript-quality.kiro.hook",
  ".kiro/hooks/privacy-review.kiro.hook",
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

for (const file of required.filter((file) => file.endsWith(".kiro.hook"))) {
  try {
    JSON.parse(await readFile(join(root, file), "utf8"));
  } catch (error) {
    errors.push(`invalid hook JSON: ${file} (${error.message})`);
  }
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
