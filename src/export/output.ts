import { stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline/promises";
import type { Report } from "../types/report.js";
import { getIgnoredFiles } from "../input/git.js";
import { renderJson } from "./json.js";
import { renderMarkdown } from "./markdown.js";

export type ExportFormat = "md" | "json";

/** The export-related command line options, exactly as Commander hands them over. */
export interface ExportOptions {
  export?: ExportFormat;
  out?: string;
  stdout?: boolean;
  maxIssues?: number;
  force?: boolean;
}

/** A problem with the export options, written so the user knows what to change. */
export class ExportError extends Error {}

export type ExportTarget =
  | { kind: "stdout" }
  | { kind: "file"; path: string; /** true once the user allowed replacing an existing file */ overwrite: boolean };

export interface ExportPlan {
  format: ExportFormat;
  maxIssues?: number;
  target: ExportTarget;
}

export interface PlanDependencies {
  cwd?: string;
  /** Can we ask the user a question? Defaults to "both input and output are a terminal". */
  interactive?: boolean;
  /** Asks "replace this file?". Defaults to a real prompt in the terminal. */
  confirm?: (displayPath: string) => Promise<boolean>;
}

const DEFAULT_NAMES: Record<ExportFormat, string> = {
  md: "dev-view-report.md",
  json: "dev-view-report.json",
};

/** The path as the user would want to read it: short when it is under the current folder. */
export function displayPath(path: string, cwd: string = process.cwd()): string {
  const shortPath = relative(cwd, path);
  return shortPath === "" || shortPath.startsWith("..") || isAbsolute(shortPath) ? path : shortPath;
}

async function askToOverwrite(shown: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`  ${shown} already exists. Replace it? (y/N) `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

/**
 * Checks the export options and decides exactly what will be written and where.
 *
 * This runs BEFORE anything is scanned or downloaded, so a mistake in the options fails in
 * milliseconds instead of after a two-minute clone. Returns null when no export was asked for.
 */
export async function planExport(
  options: ExportOptions,
  deps: PlanDependencies = {},
): Promise<ExportPlan | null> {
  const cwd = deps.cwd ?? process.cwd();

  if (options.export === undefined) {
    const stray = (
      [
        ["--out", options.out !== undefined],
        ["--stdout", options.stdout === true],
        ["--max-issues", options.maxIssues !== undefined],
        ["--force", options.force === true],
      ] as const
    )
      .filter(([, used]) => used)
      .map(([flag]) => flag);

    if (stray.length > 0) {
      throw new ExportError(`${stray.join(" and ")} only works together with --export md or --export json.`);
    }
    return null;
  }

  const plan: ExportPlan = {
    format: options.export,
    maxIssues: options.maxIssues,
    target: { kind: "stdout" },
  };

  if (options.stdout) {
    if (options.out !== undefined) throw new ExportError("Use either --stdout or --out, not both.");
    if (options.force) throw new ExportError("--force only applies when the report is saved to a file.");
    return plan;
  }

  const path = resolve(cwd, options.out ?? DEFAULT_NAMES[options.export]);
  const shown = displayPath(path, cwd);

  const parent = await stat(dirname(path)).catch(() => null);
  if (!parent?.isDirectory()) {
    throw new ExportError(`The folder for the report does not exist: ${displayPath(dirname(path), cwd)}`);
  }

  const existing = await stat(path).catch(() => null);
  if (existing?.isDirectory()) {
    throw new ExportError(`${shown} is a folder. Give --out a file name, for example ${DEFAULT_NAMES[options.export]}.`);
  }

  let overwrite = false;
  if (existing) {
    if (options.force) {
      overwrite = true;
    } else {
      const interactive = deps.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
      const confirmed = interactive ? await (deps.confirm ?? askToOverwrite)(shown) : false;

      if (!confirmed) {
        throw new ExportError(
          interactive
            ? `Nothing was written. ${shown} was left as it is.`
            : `${shown} already exists. Use --force to replace it, or --out to choose another file.`,
        );
      }
      overwrite = true;
    }
  }

  plan.target = { kind: "file", path, overwrite };
  return plan;
}

export function renderReport(report: Report, format: ExportFormat): string {
  return format === "json" ? renderJson(report) : renderMarkdown(report);
}

/**
 * Writes or prints the report. Returns the file path that was written, or null for --stdout.
 * This is the only place in Dev View that ever writes a file.
 */
export async function deliverReport(plan: ExportPlan, report: Report): Promise<string | null> {
  const content = renderReport(report, plan.format);

  if (plan.target.kind === "stdout") {
    process.stdout.write(content);
    return null;
  }

  const { path, overwrite } = plan.target;
  try {
    // "wx" refuses to touch a file that appeared since we checked. "w" is used only when the
    // user allowed replacing it (--force or a "yes" at the prompt).
    await writeFile(path, content, { encoding: "utf8", flag: overwrite ? "w" : "wx" });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      throw new ExportError(`${displayPath(path)} already exists. Use --force to replace it.`);
    }
    throw new ExportError(`Could not save the report to ${displayPath(path)}${code ? ` (${code})` : ""}.`);
  }
  return path;
}

/**
 * True when the report landed inside the analyzed Git project and .gitignore does not cover it,
 * which is the one case where we should remind the user not to commit it.
 */
export async function needsGitignoreHint(
  projectRoot: string,
  hasGit: boolean,
  savedPath: string,
): Promise<boolean> {
  if (!hasGit) return false;

  const inside = relative(projectRoot, savedPath);
  if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) return false;

  const gitPath = inside.split(sep).join("/");
  const ignored = await getIgnoredFiles(projectRoot, [gitPath]);
  return ignored !== null && !ignored.has(gitPath);
}

