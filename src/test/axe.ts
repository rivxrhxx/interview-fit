import axe from "axe-core";

/**
 * Runs axe-core against the rendered document. Color contrast cannot be
 * computed in jsdom; the palette is checked separately (WCAG AA, ≥ 4.5:1).
 */
export async function axeViolations(context: Element = document.body): Promise<string[]> {
  const results = await axe.run(context, {
    rules: { "color-contrast": { enabled: false } },
    resultTypes: ["violations"],
  });
  return results.violations.map(
    (violation) => `${violation.id} (${violation.impact}): ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
  );
}
