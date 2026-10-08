import type { Finding, ProjectContext } from "../types/result.js";
import { checkReadme, checkLicense } from "./universal/docs.js";
import { checkGitRepository, checkGitignore } from "./universal/repository.js";
import { checkEnvFiles, checkPrivateKeys } from "./universal/security.js";
import { checkGeneratedArtifacts, checkLargeFiles } from "./universal/artifacts.js";

/** A rule looks at the project and returns zero or more findings. */
export type Rule = (ctx: ProjectContext) => Finding[] | Promise<Finding[]>;

// The order here is the order categories appear in the report.
const RULES: Rule[] = [
  checkReadme,
  checkLicense,
  checkGitRepository,
  checkGitignore,
  checkEnvFiles,
  checkPrivateKeys,
  checkGeneratedArtifacts,
  checkLargeFiles,
];

export async function runRules(ctx: ProjectContext): Promise<Finding[]> {
  const results = await Promise.all(
    RULES.map(async (rule): Promise<Finding[]> => {
      try {
        return await rule(ctx);
      } catch {
        // One broken rule must never take the whole report down.
        return [
          {
            ruleId: "internal.rule-failed",
            category: "Internal",
            severity: "info",
            title: `A check could not run (${rule.name})`,
            message: "This is a bug in Dev View, not in your project",
          },
        ];
      }
    }),
  );
  return results.flat();
}