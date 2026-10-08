import type { EcosystemId, Detection, Finding, ProjectContext } from "../types/result.js";
import { checkReadme, checkLicense } from "./universal/docs.js";
import { checkGitRepository, checkGitignore } from "./universal/repository.js";
import { checkEnvFiles, checkPrivateKeys } from "./universal/security.js";
import { checkGeneratedArtifacts, checkLargeFiles } from "./universal/artifacts.js";
import { checkNodePackageJson, checkNodeLockfile, checkNodeTests } from "./node/package.js";
import { checkPythonRequirements, checkPythonVersion, checkPythonTests } from "./python/project.js";

/** A rule looks at the project and returns zero or more findings. */
export type Rule = (ctx: ProjectContext) => Finding[] | Promise<Finding[]>;

interface RegisteredRule {
  name: string;
  /** If set, the rule only runs when this ecosystem was detected. */
  ecosystem?: EcosystemId;
  run: Rule;
}

// The order here is the order categories appear in the report.
const RULES: RegisteredRule[] = [
  { name: "docs.readme", run: checkReadme },
  { name: "docs.license", run: checkLicense },
  { name: "git.repository", run: checkGitRepository },
  { name: "git.gitignore", run: checkGitignore },
  { name: "security.env-files", run: checkEnvFiles },
  { name: "security.private-keys", run: checkPrivateKeys },
  { name: "artifacts.generated", run: checkGeneratedArtifacts },
  { name: "artifacts.large-files", run: checkLargeFiles },
  { name: "node.package-json", ecosystem: "node", run: checkNodePackageJson },
  { name: "node.lockfile", ecosystem: "node", run: checkNodeLockfile },
  { name: "node.tests", ecosystem: "node", run: checkNodeTests },
  { name: "python.requirements", ecosystem: "python", run: checkPythonRequirements },
  { name: "python.version", ecosystem: "python", run: checkPythonVersion },
  { name: "python.tests", ecosystem: "python", run: checkPythonTests },
];

export async function runRules(ctx: ProjectContext, detection: Detection): Promise<Finding[]> {
  const detected = new Set(detection.ecosystems.map((e) => e.id));
  const active = RULES.filter((rule) => !rule.ecosystem || detected.has(rule.ecosystem));

  const results = await Promise.all(
    active.map(async (rule): Promise<Finding[]> => {
      try {
        return await rule.run(ctx);
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