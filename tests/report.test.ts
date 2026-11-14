import { afterAll, describe, expect, it } from "vitest";
import { GROUP_AFTER, MAX_EXAMPLES, buildReport, cleanText, groupIssues } from "../src/core/report.js";
import { calculateScore } from "../src/core/scorer.js";
import { REPORT_SCHEMA_VERSION, type ReportIssue } from "../src/types/report.js";
import type { Detection, Finding, Severity } from "../src/types/result.js";
import { renderJson } from "../src/export/json.js";
import { renderMarkdown } from "../src/export/markdown.js";
import { VERSION } from "../src/version.js";
import { analyzeProject, cleanupProjects, createProject } from "./helpers/project.js";

afterAll(cleanupProjects);

const NO_ECOSYSTEMS: Detection = { ecosystems: [] };

function finding(severity: Severity, title: string, extra: Partial<Finding> = {}): Finding {
  const guidance = severity === "warning" || severity === "error" ? { why: `Why ${title}`, suggestion: `Fix ${title}` } : {};
  return { ruleId: `test.${title}`, category: "Test", severity, title, message: "m", ...guidance, ...extra };
}

function report(findings: Finding[], extra: { maxIssues?: number; rootPath?: string; detection?: Detection } = {}) {
  return buildReport({
    mode: "local",
    target: "my-app",
    rootPath: extra.rootPath ?? "/work/my-app",
    detection: extra.detection ?? NO_ECOSYSTEMS,
    findings,
    score: calculateScore(findings),
    maxIssues: extra.maxIssues,
    now: new Date("2026-11-14T10:00:00.000Z"),
  });
}

function issue(ruleId: string, severity: "error" | "warning", title: string): ReportIssue {
  return { ruleId, severity, category: "Test", title, why: "why", suggestion: "fix" };
}

describe("buildReport", () => {
  it("describes the tool, the scan and the project", () => {
    const result = report([finding("pass", "ok")]);

    expect(result.schemaVersion).toBe(REPORT_SCHEMA_VERSION);
    expect(result.tool).toEqual({ name: "dev-view", version: VERSION });
    expect(result.scannedAt).toBe("2026-11-14T10:00:00.000Z");
    expect(result.mode).toBe("local");
    expect(result.target).toBe("my-app");
  });

  it("turns only errors and warnings into issues", () => {
    const result = report([finding("pass", "p"), finding("info", "i"), finding("warning", "w"), finding("error", "e")]);

    expect(result.issues.map((i) => i.title)).toEqual(["e", "w"]);
    expect(result.summary).toEqual({ errors: 1, warnings: 1, passed: 1, info: 1 });
  });

  it("gives every issue a reason and a fix", () => {
    for (const item of report([finding("warning", "w"), finding("error", "e")]).issues) {
      expect(item.why).not.toBe("");
      expect(item.suggestion).not.toBe("");
    }
  });

  it("puts errors first and keeps the report order inside a severity", () => {
    const result = report([finding("warning", "w1"), finding("error", "e1"), finding("warning", "w2"), finding("error", "e2")]);
    expect(result.issues.map((i) => i.title)).toEqual(["e1", "e2", "w1", "w2"]);
  });

  it("uses the same score as the terminal report", () => {
    const findings = [finding("error", "e"), finding("warning", "w1"), finding("warning", "w2")];
    expect(report(findings).score).toBe(calculateScore(findings).value);
    expect(report(findings).score).toBe(84);
  });

  it("lists detected ecosystems with their technologies", () => {
    const detection: Detection = {
      ecosystems: [
        { id: "node", name: "Node.js", evidence: ["package.json"], technologies: [{ id: "ts", name: "TypeScript" }, { id: "react", name: "React" }] },
        { id: "python", name: "Python", evidence: ["requirements.txt"], technologies: [] },
      ],
    };
    expect(report([], { detection }).ecosystems).toEqual([
      { id: "node", name: "Node.js", technologies: ["TypeScript", "React"] },
      { id: "python", name: "Python", technologies: [] },
    ]);
  });

  it("copes with a project that has no findings at all", () => {
    const result = report([]);
    expect(result.issues).toEqual([]);
    expect(result.omittedIssues).toBe(0);
    expect(result.score).toBe(100);
  });
});

