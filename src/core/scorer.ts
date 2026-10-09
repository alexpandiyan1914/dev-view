import type { Finding } from "../types/result.js";

export const ERROR_PENALTY = 10;
export const WARNING_PENALTY = 3;

export interface Score {
  value: number;
  errors: number;
  warnings: number;
  deducted: number;
}

export function calculateScore(findings: Finding[]): Score {
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  const deducted = errors * ERROR_PENALTY + warnings * WARNING_PENALTY;

  return { value: Math.max(0, 100 - deducted), errors, warnings, deducted };
}