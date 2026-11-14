import type { Report } from "../types/report.js";

/** The report as formatted JSON (2-space indent), ready for scripts, CI jobs or a chatbot. */
export function renderJson(report: Report): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
