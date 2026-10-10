import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  printDetection,
  printFindings,
  printRemoteError,
  printRuleList,
  printSummary,
} from "../src/core/reporter.js";
import { calculateScore } from "../src/core/scorer.js";
import { RemoteError } from "../src/input/remote.js";
import { RULES } from "../src/rules/registry.js";
import type { Finding, Severity } from "../src/types/result.js";
import { cleanupProjects, createProject } from "./helpers/project.js";

afterAll(cleanupProjects);

const stripColors = (text: string): string => text.replace(/\x1B\[[0-9;]*m/g, "");

/** Runs a function and returns everything it printed to the console, without colors. */
function capture(print: () => void, stream: "log" | "error" = "log"): string {
  const lines: string[] = [];
  const spy = vi.spyOn(console, stream).mockImplementation((...args: unknown[]) => {
    lines.push(args.join(" "));
  });
  try {
    print();
  } finally {
    spy.mockRestore();
  }
  return stripColors(lines.join("\n"));
}

function finding(severity: Severity, title: string, extra: Partial<Finding> = {}): Finding {
  const guidance = severity === "warning" || severity === "error" ? { why: `Why ${title}`, suggestion: `Fix ${title}` } : {};
  return { ruleId: `test.${title}`, category: "Test", severity, title, message: "m", ...guidance, ...extra };
}

describe("printSummary", () => {
  it("uses singular wording for exactly one warning and one error", () => {
    const findings = [finding("warning", "w"), finding("error", "e")];
    const text = capture(() => printSummary(findings, calculateScore(findings), 12));

    expect(text).toContain("1 warning ");
    expect(text).toContain("1 error");
    expect(text).not.toContain("1 warnings");
    expect(text).not.toContain("1 errors");
  });

  it("explains the score with the same numbers as the summary", () => {
    const findings = [finding("error", "e1"), finding("warning", "w1"), finding("warning", "w2")];
    const text = capture(() => printSummary(findings, calculateScore(findings), 12));

    expect(text).toContain("84/100");
    expect(text).toContain("100 − 10 (1 error × 10) − 6 (2 warnings × 3)");
  });

  it("celebrates a perfect project", () => {
    const findings = [finding("pass", "p")];
    const text = capture(() => printSummary(findings, calculateScore(findings), 12));

    expect(text).toContain("100/100");
    expect(text).toContain("Everything looks good");
    expect(text).toContain("No recommended fixes");
    expect(text).not.toContain("RECOMMENDED IMPROVEMENTS");
  });

  it("tells the user to fix errors first, even when the score is high", () => {
    const findings = [finding("error", "e")];
    const text = capture(() => printSummary(findings, calculateScore(findings), 12));
    expect(text).toContain("Fix the errors first");
  });

  it("lists recommendations most serious first, with why and suggestion", () => {
    const findings = [finding("warning", "minor thing"), finding("error", "major thing")];
    const text = capture(() => printSummary(findings, calculateScore(findings), 12));

    expect(text.indexOf("major thing")).toBeLessThan(text.indexOf("minor thing"));
    expect(text).toContain("Why major thing");
    expect(text).toContain("Fix major thing");
    expect(text).toContain("01");
    expect(text).toContain("02");
  });
});

describe("printFindings", () => {
  const findings = [finding("pass", "all fine"), finding("warning", "small issue"), finding("error", "big issue")];

  it("hides the details by default and points to --verbose", () => {
    const text = capture(() => printFindings(findings));

    expect(text).toContain("3 findings hidden");
    expect(text).toContain("--verbose");
    expect(text).not.toContain("big issue");
  });

  it("shows every finding in verbose mode, most serious first", () => {
    const text = capture(() => printFindings(findings, true));

    expect(text.indexOf("big issue")).toBeLessThan(text.indexOf("small issue"));
    expect(text.indexOf("small issue")).toBeLessThan(text.indexOf("all fine"));
  });

  it("copes with an empty list", () => {
    expect(capture(() => printFindings([]))).toContain("No findings");
  });
});

describe("other reporter output", () => {
  it("explains when no ecosystem was detected", () => {
    const text = capture(() => printDetection({ ecosystems: [] }));
    expect(text).toContain("No supported ecosystem detected");
  });

  it("lists every rule and the total", () => {
    const text = capture(() => printRuleList(RULES));

    for (const rule of RULES) expect(text).toContain(rule.id);
    expect(text).toContain(`${RULES.length} rules available`);
  });

  it("prints a remote error as title, details and suggestion", () => {
    const error = new RemoteError("Unable to access repository", "It may be private.", "Check the URL.");
    const text = capture(() => printRemoteError(error), "error");

    expect(text).toContain("Unable to access repository");
    expect(text).toContain("It may be private.");
    expect(text).toContain("Check the URL.");
  });
});

/** Runs the real CLI in a separate process, like a user would. */
function runCli(...args: string[]) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

const tempFolders = (): string[] => readdirSync(tmpdir()).filter((name) => /^dev-view-[A-Za-z0-9]{6}$/.test(name));

describe("the command line", () => {
  it("prints the version", () => {
    expect(runCli("--version").out.trim()).toBe("0.1.0");
  });

  it("lists all three commands in --help", () => {
    const { out } = runCli("--help");
    for (const command of ["local", "remote", "rules"]) expect(out).toContain(command);
  });

  it("lists every rule", () => {
    const { code, out } = runCli("rules");
    expect(code).toBe(0);
    expect(out).toContain(`${RULES.length} rules available`);
  });

  it("analyzes a healthy project: exit code 0 and a perfect score", () => {
    const root = createProject(
      {
        "README.md": "# hi",
        LICENSE: "MIT",
        ".gitignore": ".env\n",
        "requirements.txt": "flask==3.0.0\n",
        "pyproject.toml": 'requires-python = ">=3.10"',
        "tests/test_app.py": "def test_ok(): pass",
      },
      { git: true },
    );
    const { code, out } = runCli("local", root);

    expect(code).toBe(0);
    expect(out).toContain("PROJECT OVERVIEW");
    expect(out).toContain("Python");
    expect(out).toContain("100/100");
    expect(out).toContain("Everything looks good");
  });

  it("explains problems in a broken project", () => {
    const root = createProject({ ".env": "SECRET=1" }, { git: true });
    const { out } = runCli("local", root);

    expect(out).toContain(".env is tracked by Git");
    expect(out).toContain("RECOMMENDED IMPROVEMENTS");
    expect(out).toContain("Fix the errors first");
    expect(out).not.toContain("SECRET=1"); // we never print file contents
  });

  it("shows individual findings only with --verbose", () => {
    const root = createProject({ "a.txt": "a" });
    expect(runCli("local", root).out).not.toContain("ANALYSIS RESULTS\n");
    expect(runCli("local", root, "--verbose").out).toContain("No README found");
  });

  it("fails clearly when the folder does not exist", () => {
    const { code, err } = runCli("local", "this-folder-does-not-exist");
    expect(code).toBe(1);
    expect(err).toContain("Not a valid directory");
  });
});

describe("remote failures", () => {
  it.each([
    ["an invalid address", "not a url", "Invalid repository URL"],
    ["a dangerous transport", "ext::sh -c touch /tmp/pwned", "Unsupported repository URL"],
    ["an address with credentials", "https://user:pass@github.com/u/r", "Credentials in the URL are not allowed"],
  ])("rejects %s before touching the network", (_label, url, title) => {
    const before = tempFolders().length;
    const { code, out, err } = runCli("remote", url);

    expect(code).toBe(1);
    expect(err).toContain(title);
    expect(out).not.toContain("DEV VIEW"); // blocked before anything else happens
    expect(tempFolders().length).toBe(before);
  });

  it("fails with a helpful message when the host cannot be reached, and cleans up", () => {
    const before = tempFolders().length;
    // The .invalid domain is reserved and can never exist.
    const { code, out, err } = runCli("remote", "https://nonexistent-host-12345.invalid/user/project");

    expect(code).toBe(1);
    expect(err).toContain("Suggestion");
    expect(out).not.toContain("Analysis complete");
    expect(tempFolders().length).toBe(before);
  });
});