import pc from "picocolors";
import type {
  Detection,
  EcosystemId,
  Finding,
  ProjectContext,
} from "../types/result.js";
import type { Rule } from "./rule.js";
import { ERROR_PENALTY, WARNING_PENALTY, type Score } from "./scorer.js";
import { SEVERITY_RANK, needsGuidance } from "./severity.js";
import type { RemoteError } from "../input/remote.js";

const WIDTH = 56;
const LINE = "─".repeat(WIDTH);
const BAR_WIDTH = 24;
const INDENT = "  ";

const plural = (n: number, word: string): string =>
  `${n} ${word}${n === 1 ? "" : "s"}`;

const ICONS = {
  pass: pc.green("✔"),
  info: pc.blue("ℹ"),
  warning: pc.yellow("⚠"),
  error: pc.red("✖"),
  bullet: pc.dim("▪"),
  arrow: pc.cyan("➜"),
} as const;

const canAnimate =
  Boolean(process.stdout.isTTY) &&
  !process.env.CI &&
  !process.env.NO_COLOR &&
  process.env.TERM !== "dumb";

function heading(title: string): void {
  console.log(`\n${INDENT}${pc.bold(pc.cyan(title.toUpperCase()))}`);
  console.log(`${INDENT}${pc.dim(LINE)}`);
}

function scoreColor(value: number): (text: string) => string {
  if (value >= 90) return pc.green;
  if (value >= 70) return pc.yellow;
  return pc.red;
}

function scoreBar(value: number): string {
  const safeValue = Math.max(0, Math.min(100, value));
  const filled = Math.round((safeValue / 100) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;

  return (
    pc.dim("[") +
    scoreColor(safeValue)("█".repeat(filled)) +
    pc.dim("░".repeat(empty)) +
    pc.dim("]")
  );
}


export async function printBanner(): Promise<void> {
  if (canAnimate) {
    const frames = [pc.cyan("◐"), pc.cyan("◓"), pc.cyan("◑"), pc.cyan("◒")];

    for (const frame of frames) {
      process.stdout.write(
        `\r${INDENT}${frame} ${pc.bold("DEV VIEW")} ${pc.dim("Preparing your project report...")}`,
      );

      await new Promise<void>((resolve) => setTimeout(resolve, 65));
    }

    process.stdout.write("\r\x1B[2K");
  }

  console.log();
  console.log(
    `${INDENT}${pc.bgCyan(pc.black(pc.bold(" DEV VIEW ")))} ${pc.dim("v0.1.0")}`,
  );
  console.log(`${INDENT}${pc.dim("A clear view of your project.")}`);
  console.log(`${INDENT}${pc.dim(LINE)}`);
}

/**
 * Project scan overview.
 */
export function printProgress(ctx: ProjectContext): void {
  heading("Project overview");

  console.log(`${INDENT}${pc.dim("Project")}      ${pc.bold(ctx.name)}`);
  console.log(
    `${INDENT}${ICONS.pass} ${plural(ctx.files.length, "file")} scanned` +
    (ctx.truncated ? pc.yellow(" (scan limit reached)") : ""),
  );

  if (!ctx.hasGit) {
    console.log(`${INDENT}${ICONS.warning} Git repository not detected`);
  } else if (ctx.trackedFiles) {
    console.log(
      `${INDENT}${ICONS.pass} Git repository` +
      pc.dim(` · ${plural(ctx.trackedFiles.length, "tracked file")}`),
    );
  } else {
    console.log(
      `${INDENT}${ICONS.warning} Git detected, but tracked files could not be read`,
    );
  }
}

/**
 * Technology detection results.
 */
export function printDetection(detection: Detection): void {
  heading("Detected technologies");

  if (detection.ecosystems.length === 0) {
    console.log(`${INDENT}${ICONS.info} No supported ecosystem detected`);
    console.log(`${INDENT}  ${pc.dim("Universal and Git checks will still run.")}`);
    return;
  }

  for (const eco of detection.ecosystems) {
    console.log(
      `${INDENT}${pc.bold(eco.name)} ${pc.dim(`(${eco.evidence.join(", ")})`)}`,
    );

    for (const tech of eco.technologies) {
      console.log(`${INDENT}  ${ICONS.bullet} ${tech.name}`);
    }
  }
}

/** Keep findings ordered by severity, preserving order for ties. */
function bySeverity(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  );
}

/**
 * Display results grouped by category.
 * If not verbose, shows a concise summary line instead.
 */
export function printFindings(findings: Finding[], verbose: boolean = false): void {
  const categories = [...new Set(findings.map((f) => f.category))];

  if (findings.length === 0) {
    console.log(`\n${INDENT}${ICONS.info} No findings were returned by the checks.`);
    return;
  }

  //The concise state
  if (!verbose) {
    console.log(
      `\n${INDENT}${pc.dim("▶")} ${pc.bold("Analysis results")} ` +
      pc.dim(`(${findings.length} findings hidden — run with ${pc.cyan("--verbose")} to view)`)
    );
    return;
  }

  //The expanded state
  heading("Analysis results");

  for (const category of categories) {
    console.log(`\n${INDENT}${pc.bold(category)}`);

    for (const finding of bySeverity(
      findings.filter((item) => item.category === category),
    )) {
      console.log(`${INDENT}  ${ICONS[finding.severity]} ${pc.dim(finding.title)}`);
    }
  }
}

