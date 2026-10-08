#!/usr/bin/env node
import { Command } from "commander";
import { loadLocalProject } from "./input/local.js";
import { detectProject } from "./detectors/index.js";
import { runRules } from "./rules/index.js";
import {
  printBanner,
  printProgress,
  printDetection,
  printFindings,
  printSummary,
} from "./core/reporter.js";

const program = new Command();

program
  .name("dev-view")
  .description("A clear view of your project.")
  .version("0.1.0");

program
  .command("local")
  .description("Analyze the project in the current (or given) directory")
  .argument("[path]", "path to the project", ".")
  .action(async (path: string) => {
    const start = Date.now();
    try {
      const ctx = await loadLocalProject(path);
      printBanner();
      printProgress(ctx);
      printDetection(await detectProject(ctx));
      const findings = await runRules(ctx);
      printFindings(findings);
      printSummary(findings, Date.now() - start);
    } catch (err) {
      console.error(`✗ ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });

program
  .command("remote")
  .description("Analyze a remote Git repository (coming soon)")
  .argument("<url>", "repository URL")
  .action((url: string) => {
    console.log(`Remote analysis of ${url} is not implemented yet.`);
  });

await program.parseAsync();