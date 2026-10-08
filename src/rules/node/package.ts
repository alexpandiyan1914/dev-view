import { hasRootFile } from "../../core/files.js";
import { keysOf, readPackageJson, type PackageJson } from "../../core/package-json.js";
import type { Finding, ProjectContext } from "../../types/result.js";

const CATEGORY = "Node.js";

type Draft = Omit<Finding, "category">;
const make = (draft: Draft): Finding => ({ category: CATEGORY, ...draft });

const isText = (value: unknown): boolean => typeof value === "string" && value.trim() !== "";

function checkMetadata(pkg: PackageJson): Finding {
  if (pkg.private === true) {
    return make({
      ruleId: "node.metadata",
      severity: "info",
      title: "Private package: publishing metadata not checked",
      message: 'package.json has "private": true',
    });
  }

  const missing = ["name", "version", "description", "license"].filter((key) => !isText(pkg[key]));
  if (missing.length === 0) {
    return make({
      ruleId: "node.metadata",
      severity: "pass",
      title: "package.json metadata is complete",
      message: "name, version, description and license are set",
    });
  }

  return make({
    ruleId: "node.metadata",
    severity: "warning",
    title: `package.json is missing: ${missing.join(", ")}`,
    message: `Missing fields: ${missing.join(", ")}`,
    why: "npm needs a name and version to publish a package, and other developers use the description and license to decide whether they can use it.",
    suggestion: "Add the missing fields to package.json. Running 'npm init' walks you through them. If this is an app and not a library, add \"private\": true instead.",
  });
}

function checkTestScript(pkg: PackageJson): Finding {
  const scripts = pkg.scripts && typeof pkg.scripts === "object" ? (pkg.scripts as Record<string, unknown>) : {};
  const test = typeof scripts.test === "string" ? scripts.test : "";

  if (test.trim() === "" || /no test specified/i.test(test)) {
    return make({
      ruleId: "node.test-script",
      severity: "warning",
      title: test ? "The test script is still the npm placeholder" : "No test script",
      message: test ? 'scripts.test only prints "no test specified"' : "package.json has no scripts.test",
      why: "A test script gives contributors and automated checks one standard command, 'npm test', to see whether the project still works.",
      suggestion: 'Add a real command, for example "test": "vitest run" or "test": "jest".',
    });
  }

  return make({
    ruleId: "node.test-script",
    severity: "pass",
    title: "Test script found",
    message: `npm test runs: ${test}`,
  });
}

function checkEngines(pkg: PackageJson): Finding {
  const engines = pkg.engines && typeof pkg.engines === "object" ? (pkg.engines as Record<string, unknown>) : {};

  if (isText(engines.node)) {
    return make({
      ruleId: "node.engines",
      severity: "pass",
      title: "Node.js version declared",
      message: `engines.node is ${String(engines.node)}`,
    });
  }

  return make({
    ruleId: "node.engines",
    severity: "info",
    title: "No Node.js version declared",
    message: "package.json has no engines.node",
    why: "Without it, people only find out the project needs a newer Node.js when something breaks.",
    suggestion: 'Add "engines": { "node": ">=20" } using the oldest version you actually support.',
  });
}

function checkPublishFiles(ctx: ProjectContext, pkg: PackageJson): Finding[] {
  const publishable = pkg.private !== true && ["main", "bin", "exports", "module"].some((key) => key in pkg);
  if (!publishable) return [];

  if (Array.isArray(pkg.files) || hasRootFile(ctx, ".npmignore")) {
    return [
      make({
        ruleId: "node.publish-files",
        severity: "pass",
        title: "Published files are limited",
        message: "package.json has a files list or the project has .npmignore",
      }),
    ];
  }

  return [
    make({
      ruleId: "node.publish-files",
      severity: "warning",
      title: "No files list or .npmignore",
      message: "npm will publish every file that is not ignored",
      why: "Without a files list, npm publishes everything that is not ignored (it reads .gitignore when there is no .npmignore). That can include tests, fixtures and private notes.",
      suggestion: 'Add "files": ["dist"] (or whatever you ship) to package.json, or create an .npmignore.',
    }),
  ];
}