function scoreBreakdown(score: Score): string {
  const parts = ["100"];

  if (score.errors > 0) {
    parts.push(
      `− ${score.errors * ERROR_PENALTY} (${plural(score.errors, "error")} × ${ERROR_PENALTY})`,
    );
  }

  if (score.warnings > 0) {
    parts.push(
      `− ${score.warnings * WARNING_PENALTY} (${plural(score.warnings, "warning")} × ${WARNING_PENALTY})`,
    );
  }

  return parts.join(" ");
}

function verdict(score: Score): string {
  if (score.errors > 0) {
    return pc.red("Fix the errors first. They are the highest-priority issues.");
  }

  if (score.warnings > 0) {
    return pc.yellow("No errors found. A few improvements could make this project stronger.");
  }

  return pc.green("Everything looks good. Nice work!");
}

/**
 * Final score, issue guidance, and completion time.
 */
export function printSummary(
  findings: Finding[],
  score: Score,
  ms: number,
): void {
  const passed = findings.filter((f) => f.severity === "pass").length;
  const info = findings.filter((f) => f.severity === "info").length;

  heading("Project health");

  // Summary Metrics
  console.log(
    `${INDENT}${ICONS.pass} ${passed} passed   ` +
    `${ICONS.warning} ${plural(score.warnings, "warning")}   ` +
    `${ICONS.error} ${plural(score.errors, "error")}`
  );

  if (info > 0) {
    console.log(`${INDENT}${ICONS.info} ${plural(info, "informational finding")}`);
  }

  console.log();
  console.log(
    `${INDENT}${pc.bold("Score")}  ${scoreBar(score.value)} ${scoreColor(score.value)(`${score.value}/100`)}`
  );

  if (score.deducted > 0) {
    console.log(`${INDENT}       ${pc.dim(scoreBreakdown(score))}`);
  }

  console.log(`\n${INDENT}${verdict(score)}`);

  const toFix = bySeverity(
    findings.filter((finding) => needsGuidance(finding.severity)),
  );

  // Recommendations with "Pipe/Quote" UI structure
  if (toFix.length > 0) {
    heading("Recommended improvements");

    toFix.forEach((finding, index) => {
      const number = String(index + 1).padStart(2, "0");
      const titleColor = finding.severity === "error" ? pc.red : pc.yellow;
      const pipe = pc.dim("│");

      console.log(
        `\n${INDENT}${pc.dim(number)} ${ICONS[finding.severity]} ${pc.bold(titleColor(finding.title))}`,
      );

      if (finding.why) {
        console.log(`${INDENT}   ${pipe} ${pc.dim(pc.bold("WHY"))}`);
        console.log(`${INDENT}   ${pipe} ${pc.dim(finding.why)}`);
      }

      if (finding.suggestion) {
        if (finding.why) console.log(`${INDENT}   ${pipe}`); // spacer between why and suggestion
        console.log(`${INDENT}   ${pipe} ${pc.bold("SUGGESTION")}`);
        console.log(`${INDENT}   ${pipe} ${finding.suggestion}`);
      }
    });
  } else {
    console.log(
      `\n${INDENT}${ICONS.pass} ${pc.green("No recommended fixes at this time.")}`,
    );
  }

  console.log();
  console.log(`${INDENT}${pc.dim(LINE)}`);
  console.log(
    `${INDENT}${ICONS.pass} ${pc.bold("Analysis complete")} ${pc.dim(`in ${(ms / 1000).toFixed(2)}s`)}`,
  );
  console.log();
}

const ECOSYSTEM_LABELS: Record<EcosystemId, string> = {
  node: "Node.js",
  python: "Python",
};

/**
 * List all registered rules.
 */
export function printRuleList(rules: Rule[]): void {
  const groups = new Map<string, Rule[]>();

  for (const rule of rules) {
    const label = rule.ecosystem
      ? ECOSYSTEM_LABELS[rule.ecosystem]
      : "Universal";

    groups.set(label, [...(groups.get(label) ?? []), rule]);
  }

  heading("Available checks");

  for (const [label, list] of groups) {
    console.log(`\n${INDENT}${pc.bold(pc.cyan(label))}`);

    for (const rule of list) {
      console.log(
        `${INDENT}  ${ICONS.bullet} ${pc.green(rule.id.padEnd(24))} ${pc.dim(rule.description)}`,
      );
    }
  }

  console.log();
  console.log(`${INDENT}${pc.dim(LINE)}`);
  console.log(`${INDENT}${pc.dim(`${rules.length} rules available`)}`);
  console.log();
}

export function printRemoteStart(url: string): void {
  heading("Remote analysis");
  console.log(`${INDENT}${pc.dim("Repository")}   ${pc.cyan(url)}`);
  console.log(`${INDENT}${ICONS.arrow} Fetching repository...`);
}

export function printFetched(): void {
  console.log(`${INDENT}${ICONS.pass} Repository fetched`);
}

export function printRemoteError(error: RemoteError): void {
  console.error(`\n${INDENT}${ICONS.error} ${pc.bold(pc.red(error.title))}\n`);
  console.error(`${INDENT}${error.details}\n`);
  console.error(`${INDENT}${pc.bold("Suggestion")}`);
  console.error(`${INDENT}${ICONS.arrow} ${error.suggestion}\n`);
}