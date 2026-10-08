import type { Finding, ProjectContext } from "../../types/result.js";

export function checkGitRepository(ctx: ProjectContext): Finding[] {
  if (!ctx.hasGit) {
    return [
      {
        ruleId: "git.repository-exists",
        category: "Repository",
        severity: "warning",
        title: "Not a Git repository",
        message: "No .git folder was found in the project root",
        why: "Without Git there is no history, no backup of your work, and no way to collaborate safely.",
        suggestion: "Run 'git init' in the project folder, then make your first commit.",
      },
    ];
  }

  if (ctx.trackedFiles === null) {
    return [
      {
        ruleId: "git.tracked-files-unavailable",
        category: "Repository",
        severity: "info",
        title: "Git checks skipped",
        message: "Git is present but the list of tracked files could not be read",
        why: "Checks that need to know what Git tracks (secrets, generated files, large files) cannot run.",
        suggestion: "Make sure the 'git' command works in this folder, then run Dev View again.",
      },
    ];
  }

  return [
    {
      ruleId: "git.repository-exists",
      category: "Repository",
      severity: "pass",
      title: "Git repository found",
      message: ".git exists",
    },
  ];
}

export function checkGitignore(ctx: ProjectContext): Finding[] {
  const found = ctx.files.some((f) => f.path === ".gitignore");

  if (found) {
    return [
      {
        ruleId: "git.gitignore-exists",
        category: "Repository",
        severity: "pass",
        title: ".gitignore found",
        message: ".gitignore exists",
      },
    ];
  }

  return [
    {
      ruleId: "git.gitignore-exists",
      category: "Repository",
      severity: "warning",
      title: "No .gitignore found",
      message: "The project root has no .gitignore file",
      why: "Without .gitignore, 'git add .' picks up everything: secrets, dependencies and build output.",
      suggestion: "Create a .gitignore listing at least .env, node_modules/ and your build folders.",
    },
  ];
}