import type { Detection, Finding, ProjectContext } from "../types/result.js";
import { RULES } from "../rules/registry.js";
import { validateFinding, type Rule } from "./rule.js";

function internalFinding(title: string, message: string): Finding {
  return {
    ruleId: "internal.engine",
    category: "Internal",
    severity: "info",
    title,
    message,
  };
}

/** Keeps universal rules, plus rules for ecosystems that were actually detected. */
export function selectRules(detection: Detection, rules: Rule[] = RULES): Rule[] {
  const detected = new Set(detection.ecosystems.map((e) => e.id));
  return rules.filter((rule) => !rule.ecosystem || detected.has(rule.ecosystem));
}

async function executeRule(rule: Rule, ctx: ProjectContext): Promise<Finding[]> {
  let findings: Finding[];
  try {
    findings = await rule.run(ctx);
  } catch {
    // One broken rule must never take the whole report down.
    return [
      internalFinding(
        `A check could not run (${rule.id})`,
        "This is a bug in Dev View, not in your project",
      ),
    ];
  }

  // Keep every real finding, but flag any that are incomplete. Tests will catch these before users do.
  const notes: Finding[] = [];
  for (const finding of findings) {
    const problems = validateFinding(finding);
    if (problems.length > 0) {
      notes.push(
        internalFinding(`A check gave an incomplete result (${rule.id})`, problems.join("; ")),
      );
    }
  }
  return [...findings, ...notes];
}

export async function runRules(
  ctx: ProjectContext,
  detection: Detection,
  rules: Rule[] = RULES,
): Promise<Finding[]> {
  const selected = selectRules(detection, rules);
  const results = await Promise.all(selected.map((rule) => executeRule(rule, ctx)));
  return results.flat();
}