import type { Finding, ProjectContext, Severity } from "../../types/result.js";

// Folder name -> how serious it is when Git tracks it.
const GENERATED_DIRS = new Map<string, Severity>([
  ["node_modules", "error"],
  [".venv", "error"],
  ["venv", "error"],
  ["__pycache__", "warning"],
  ["dist", "warning"],
  ["build", "warning"],
  ["target", "warning"],
  [".next", "warning"],
  ["coverage", "warning"],
]);

export function checkGeneratedArtifacts(ctx: ProjectContext): Finding[] {
  if (ctx.trackedFiles === null) return [];

  // Group tracked files by their generated folder, e.g. "node_modules" -> 1204 files.
  const groups = new Map<string, { count: number; severity: Severity }>();

  for (const path of ctx.trackedFiles) {
    const parts = path.split("/");
    // "length - 1" so a file that happens to be called "build" is not treated as a folder.
    const index = parts.findIndex((part, i) => i < parts.length - 1 && GENERATED_DIRS.has(part));
    if (index === -1) continue;

    const folder = parts.slice(0, index + 1).join("/");
    const group = groups.get(folder) ?? { count: 0, severity: GENERATED_DIRS.get(parts[index])! };
    group.count++;
    groups.set(folder, group);
  }

  if (groups.size === 0) {
    return [
      {
        ruleId: "artifacts.generated-tracked",
        category: "Artifacts",
        severity: "pass",
        title: "No generated folders are tracked by Git",
        message: "No tracked node_modules, dist, build or similar folders found",
      },
    ];
  }

  return [...groups].map(([folder, { count, severity }]): Finding => ({
    ruleId: "artifacts.generated-tracked",
    category: "Artifacts",
    severity,
    title: `${folder}/ is tracked by Git (${count} ${count === 1 ? "file" : "files"})`,
    message: `${count} tracked files live inside ${folder}/`,
    why: "These files can be recreated from your source code or lockfile. Committing them makes the repository heavy and creates noisy changes.",
    suggestion: `Run 'git rm -r --cached ${folder}' and add '${folder}/' to .gitignore. If you commit this folder on purpose, you can ignore this warning.`,
  }));
}

const MIB = 1024 * 1024;
const WARN_BYTES = 50 * MIB; // GitHub warns above this size
const BLOCK_BYTES = 100 * MIB; // GitHub refuses pushes above this size
const MAX_LISTED = 10;

export function checkLargeFiles(ctx: ProjectContext): Finding[] {
  if (ctx.trackedFiles === null) return [];

  const tracked = new Set(ctx.trackedFiles);
  const large = ctx.files
    .filter((f) => tracked.has(f.path) && f.size >= WARN_BYTES)
    .sort((a, b) => b.size - a.size);

  if (large.length === 0) {
    return [
      {
        ruleId: "artifacts.large-file",
        category: "Artifacts",
        severity: "pass",
        title: "No large files are tracked by Git",
        message: "No tracked file is over 50 MiB",
      },
    ];
  }

  const findings = large.slice(0, MAX_LISTED).map((file): Finding => {
    const blocked = file.size >= BLOCK_BYTES;
    return {
      ruleId: "artifacts.large-file",
      category: "Artifacts",
      severity: blocked ? "error" : "warning",
      title: `Large file: ${file.path} (${Math.round(file.size / MIB)} MiB)`,
      message: blocked
        ? "GitHub refuses files larger than 100 MiB"
        : "GitHub warns about files larger than 50 MiB",
      why: "Git keeps every version of a file forever, so big files make cloning slow and the repository heavy.",
      suggestion:
        "Use Git LFS or host the file elsewhere (for example a GitHub Release). If it is already committed, it must also be removed from history to shrink the repository.",
    };
  });

  if (large.length > MAX_LISTED) {
    findings.push({
      ruleId: "artifacts.large-file",
      category: "Artifacts",
      severity: "info",
      title: `...and ${large.length - MAX_LISTED} more large files`,
      message: "Only the largest files are listed",
    });
  }
  return findings;
}