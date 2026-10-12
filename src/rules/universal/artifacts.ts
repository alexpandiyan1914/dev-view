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

const KIB = 1024;
const MIB = 1024 * KIB;
const MAX_LISTED = 10;

export interface LargeFileLimits {
  warnBytes: number;
  blockBytes: number;
}

export const DEFAULT_LARGE_FILE_LIMITS: LargeFileLimits = {
  warnBytes: 50 * MIB,
  blockBytes: 100 * MIB,
};

function formatSize(bytes: number): string {
  return bytes >= MIB ? `${Math.round(bytes / MIB)} MiB` : `${Math.round(bytes / KIB)} KiB`;
}


export function createLargeFileCheck(limits: LargeFileLimits = DEFAULT_LARGE_FILE_LIMITS) {
  return function checkLargeFiles(ctx: ProjectContext): Finding[] {
    if (ctx.trackedFiles === null) return [];

    const tracked = new Set(ctx.trackedFiles);
    const large = ctx.files
      .filter((f) => tracked.has(f.path) && f.size >= limits.warnBytes)
      .sort((a, b) => b.size - a.size);

    if (large.length === 0) {
      return [
        {
          ruleId: "artifacts.large-file",
          category: "Artifacts",
          severity: "pass",
          title: "No large files are tracked by Git",
          message: `No tracked file is over ${formatSize(limits.warnBytes)}`,
        },
      ];
    }

    const findings = large.slice(0, MAX_LISTED).map((file): Finding => {
      const blocked = file.size >= limits.blockBytes;
      return {
        ruleId: "artifacts.large-file",
        category: "Artifacts",
        severity: blocked ? "error" : "warning",
        title: `Large file: ${file.path} (${formatSize(file.size)})`,
        message: blocked
          ? `GitHub refuses files larger than ${formatSize(limits.blockBytes)}`
          : `GitHub warns about files larger than ${formatSize(limits.warnBytes)}`,
        why: "Git keeps every version of a file forever, so big files make cloning slow and the repository heavy.",
        suggestion:
          "Use Git LFS or host the file elsewhere (for example a GitHub Release). If it is already committed, it must also be removed from history to shrink the repository.",
      };
    });

    if (large.length > MAX_LISTED) {
      const more = large.length - MAX_LISTED;
      findings.push({
        ruleId: "artifacts.large-file",
        category: "Artifacts",
        severity: "info",
        title: `...and ${more} more large ${more === 1 ? "file" : "files"}`,
        message: "Only the largest files are listed",
      });
    }
    return findings;
  };
}

export const checkLargeFiles = createLargeFileCheck();