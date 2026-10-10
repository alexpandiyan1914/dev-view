#!/usr/bin/env node
import { Command } from "commander";
import { performance } from "perf_hooks";
import { loadLocalProject } from "./input/local.js";
import { fetchRemoteProject, parseRepoUrl, RemoteError } from "./input/remote.js";
import { detectProject } from "./detectors/index.js";
import { runRules } from "./core/engine.js";
import { installInterruptHandler } from "./core/interrupt.js";
import { RULES } from "./rules/registry.js";
import { calculateScore } from "./core/scorer.js";
import {
  printBanner,
  printProgress,
  printDetection,
  printFindings,
  printRuleList,
  printSummary,
  printRemoteStart,
  printFetched,
  printRemoteError,
} from "./core/reporter.js";
import type { ProjectContext } from "./types/result.js";

// One handler for Ctrl+C: restores the cursor and cleans up any temporary files.
installInterruptHandler();

const program = new Command();

program
  .name("dev-view")
  .description("A clear view of your project.")
  .version("0.1.0");

/** Everything after the project is obtained. Identical for local and remote: the "same engine". */
async function analyze(ctx: ProjectContext, start: number, verbose?: boolean): Promise<void> {
  printProgress(ctx);
  const detection = await detectProject(ctx);
  printDetection(detection);
  const findings = await runRules(ctx, detection);
  printFindings(findings, verbose);
  printSummary(findings, calculateScore(findings), performance.now() - start);
}

program
  .command("local")
  .description("Analyze the project in the current (or given) directory")
  .argument("[path]", "path to the project", ".")
  .option("-v, --verbose", "show detailed analysis results")
  .addHelpText(
    "after",
    `
Examples:
  $ dev-view local                  # Analyze current directory
  $ dev-view local ./my-project     # Analyze specific folder
  $ dev-view local -v               # Show all hidden findings
    `,
  )
  .action(async (path: string, options: { verbose?: boolean }) => {
    const start = performance.now();
    try {
      const ctx = await loadLocalProject(path);
      await printBanner();
      await analyze(ctx, start, options.verbose);
    } catch (err) {
      console.error(`✗ ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });

program
  .command("remote")
  .description("Analyze a public Git repository by its https:// URL")
  .argument("<url>", "repository URL, e.g. https://github.com/user/project")
  .option("-v, --verbose", "show detailed analysis results")
  .addHelpText(
    "after",
    `
Examples:
  $ dev-view remote https://github.com/user/project
  $ dev-view remote https://github.com/user/project -v
    `,
  )
  .action(async (url: string, options: { verbose?: boolean }) => {
    const start = performance.now();
    let cleanup: (() => Promise<void>) | undefined;
    try {
      const repo = parseRepoUrl(url); // validate first, before touching the network or disk
      await printBanner();
      printRemoteStart(repo.displayUrl);

      const remote = await fetchRemoteProject(repo);
      cleanup = remote.cleanup;
      printFetched();

      await analyze(remote.ctx, start, options.verbose);
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