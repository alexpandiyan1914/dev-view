import type { Severity } from "../types/result.js";

export const SEVERITY_RANK: Record<Severity, number> = {
  error: 3,
  warning: 2,
  info: 1,
  pass: 0,
};

export function needsGuidance(severity: Severity): boolean {
  return severity === "warning" || severity === "error";
}