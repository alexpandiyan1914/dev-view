import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Finding, ProjectContext } from "../../types/result.js";

export function checkReadme(ctx: ProjectContext): Finding {
  const found = existsSync(join(ctx.rootPath, "README.md"));

  if (found) {
    return {
      ruleId: "docs.readme-exists",
      category: "Documentation",
      severity: "pass",
      title: "README.md found",
      message: "README.md exists",
    };
  }

  return {
    ruleId: "docs.readme-exists",
    category: "Documentation",
    severity: "warning",
    title: "No README.md found",
    message: "README.md is missing",
    why: "Without a README, other developers cannot tell what the project does or how to run it.",
    suggestion: "Create a README.md with a description, setup steps and usage.",
  };
}