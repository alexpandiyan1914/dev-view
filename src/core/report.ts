import type { Detection, Finding } from "../types/result.js";
import {
  REPORT_SCHEMA_VERSION,
  type IssueSeverity,
  type Report,
  type ReportIssue,
} from "../types/report.js";
import type { Score } from "./scorer.js";
import { SEVERITY_RANK, needsGuidance } from "./severity.js";
import { VERSION } from "../version.js";

/** More than this many findings from one rule (and one severity) are merged into a single issue. */
export const GROUP_AFTER = 5;
/** A merged issue lists at most this many of its findings. */
export const MAX_EXAMPLES = 20;
/** Keeps one oversized message from flooding a chatbot. */
const MAX_TEXT_LENGTH = 400;

/**
 * Makes one piece of text safe to put in a shared report:
 *  - the project's full path is removed, so the report never reveals the user's folder layout
 *  - line breaks and control characters become spaces, so a strange file name cannot start a
 *    new line (and with it a new heading or a fake instruction) inside the Markdown
 *  - very long text is shortened
 */
export function cleanText(text: string, rootPath?: string): string {
  let result = text;

  if (rootPath && rootPath.length > 1) {
    const withSlashes = rootPath.replaceAll("\\", "/");
    const withBackslashes = rootPath.replaceAll("/", "\\");
    const variants = [...new Set([rootPath, withSlashes, withBackslashes])];

    // "/home/me/app/src/a.ts" -> "src/a.ts", and a bare "/home/me/app" -> "."
    for (const variant of variants) result = result.split(`${variant}/`).join("");
    for (const variant of variants) result = result.split(`${variant}\\`).join("");
    for (const variant of variants) result = result.split(variant).join(".");
  }

  result = result.replace(/[\u0000-\u001F\u007F\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();

  return result.length > MAX_TEXT_LENGTH ? `${result.slice(0, MAX_TEXT_LENGTH - 1)}…` : result;
}

function toIssue(finding: Finding, rootPath?: string): ReportIssue {
  return {
    ruleId: cleanText(finding.ruleId, rootPath),
    severity: finding.severity as IssueSeverity,
    category: cleanText(finding.category, rootPath),
    title: cleanText(finding.title, rootPath),
    why: cleanText(finding.why ?? "", rootPath),
    suggestion: cleanText(finding.suggestion ?? "", rootPath),
  };
}

/**
 * Merges many similar issues into one, so a project with 60 large files does not produce a
 * report too long to paste into a chatbot. Groups keep the position of their first member.
 */
export function groupIssues(issues: ReportIssue[]): ReportIssue[] {
  const groups = new Map<string, ReportIssue[]>();
  for (const issue of issues) {
    const key = `${issue.ruleId}|${issue.severity}`;
    groups.set(key, [...(groups.get(key) ?? []), issue]);
  }

  const merged: ReportIssue[] = [];
  const done = new Set<string>();

  for (const issue of issues) {
    const key = `${issue.ruleId}|${issue.severity}`;
    const members = groups.get(key)!;

    if (members.length <= GROUP_AFTER) {
      merged.push(issue);
      continue;
    }
    if (done.has(key)) continue;
    done.add(key);

    const [first] = members;
    merged.push({
      ruleId: first.ruleId,
      severity: first.severity,
      category: first.category,
      title: `${first.title} and ${members.length - 1} more like it`,
      why: first.why,
      suggestion: `${first.suggestion} Apply the same fix to each of the other affected items.`,
      count: members.length,
      examples: members.slice(0, MAX_EXAMPLES).map((member) => member.title),
    });
  }
  return merged;
}

export interface BuildReportInput {
  mode: "local" | "remote";
  /** Folder name (local) or repository address (remote). */
  target: string;
  /** Absolute path of the scanned folder. Only used to scrub it out of the text. */
  rootPath: string;
  detection: Detection;
  findings: Finding[];
  score: Score;
  /** Keep at most this many issues (after merging similar ones). */
  maxIssues?: number;
  /** Lets tests pass a fixed date. */
  now?: Date;
}

export function buildReport(input: BuildReportInput): Report {
  const { findings, rootPath } = input;

  const issues = groupIssues(
    findings.filter((finding) => needsGuidance(finding.severity)).map((finding) => toIssue(finding, rootPath)),
  )
    // Array.prototype.sort is stable, so issues of the same severity keep their report order.
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);

  const kept = input.maxIssues === undefined ? issues : issues.slice(0, input.maxIssues);

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    tool: { name: "dev-view", version: VERSION },
    scannedAt: (input.now ?? new Date()).toISOString(),
    mode: input.mode,
    target: cleanText(input.target, rootPath),
    ecosystems: input.detection.ecosystems.map((eco) => ({
      id: eco.id,
      name: eco.name,
      technologies: eco.technologies.map((tech) => tech.name),
    })),
    score: input.score.value,
    summary: {
      errors: input.score.errors,
      warnings: input.score.warnings,
      passed: findings.filter((f) => f.severity === "pass").length,
      info: findings.filter((f) => f.severity === "info").length,
    },
    issues: kept,
    omittedIssues: issues.length - kept.length,
  };
}
