import type { EcosystemId, Finding, ProjectContext } from "../types/result.js";
import { needsGuidance } from "./severity.js";

export interface Rule {
  id: string;
  description: string;
  ecosystem?: EcosystemId;
  run: (ctx: ProjectContext) => Finding[] | Promise<Finding[]>;
}

export function validateFinding(finding: Finding): string[] {
  const problems: string[] = [];

  for (const key of ["ruleId", "category", "title", "message"] as const) {
    if (finding[key].trim() === "") problems.push(`${key} is empty`);
  }

  if (needsGuidance(finding.severity)) {
    if (!finding.why?.trim()) problems.push("missing why");
    if (!finding.suggestion?.trim()) problems.push("missing suggestion");
  }
  return problems;
}