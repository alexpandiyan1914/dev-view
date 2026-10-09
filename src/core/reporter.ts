import pc from "picocolors";
import type { Detection, EcosystemId, Finding, ProjectContext } from "../types/result.js";
import type { Rule } from "./rule.js";
import { ERROR_PENALTY, WARNING_PENALTY, type Score } from "./scorer.js";
import { SEVERITY_RANK, needsGuidance } from "./severity.js";
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

/** Most serious first. Array.sort is stable, so equal severities keep their original order. */
function bySeverity(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}

export function printFindings(findings: Finding[]): void {
  console.log("Running checks...\n");
  const categories = [...new Set(findings.map((f) => f.category))];

  for (const category of categories) {
    console.log(pc.bold(category));
    console.log(pc.dim(LINE));
    for (const f of bySeverity(findings.filter((x) => x.category === category))) {
      console.log(`${ICONS[f.severity]} ${f.title}`);
    }
    console.log();
  }
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

function scoreColor(value: number): (text: string) => string {
  if (value >= 90) return pc.green;
  if (value >= 70) return pc.yellow;
  return pc.red;
}

function scoreBreakdown(score: Score): string {
  const parts = ["100"];
  if (score.errors > 0) {
    parts.push(`− ${score.errors * ERROR_PENALTY} (${plural(score.errors, "error")} × ${ERROR_PENALTY})`);
  }
  if (score.warnings > 0) {
    parts.push(`− ${score.warnings * WARNING_PENALTY} (${plural(score.warnings, "warning")} × ${WARNING_PENALTY})`);
  }
  return parts.join(" ");
}

function verdict(score: Score): string {
  if (score.errors > 0) return "Fix the errors first. They are the problems that can hurt you most.";
  if (score.warnings > 0) return "No errors. A few improvements will take you to 100.";
  return "Everything looks good. Nice work!";
}

export function printSummary(findings: Finding[], score: Score, ms: number): void {
  const passed = findings.filter((f) => f.severity === "pass").length;

  console.log(pc.dim(LINE));
  console.log(
    `${pc.green(`✓ ${passed} passed`)}  ${pc.yellow(`⚠ ${plural(score.warnings, "warning")}`)}  ${pc.red(`✗ ${plural(score.errors, "error")}`)}`,
  );

  const toFix = bySeverity(findings.filter((f) => needsGuidance(f.severity)));
  if (toFix.length > 0) {
    console.log(`\n${pc.bold("WHAT TO FIX")} ${pc.dim("(most serious first)")}`);
    console.log(pc.dim(LINE));
    toFix.forEach((f, i) => {
      console.log(`\n${i + 1}. ${ICONS[f.severity]} ${f.title}`);
      if (f.why) console.log(`   ${pc.bold("Why:")} ${f.why}`);
      if (f.suggestion) console.log(`   ${pc.bold("Suggestion:")} ${f.suggestion}`);
    });
  }

  console.log(`\n${pc.dim(LINE)}`);
  console.log(`${pc.bold("Score:")} ${scoreColor(score.value)(`${score.value}/100`)}`);
  if (score.deducted > 0) console.log(pc.dim(`  ${scoreBreakdown(score)}`));
  console.log(verdict(score));
  console.log(pc.dim(`\nDev View completed in ${(ms / 1000).toFixed(1)}s\n`));
}

const ECOSYSTEM_LABELS: Record<EcosystemId, string> = { node: "Node.js", python: "Python" };

export function printRuleList(rules: Rule[]): void {
  const groups = new Map<string, Rule[]>();
  for (const rule of rules) {
    const label = rule.ecosystem ? ECOSYSTEM_LABELS[rule.ecosystem] : "Universal";
    groups.set(label, [...(groups.get(label) ?? []), rule]);
  }

  for (const [label, list] of groups) {
    console.log(pc.bold(label));
    console.log(pc.dim(LINE));
    for (const rule of list) {
      console.log(`  ${pc.cyan(rule.id.padEnd(24))} ${rule.description}`);
    }
    console.log();
  }
  console.log(pc.dim(`${rules.length} rules\n`));
}