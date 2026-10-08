import { hasRootFile, readRootFile } from "../../core/files.js";
import type { Finding, ProjectContext } from "../../types/result.js";

const CATEGORY = "Python";

type Draft = Omit<Finding, "category">;
const make = (draft: Draft): Finding => ({ category: CATEGORY, ...draft });

/** Package names in requirements.txt that have no version specifier at all. */
function parseRequirements(text: string): { total: number; unpinned: string[] } {
  let total = 0;
  const unpinned: string[] = [];

  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    if (line === "" || line.startsWith("#") || line.startsWith("-")) continue; // comments and options like -r
    total++;
    if (line.includes("://") || line.includes("@")) continue; // direct URL references
    if (/[=<>!~]/.test(line)) continue; // has a version specifier
    unpinned.push(line.match(/^[A-Za-z0-9_.-]+/)?.[0] ?? line);
  }
  return { total, unpinned };
}

export async function checkPythonRequirements(ctx: ProjectContext): Promise<Finding[]> {
  const text = await readRootFile(ctx, "requirements.txt");
  if (text === null) return [];

  const { total, unpinned } = parseRequirements(text);

  if (total === 0) {
    return [
      make({
        ruleId: "python.requirements-empty",
        severity: "warning",
        title: "requirements.txt is empty",
        message: "requirements.txt contains no dependencies",
        why: "People who clone the project cannot tell which packages it needs.",
        suggestion: "List your dependencies, for example with 'pip freeze > requirements.txt' inside your virtual environment.",
      }),
    ];
  }

  if (unpinned.length > 0) {
    const shown = unpinned.slice(0, 5).join(", ") + (unpinned.length > 5 ? ", ..." : "");
    return [
      make({
        ruleId: "python.requirements-unpinned",
        severity: "warning",
        title: `${unpinned.length} ${unpinned.length === 1 ? "dependency has" : "dependencies have"} no version: ${shown}`,
        message: "requirements.txt lines without a version specifier",
        why: "Without versions, the same install can give you different packages next month, and a new release can break your app overnight.",
        suggestion: "Pin versions, for example 'requests==2.32.3'. 'pip freeze' prints the exact versions you have installed.",
      }),
    ];
  }

  return [
    make({
      ruleId: "python.requirements-unpinned",
      severity: "pass",
      title: "Dependencies in requirements.txt have versions",
      message: `${total} dependencies, all with a version specifier`,
    }),
  ];
}

export async function checkPythonVersion(ctx: ProjectContext): Promise<Finding[]> {
  const declared =
    hasRootFile(ctx, ".python-version") ||
    hasRootFile(ctx, "runtime.txt") ||
    /requires-python/.test((await readRootFile(ctx, "pyproject.toml")) ?? "") ||
    /python_requires/.test((await readRootFile(ctx, "setup.py")) ?? "") ||
    /python_(full_)?version/.test((await readRootFile(ctx, "Pipfile")) ?? "");

  if (declared) {
    return [
      make({
        ruleId: "python.version-declared",
        severity: "pass",
        title: "Python version declared",
        message: "The project states which Python version it needs",
      }),
    ];
  }

  return [
    make({
      ruleId: "python.version-declared",
      severity: "info",
      title: "No Python version declared",
      message: "No .python-version file and no requires-python setting",
      why: "Python 3.9 and 3.13 behave differently. Without a stated version, people only find out when something fails.",
      suggestion: 'Add a .python-version file, or set requires-python = ">=3.10" in pyproject.toml.',
    }),
  ];
}

// A tests/ folder, or files named test_*.py / *_test.py
const TEST_PATH = /(^|\/)tests?\/|(^|\/)test_[^/]*\.py$|_test\.py$/i;
const FIXTURE_PATH = /(^|\/)(__fixtures__|fixtures)\//i;

export function checkPythonTests(ctx: ProjectContext): Finding[] {
  const found = ctx.files.some((f) => TEST_PATH.test(f.path) && !FIXTURE_PATH.test(f.path));

  if (found) {
    return [
      make({
        ruleId: "python.tests-exist",
        severity: "pass",
        title: "Test files found",
        message: "The project contains test files",
      }),
    ];
  }

  return [
    make({
      ruleId: "python.tests-exist",
      severity: "warning",
      title: "No test files found",
      message: "No tests/ folder and no test_*.py files",
      why: "Tests catch mistakes before your users do, and they let you change code without fear of breaking it.",
      suggestion: "Start small: create tests/test_app.py with one test for your most important function, and run it with pytest.",
    }),
  ];
}