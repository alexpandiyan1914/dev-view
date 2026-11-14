import type { EcosystemId } from "./result.js";

/** Bumped only when the JSON export changes in a way that could break a script reading it. */
export const REPORT_SCHEMA_VERSION = 1;

/** Only errors and warnings become issues: they are the findings that carry a "why" and a fix. */
export type IssueSeverity = "error" | "warning";

export interface ReportIssue {
  ruleId: string;
  severity: IssueSeverity;
  category: string;
  title: string;
  why: string;
  suggestion: string;
  /** Set when several similar findings were merged into this one issue. */
  count?: number;
  /** Titles of the merged findings (the first few, when there are many). */
  examples?: string[];
}

export interface ReportEcosystem {
  id: EcosystemId;
  name: string;
  technologies: string[];
}

export interface ReportSummary {
  errors: number;
  warnings: number;
  passed: number;
  info: number;
}

/**
 * Everything an export needs, in one place. The Markdown and the JSON exporters both read this
 * object, so they can never disagree with each other.
 *
 * It never holds file contents and never holds absolute paths.
 */
export interface Report {
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  tool: { name: "dev-view"; version: string };
  /** ISO 8601 date and time of the scan. */
  scannedAt: string;
  mode: "local" | "remote";
  /** The project folder name (local) or the repository address (remote). Never a full local path. */
  target: string;
  ecosystems: ReportEcosystem[];
  score: number;
  summary: ReportSummary;
  issues: ReportIssue[];
  /** How many issues were left out because of --max-issues. 0 when nothing was cut. */
  omittedIssues: number;
}