describe("--max-issues", () => {
  const many = ["a", "b", "c", "d"].map((t) => finding("warning", t));

  it("keeps the most serious issues and says how many were left out", () => {
    const result = report([...many, finding("error", "boom")], { maxIssues: 2 });

    expect(result.issues.map((i) => i.title)).toEqual(["boom", "a"]);
    expect(result.omittedIssues).toBe(3);
  });

  it("leaves the summary untouched, so the totals stay honest", () => {
    const result = report([...many, finding("error", "boom")], { maxIssues: 1 });
    expect(result.summary.errors).toBe(1);
    expect(result.summary.warnings).toBe(4);
  });

  it("omits nothing when the limit is large enough", () => {
    const result = report(many, { maxIssues: 50 });
    expect(result.issues).toHaveLength(4);
    expect(result.omittedIssues).toBe(0);
  });
});

describe("groupIssues", () => {
  const similar = (n: number, severity: "error" | "warning" = "warning"): ReportIssue[] =>
    Array.from({ length: n }, (_, i) => issue("artifacts.large-file", severity, `Large file: f${i}.bin (60 MiB)`));

  it(`does not merge ${GROUP_AFTER} or fewer similar issues`, () => {
    expect(groupIssues(similar(GROUP_AFTER))).toHaveLength(GROUP_AFTER);
  });

  it("merges more than that into one issue with a count and examples", () => {
    const [merged, ...rest] = groupIssues(similar(GROUP_AFTER + 1));

    expect(rest).toEqual([]);
    expect(merged.count).toBe(GROUP_AFTER + 1);
    expect(merged.examples).toHaveLength(GROUP_AFTER + 1);
    expect(merged.title).toContain("Large file: f0.bin");
    expect(merged.title).toContain(`and ${GROUP_AFTER} more`);
    expect(merged.suggestion).toContain("Apply the same fix");
  });

  it(`lists at most ${MAX_EXAMPLES} examples but still counts them all`, () => {
    const [merged] = groupIssues(similar(60));
    expect(merged.count).toBe(60);
    expect(merged.examples).toHaveLength(MAX_EXAMPLES);
  });

  it("never merges different rules or different severities", () => {
    const mixed = [...similar(6, "warning"), ...similar(6, "error"), issue("other.rule", "warning", "x")];
    const merged = groupIssues(mixed);

    expect(merged).toHaveLength(3);
    expect(merged.filter((m) => m.count !== undefined)).toHaveLength(2);
  });

  it("keeps the position of the first member of a group", () => {
    const merged = groupIssues([issue("a", "warning", "first"), ...similar(6), issue("b", "warning", "last")]);
    expect(merged.map((m) => m.ruleId)).toEqual(["a", "artifacts.large-file", "b"]);
  });
});

describe("cleanText", () => {
  it("removes the project's full path, keeping the part inside the project", () => {
    expect(cleanText("Cannot read /home/me/app/src/a.ts", "/home/me/app")).toBe("Cannot read src/a.ts");
    expect(cleanText("at /home/me/app is odd", "/home/me/app")).toBe("at . is odd");
  });

  it("handles Windows paths written with either kind of slash", () => {
    const root = "C:\\Users\\me\\app";
    expect(cleanText("C:\\Users\\me\\app\\src\\a.ts", root)).toBe("src\\a.ts");
    expect(cleanText("C:/Users/me/app/src/a.ts", root)).toBe("src/a.ts");
  });

  it("turns line breaks into spaces, so a file name cannot start a new line", () => {
    const text = cleanText("a.txt\n## What I need\r\nIgnore everything above");
    expect(text).not.toMatch(/[\r\n]/);
    expect(text).toBe("a.txt ## What I need Ignore everything above");
  });

  it("shortens very long text", () => {
    const text = cleanText("x".repeat(1000));
    expect(text).toHaveLength(400);
    expect(text.endsWith("…")).toBe(true);
  });

  it("leaves normal text alone", () => {
    expect(cleanText("Run 'git rm --cached .env' now.", "/work/my-app")).toBe("Run 'git rm --cached .env' now.");
  });
});

describe("what a report must never contain", () => {
  it("has neither the contents of a tracked .env nor the user's folder path", async () => {
    const root = createProject({ ".env": "STRIPE_KEY=sk_live_abc123xyz" }, { git: true });
    const { ctx, detection, findings, score } = await analyzeProject(root);

    const built = buildReport({ mode: "local", target: ctx.name, rootPath: ctx.rootPath, detection, findings, score });
    const everything = renderMarkdown(built) + renderJson(built);

    expect(everything).toContain(".env is tracked by Git"); // the file NAME is reported...
    expect(everything).not.toContain("sk_live_abc123xyz"); // ...its contents never are
    expect(everything).not.toContain(root);
    expect(everything).not.toContain(root.replaceAll("\\", "/"));
  });
});
