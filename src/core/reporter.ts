import pc from "picocolors";
import type { Detection, Finding, ProjectContext } from "../types/result.js";

const LINE = "─".repeat(44);

export function printBanner(): void {
  console.log(pc.bold(pc.cyan("\nDEV VIEW")));
  console.log(pc.dim("A clear view of your project.\n"));
}

export function printProgress(ctx: ProjectContext): void {
  console.log(`Analyzing: ${pc.bold(ctx.name)}\n`);
  console.log("Scanning project...");
  console.log(pc.green("✓ Project directory detected"));
  console.log(
    ctx.truncated
      ? pc.yellow(`⚠ Scanned ${ctx.files.length} files (project is large, scan stopped at the limit)`)
      : pc.green(`✓ Scanned ${ctx.files.length} ${ctx.files.length === 1 ? "file" : "files"}`),
  );
  if (!ctx.hasGit) {
    console.log(pc.yellow("⚠ Git repository not detected"));
  } else if (ctx.trackedFiles) {
    console.log(pc.green(`✓ Git repository detected (${ctx.trackedFiles.length} tracked files)`));
  } else {
    console.log(pc.yellow("⚠ Git repository detected, but tracked files could not be read"));
  }
  console.log();
}

export function printDetection(detection: Detection): void {
  console.log("Detecting technologies...");
  if (detection.ecosystems.length === 0) {
    console.log(pc.blue("ℹ No supported ecosystem detected"));
    console.log(pc.dim("  Running universal project and Git checks only."));
  }
  for (const eco of detection.ecosystems) {
    console.log(`${pc.green("✓")} ${eco.name} ${pc.dim(`(${eco.evidence.join(", ")})`)}`);
    for (const tech of eco.technologies) {
      console.log(`${pc.green("✓")} ${tech.name}`);
    }
  }
  console.log();
}

const ICONS = {
  pass: pc.green("✓"),
  info: pc.blue("ℹ"),
  warning: pc.yellow("⚠"),
  error: pc.red("✗"),
} as const;

export function printFindings(findings: Finding[]): void {
  console.log("Running checks...\n");
  const categories = [...new Set(findings.map((f) => f.category))];

  for (const category of categories) {
    console.log(pc.bold(category));
    console.log(pc.dim(LINE));
    for (const f of findings.filter((x) => x.category === category)) {
      console.log(`${ICONS[f.severity]} ${f.title}`);
    }
    console.log();
  }
}

export function printSummary(findings: Finding[], ms: number): void {
  const count = (s: Finding["severity"]) => findings.filter((f) => f.severity === s).length;
  console.log(pc.dim(LINE));
  console.log(`${pc.green(`✓ ${count("pass")} passed`)}  ${pc.yellow(`⚠ ${count("warning")} warnings`)}  ${pc.red(`✗ ${count("error")} errors`)}`);

  const toFix = findings.filter((f) => f.severity === "warning" || f.severity === "error");
  if (toFix.length > 0) {
    console.log(`\n${pc.bold("WHAT TO FIX")}`);
    console.log(pc.dim(LINE));
    toFix.forEach((f, i) => {
      console.log(`\n${i + 1}. ${f.title}`);
      if (f.why) console.log(`   ${pc.bold("Why:")} ${f.why}`);
      if (f.suggestion) console.log(`   ${pc.bold("Suggestion:")} ${f.suggestion}`);
    });
  }
  console.log(pc.dim(`\nDev View completed in ${(ms / 1000).toFixed(1)}s\n`));
}