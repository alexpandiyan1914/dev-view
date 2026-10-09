import type { Rule } from "../core/rule.js";
import { checkReadme, checkLicense } from "./universal/docs.js";
import { checkGitRepository, checkGitignore } from "./universal/repository.js";
import { checkEnvFiles, checkPrivateKeys } from "./universal/security.js";
import { checkGeneratedArtifacts, checkLargeFiles } from "./universal/artifacts.js";
import { checkNodePackageJson, checkNodeLockfile, checkNodeTests } from "./node/package.js";
import { checkPythonRequirements, checkPythonVersion, checkPythonTests } from "./python/project.js";

// The order here is the order categories appear in the report.
export const RULES: Rule[] = [
  { id: "docs.readme", description: "A README exists in the project root", run: checkReadme },
  { id: "docs.license", description: "A LICENSE file exists", run: checkLicense },
  { id: "git.repository", description: "The project is a Git repository", run: checkGitRepository },
  { id: "git.gitignore", description: "A .gitignore file exists", run: checkGitignore },
  {
    id: "security.env-files",
    description: "No .env files are tracked, and untracked ones are ignored",
    run: checkEnvFiles,
  },
  { id: "security.private-keys", description: "No private key files are tracked", run: checkPrivateKeys },
  {
    id: "artifacts.generated",
    description: "node_modules, dist, build and similar folders are not tracked",
    run: checkGeneratedArtifacts,
  },
  { id: "artifacts.large-files", description: "No tracked file is over 50 MiB", run: checkLargeFiles },

  {
    id: "node.package-json",
    ecosystem: "node",
    description: "package.json is valid and has the fields npm expects",
    run: checkNodePackageJson,
  },
  {
    id: "node.lockfile",
    ecosystem: "node",
    description: "Exactly one lockfile exists and Git tracks it",
    run: checkNodeLockfile,
  },
  { id: "node.tests", ecosystem: "node", description: "The project has test files", run: checkNodeTests },

  {
    id: "python.requirements",
    ecosystem: "python",
    description: "requirements.txt is not empty and pins versions",
    run: checkPythonRequirements,
  },
  {
    id: "python.version",
    ecosystem: "python",
    description: "The project declares which Python version it needs",
    run: checkPythonVersion,
  },
  { id: "python.tests", ecosystem: "python", description: "The project has test files", run: checkPythonTests },
];

// Two rules with the same id would be confusing. Fail loudly the moment this file loads.
const ids = RULES.map((rule) => rule.id);
if (new Set(ids).size !== ids.length) {
  throw new Error("Duplicate rule id in the registry");
}