#!/usr/bin/env node
import { Command, InvalidArgumentError, Option } from "commander";
import { performance } from "perf_hooks";
import { loadLocalProject } from "./input/local.js";
import { fetchRemoteProject, parseRepoUrl, RemoteError } from "./input/remote.js";
import { detectProject } from "./detectors/index.js";
import { runRules } from "./core/engine.js";
import { installInterruptHandler } from "./core/interrupt.js";
import { RULES } from "./rules/registry.js";
import { calculateScore } from "./core/scorer.js";
import { buildReport } from "./core/report.js";
import {
  deliverReport,
  displayPath,
  needsGitignoreHint,
  planExport,
  type ExportOptions,
  type ExportPlan,
} from "./export/output.js";
import {
  printBanner,
  printProgress,
  printDetection,
  printFindings,
  printRuleList,
  printSummary,
  printExportSaved,
  printRemoteStart,
  printFetched,
  printRemoteError,
} from "./core/reporter.js";
import type { ProjectContext } from "./types/result.js";
import { VERSION } from "./version.js";

// One handler for Ctrl+C: restores the cursor and cleans up any temporary files.
installInterruptHandler();

const program = new Command();

program
  .name("dev-view")
  .description("A clear view of your project.")
  .version(VERSION);

interface AnalyzeOptions extends ExportOptions {
  verbose?: boolean;
}

/** Turns "--max-issues 20" into 20, and rejects anything that is not a whole number of 1 or more. */
function parseMaxIssues(value: string): number {
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new InvalidArgumentError("It must be a whole number of 1 or more.");
  }
  return Number(value);
}

/** The export options are the same for `local` and `remote`, so they are defined once. */
function withExportOptions(command: Command): Command {
  return command
    .addOption(
      new Option("--export <format>", "also save the findings as a report for AI chatbots").choices(["md", "json"]),
    )
    .option("--out <file>", "where to save the report (default: dev-view-report.md or .json here)")
    .option("--stdout", "print the report instead of saving it (nothing else is printed)")
    .option("--max-issues <n>", "include at most n issues in the report", parseMaxIssues)
    .option("--force", "replace the report file if it already exists");
}

interface AnalyzeInput {
  ctx: ProjectContext;
  start: number;
  mode: "local" | "remote";
  /** Folder name (local) or repository address (remote). */
  target: string;
  options: AnalyzeOptions;
  plan: ExportPlan | null;
}

/** Everything after the project is obtained. Identical for local and remote: the "same engine". */
async function analyze({ ctx, start, mode, target, options, plan }: AnalyzeInput): Promise<void> {
  // With --stdout the report is the only thing printed, so it can be piped or copied cleanly.
  const quiet = plan?.target.kind === "stdout";

  if (!quiet) printProgress(ctx);
  const detection = await detectProject(ctx);
  if (!quiet) printDetection(detection);
  const findings = await runRules(ctx, detection);
  const score = calculateScore(findings);
  if (!quiet) {
    printFindings(findings, options.verbose);
    printSummary(findings, score, performance.now() - start);
  }

  if (!plan) return;

  const report = buildReport({
    mode,
    target,
    rootPath: ctx.rootPath,
    detection,
    findings,
    score,
    maxIssues: plan.maxIssues,
  });
  const savedPath = await deliverReport(plan, report);

  if (!quiet && savedPath) {
    const hint = await needsGitignoreHint(ctx.rootPath, ctx.hasGit, savedPath);
    printExportSaved(displayPath(savedPath), report.issues.length, hint);
  }
}

withExportOptions(
  program
    .command("local")
    .description("Analyze the project in the current (or given) directory")
    .argument("[path]", "path to the project", ".")
    .option("-v, --verbose", "show detailed analysis results"),
)
  .addHelpText(
    "after",
    `
Examples:
  $ dev-view local                  # Analyze current directory
  $ dev-view local ./my-project     # Analyze specific folder
  $ dev-view local -v               # Show all hidden findings
  $ dev-view local --export md      # Also save dev-view-report.md for an AI chatbot
  $ dev-view local --export json --out report.json
  $ dev-view local --export md --stdout | pbcopy    # Print only the report
    `,
  )
  .action(async (path: string, options: AnalyzeOptions) => {
    const start = performance.now();
    try {
      const plan = await planExport(options); // check the options first, before any work
      const ctx = await loadLocalProject(path);
      if (plan?.target.kind !== "stdout") await printBanner();
      await analyze({ ctx, start, mode: "local", target: ctx.name, options, plan });
    } catch (err) {
      console.error(`✗ ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });

withExportOptions(
  program
    .command("remote")
    .description("Analyze a public Git repository by its https:// URL")
    .argument("<url>", "repository URL, e.g. https://github.com/user/project")
    .option("-v, --verbose", "show detailed analysis results"),
)
  .addHelpText(
    "after",
    `
Examples:
  $ dev-view remote https://github.com/user/project
  $ dev-view remote https://github.com/user/project -v
  $ dev-view remote https://github.com/user/project --export md
    `,
  )
  .action(async (url: string, options: AnalyzeOptions) => {
    const start = performance.now();
    let cleanup: (() => Promise<void>) | undefined;
    try {
      const repo = parseRepoUrl(url); // validate first, before touching the network or disk
      const plan = await planExport(options); // so is the export, before the clone
      const quiet = plan?.target.kind === "stdout";

      if (!quiet) {
        await printBanner();
        printRemoteStart(repo.displayUrl);
      }

      const remote = await fetchRemoteProject(repo);
      cleanup = remote.cleanup;
      if (!quiet) printFetched();

      await analyze({ ctx: remote.ctx, start, mode: "remote", target: repo.displayUrl, options, plan });
    } catch (err) {
      if (err instanceof RemoteError) printRemoteError(err);
      else console.error(`✗ ${(err as Error).message}`);
      process.exitCode = 1;
    } finally {
      await cleanup?.(); // the temporary copy is always deleted
    }
  });

program
  .command("rules")
  .description("List every check Dev View can run")
  .action(async () => {
    await printBanner();
    printRuleList(RULES);
  });

await program.parseAsync();
