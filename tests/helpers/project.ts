import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectProject } from "../../src/detectors/index.js";
import { runRules } from "../../src/core/engine.js";
import { calculateScore } from "../../src/core/scorer.js";
import { loadLocalProject } from "../../src/input/local.js";
import type { Finding } from "../../src/types/result.js";

export type Files = Record<string, string | Buffer>;

export interface ProjectOptions {
  /** Turn the folder into a Git repository with one commit. */
  git?: boolean;
  /** Files of this size (in bytes) are created before the commit, without writing real data. */
  sparse?: Record<string, number>;
  /** Files written AFTER the commit: they exist on disk but Git does not track them. */
  untracked?: Files;
  /** Big files created AFTER the commit, so Git does not track them. */
  untrackedSparse?: Record<string, number>;
}

const created: string[] = [];

/** Call this from afterAll() in every test file that creates projects. */
export function cleanupProjects(): void {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
}

function git(cwd: string, ...args: string[]): void {
  execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args],
    { cwd, stdio: "ignore" },
  );
}

function writeSparse(root: string, files: Record<string, number>): void {
  for (const [path, bytes] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, "");
    truncateSync(target, bytes); // makes a big file instantly
  }
}

function writeFiles(root: string, files: Files): void {
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

/** Builds a throwaway project in the temp folder and returns its path. */
export function createProject(files: Files, options: ProjectOptions = {}): string {
  const root = mkdtempSync(join(tmpdir(), "dev-view-test-"));
  created.push(root);

  writeFiles(root, files);
  writeSparse(root, options.sparse ?? {});

  if (options.git) {
    git(root, "init", "-q", "-b", "main");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "test", "--allow-empty");
  }

  if (options.untracked) writeFiles(root, options.untracked);
  writeSparse(root, options.untrackedSparse ?? {});
  return root;
}

/** Path to a committed fixture folder in tests/fixtures. */
export function fixturePath(name: string): string {
  return fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
}

/** Runs the same steps the CLI runs: load, detect, check, score. */
export async function analyzeProject(root: string) {
  const ctx = await loadLocalProject(root);
  const detection = await detectProject(ctx);
  const findings = await runRules(ctx, detection);
  return { ctx, detection, findings, score: calculateScore(findings) };
}

export const MIB = 1024 * 1024;

/** All findings for one rule id. */
export function byRule(findings: Finding[], ruleId: string): Finding[] {
  return findings.filter((f) => f.ruleId === ruleId);
}

/** Just the severities for one rule id, handy for short assertions. */
export function severitiesOf(findings: Finding[], ruleId: string): string[] {
  return byRule(findings, ruleId).map((f) => f.severity);
}