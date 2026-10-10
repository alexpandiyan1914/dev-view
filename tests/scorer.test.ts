import { describe, expect, it } from "vitest";
import { calculateScore } from "../src/core/scorer.js";
import { needsGuidance } from "../src/core/severity.js";
import { validateFinding } from "../src/core/rule.js";
import type { Finding, Severity } from "../src/types/result.js";

function finding(severity: Severity, overrides: Partial<Finding> = {}): Finding {
  return { ruleId: "test.rule", category: "Test", severity, title: "Title", message: "Message", ...overrides };
}

describe("calculateScore", () => {
  it("gives 100 when there are no findings", () => {
    expect(calculateScore([]).value).toBe(100);
  });

  it("ignores passes and info lines", () => {
    const score = calculateScore([finding("pass"), finding("info"), finding("pass")]);
    expect(score.value).toBe(100);
    expect(score.deducted).toBe(0);
  });

  it("subtracts 10 for every error and 3 for every warning", () => {
    const score = calculateScore([finding("error"), finding("error"), finding("warning")]);
    expect(score.errors).toBe(2);
    expect(score.warnings).toBe(1);
    expect(score.deducted).toBe(23);
    expect(score.value).toBe(77);
  });

  it("never goes below zero", () => {
    const many = Array.from({ length: 30 }, () => finding("error"));
    expect(calculateScore(many).value).toBe(0);
  });

  it("gives the same score for the same findings, in any order", () => {
    const a = [finding("error"), finding("warning"), finding("pass")];
    const b = [finding("pass"), finding("warning"), finding("error")];
    expect(calculateScore(a).value).toBe(calculateScore(b).value);
  });
});

describe("needsGuidance", () => {
  it("is true only for warnings and errors", () => {
    expect(needsGuidance("error")).toBe(true);
    expect(needsGuidance("warning")).toBe(true);
    expect(needsGuidance("info")).toBe(false);
    expect(needsGuidance("pass")).toBe(false);
  });
});

describe("validateFinding", () => {
  it("accepts a pass without why or suggestion", () => {
    expect(validateFinding(finding("pass"))).toEqual([]);
  });

  it("accepts a warning that has why and suggestion", () => {
    expect(validateFinding(finding("warning", { why: "Because", suggestion: "Do this" }))).toEqual([]);
  });

  it("rejects a warning without why or suggestion", () => {
    expect(validateFinding(finding("warning"))).toEqual(["missing why", "missing suggestion"]);
  });

  it("rejects an error with a blank why", () => {
    const problems = validateFinding(finding("error", { why: "   ", suggestion: "Fix it" }));
    expect(problems).toEqual(["missing why"]);
  });

  it("rejects empty required text fields", () => {
    expect(validateFinding(finding("pass", { title: "" }))).toEqual(["title is empty"]);
  });
});