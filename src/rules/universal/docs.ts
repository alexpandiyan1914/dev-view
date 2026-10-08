import type { Finding, ProjectContext } from "../../types/result.js";

/** Finds a file in the project root whose name matches (case-insensitive). */
function findRootFile(ctx: ProjectContext, pattern: RegExp): string | undefined {
  return ctx.files.find((f) => !f.path.includes("/") && pattern.test(f.path))?.path;
}

export function checkReadme(ctx: ProjectContext): Finding[] {
  const found = findRootFile(ctx, /^readme(\.(md|markdown|txt|rst))?$/i);

  if (found) {
    return [
      {
        ruleId: "docs.readme-exists",
        category: "Documentation",
        severity: "pass",
        title: `${found} found`,
        message: `${found} exists`,
      },
    ];
  }

  return [
    {
      ruleId: "docs.readme-exists",
      category: "Documentation",
      severity: "warning",
      title: "No README found",
      message: "The project root has no README file",
      why: "Without a README, other developers cannot tell what the project does or how to run it.",
      suggestion: "Create a README.md with a description, setup steps and usage.",
    },
  ];
}

export function checkLicense(ctx: ProjectContext): Finding[] {
  const found = findRootFile(ctx, /^(licen[cs]e|copying)(\.(md|txt))?$/i);

  if (found) {
    return [
      {
        ruleId: "docs.license-exists",
        category: "Documentation",
        severity: "pass",
        title: `${found} found`,
        message: `${found} exists`,
      },
    ];
  }

  return [
    {
      ruleId: "docs.license-exists",
      category: "Documentation",
      severity: "warning",
      title: "No LICENSE file found",
      message: "The project root has no license file",
      why: "Without a license, other people are not legally allowed to use, copy or contribute to your code, even if it is public.",
      suggestion: "Add a LICENSE file. MIT is a common, permissive choice (choosealicense.com can help you decide).",
    },
  ];
}