function checkDuplicateDependencies(pkg: PackageJson): Finding {
  const dev = new Set(keysOf(pkg.devDependencies));
  const duplicates = keysOf(pkg.dependencies).filter((name) => dev.has(name));

  if (duplicates.length === 0) {
    return make({
      ruleId: "node.duplicate-dependencies",
      severity: "pass",
      title: "Each dependency is declared once",
      message: "No package appears in both dependencies and devDependencies",
    });
  }

  return make({
    ruleId: "node.duplicate-dependencies",
    severity: "warning",
    title: `Listed in both dependencies and devDependencies: ${duplicates.join(", ")}`,
    message: `${duplicates.length} package(s) are declared twice`,
    why: "A package should live in one place. Declaring it twice is confusing, and the two version ranges can drift apart.",
    suggestion: "Keep it in 'dependencies' if the app needs it at runtime, otherwise in 'devDependencies', and remove the other entry.",
  });
}

export async function checkNodePackageJson(ctx: ProjectContext): Promise<Finding[]> {
  const result = await readPackageJson(ctx.rootPath);

  if (!result.ok) {
    return [
      make({
        ruleId: "node.package-json-valid",
        severity: "error",
        title: "package.json is not valid JSON",
        message: "package.json could not be parsed",
        why: "npm and every Node.js tool read this file first. If it is broken, installing, running and publishing all fail.",
        suggestion: "Open package.json and look for a missing comma, quote or bracket. Your editor usually underlines the problem.",
      }),
    ];
  }

  const pkg = result.data;
  return [
    make({
      ruleId: "node.package-json-valid",
      severity: "pass",
      title: "package.json is valid",
      message: "package.json parsed successfully",
    }),
    checkMetadata(pkg),
    checkTestScript(pkg),
    checkEngines(pkg),
    ...checkPublishFiles(ctx, pkg),
    checkDuplicateDependencies(pkg),
  ];
}

const LOCKFILES = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lock", "bun.lockb"];

export function checkNodeLockfile(ctx: ProjectContext): Finding[] {
  const found = LOCKFILES.filter((name) => hasRootFile(ctx, name));

  if (found.length === 0) {
    return [
      make({
        ruleId: "node.lockfile",
        severity: "warning",
        title: "No lockfile found",
        message: "No package-lock.json, yarn.lock, pnpm-lock.yaml or bun.lock",
        why: "Without a lockfile every install can pick different dependency versions, so the project may work on your machine and break on someone else's.",
        suggestion: "Run 'npm install' to create package-lock.json, then commit it.",
      }),
    ];
  }

  if (found.length > 1) {
    return [
      make({
        ruleId: "node.lockfile",
        severity: "warning",
        title: `Multiple lockfiles: ${found.join(", ")}`,
        message: "More than one package manager has written a lockfile",
        why: "Each package manager trusts its own lockfile, so people using different tools install different versions.",
        suggestion: "Choose one package manager, keep its lockfile and delete the others.",
      }),
    ];
  }

  const [lockfile] = found;
  if (ctx.trackedFiles && !ctx.trackedFiles.includes(lockfile)) {
    return [
      make({
        ruleId: "node.lockfile",
        severity: "warning",
        title: `${lockfile} is not tracked by Git`,
        message: `${lockfile} exists but is not committed`,
        why: "A lockfile only helps if everyone gets the same one, which means it must be committed.",
        suggestion: `Run 'git add ${lockfile}' and commit it. Make sure .gitignore does not list it.`,
      }),
    ];
  }

  return [
    make({
      ruleId: "node.lockfile",
      severity: "pass",
      title: `${lockfile} found`,
      message: `${lockfile} exists`,
    }),
  ];
}

// A test folder, or a file named like *.test.ts / *.spec.js
const TEST_PATH = /(^|\/)(__tests__|tests?)\/|\.(test|spec)\.[cm]?[jt]sx?$/i;
const FIXTURE_PATH = /(^|\/)(__fixtures__|fixtures)\//i;

export function checkNodeTests(ctx: ProjectContext): Finding[] {
  const found = ctx.files.some((f) => TEST_PATH.test(f.path) && !FIXTURE_PATH.test(f.path));

  if (found) {
    return [
      make({
        ruleId: "node.tests-exist",
        severity: "pass",
        title: "Test files found",
        message: "The project contains test files",
      }),
    ];
  }

  return [
    make({
      ruleId: "node.tests-exist",
      severity: "warning",
      title: "No test files found",
      message: "No tests/ folder and no *.test.* or *.spec.* files",
      why: "Tests catch mistakes before your users do, and they let you change code without fear of breaking it.",
      suggestion: "Start small: add one test for the most important function, using Vitest or Jest.",
    }),
  ];
}