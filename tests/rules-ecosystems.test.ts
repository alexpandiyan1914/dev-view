import { afterAll, describe, expect, it } from "vitest";
import { analyzeProject, byRule, cleanupProjects, createProject, severitiesOf } from "./helpers/project.js";

afterAll(cleanupProjects);

const pkg = (fields: Record<string, unknown>): string => JSON.stringify(fields);

describe("Node.js: package.json", () => {
  it("raises an error for invalid JSON and skips the checks that need it", async () => {
    const { findings } = await analyzeProject(createProject({ "package.json": "{ not json" }));

    expect(severitiesOf(findings, "node.package-json-valid")).toEqual(["error"]);
    expect(byRule(findings, "node.metadata")).toEqual([]);
    expect(byRule(findings, "node.test-script")).toEqual([]);
  });

  it("accepts a package.json that starts with a BOM", async () => {
    const root = createProject({ "package.json": "\uFEFF" + pkg({ name: "x", version: "1.0.0" }) });
    const { findings } = await analyzeProject(root);
    expect(severitiesOf(findings, "node.package-json-valid")).toEqual(["pass"]);
  });

  it("lists exactly which metadata fields are missing", async () => {
    const root = createProject({ "package.json": pkg({ version: "1.0.0", license: "  " }) });
    const { findings } = await analyzeProject(root);
    const [metadata] = byRule(findings, "node.metadata");

    expect(metadata.severity).toBe("warning");
    expect(metadata.title).toBe("package.json is missing: name, description, license");
  });

  it("passes when metadata is complete", async () => {
    const root = createProject({
      "package.json": pkg({ name: "x", version: "1.0.0", description: "d", license: "MIT" }),
    });
    const { findings } = await analyzeProject(root);
    expect(severitiesOf(findings, "node.metadata")).toEqual(["pass"]);
  });

  it("does not demand publishing metadata from a private app", async () => {
    const { findings } = await analyzeProject(createProject({ "package.json": pkg({ private: true }) }));
    expect(severitiesOf(findings, "node.metadata")).toEqual(["info"]);
  });

  it("warns when the test script is missing or still npm's placeholder", async () => {
    const missing = await analyzeProject(createProject({ "package.json": pkg({ name: "x" }) }));
    const placeholder = await analyzeProject(
      createProject({ "package.json": pkg({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }) }),
    );
    const real = await analyzeProject(createProject({ "package.json": pkg({ scripts: { test: "vitest run" } }) }));

    expect(byRule(missing.findings, "node.test-script")[0].title).toBe("No test script");
    expect(byRule(placeholder.findings, "node.test-script")[0].title).toBe("The test script is still the npm placeholder");
    expect(severitiesOf(real.findings, "node.test-script")).toEqual(["pass"]);
  });

  it("reports a missing engines.node as information, not a problem", async () => {
    const without = await analyzeProject(createProject({ "package.json": pkg({}) }));
    const withNode = await analyzeProject(createProject({ "package.json": pkg({ engines: { node: ">=20" } }) }));

    expect(severitiesOf(without.findings, "node.engines")).toEqual(["info"]);
    expect(severitiesOf(withNode.findings, "node.engines")).toEqual(["pass"]);
  });

  it("warns when a publishable package has no files list or .npmignore", async () => {
    const bad = await analyzeProject(createProject({ "package.json": pkg({ name: "x", main: "index.js" }) }));
    const withFiles = await analyzeProject(createProject({ "package.json": pkg({ main: "index.js", files: ["dist"] }) }));
    const withIgnore = await analyzeProject(createProject({ "package.json": pkg({ bin: "cli.js" }), ".npmignore": "tests" }));
    const privateApp = await analyzeProject(createProject({ "package.json": pkg({ private: true, main: "index.js" }) }));

    expect(severitiesOf(bad.findings, "node.publish-files")).toEqual(["warning"]);
    expect(severitiesOf(withFiles.findings, "node.publish-files")).toEqual(["pass"]);
    expect(severitiesOf(withIgnore.findings, "node.publish-files")).toEqual(["pass"]);
    expect(byRule(privateApp.findings, "node.publish-files")).toEqual([]);
  });

  it("warns about a package declared in both dependencies and devDependencies", async () => {
    const root = createProject({
      "package.json": pkg({ dependencies: { express: "^4", zod: "^3" }, devDependencies: { express: "^4" } }),
    });
    const { findings } = await analyzeProject(root);
    const [duplicate] = byRule(findings, "node.duplicate-dependencies");

    expect(duplicate.severity).toBe("warning");
    expect(duplicate.title).toContain("express");
    expect(duplicate.title).not.toContain("zod");
  });
});

describe("Node.js: lockfile", () => {
  it("warns when there is no lockfile", async () => {
    const { findings } = await analyzeProject(createProject({ "package.json": "{}" }));
    expect(severitiesOf(findings, "node.lockfile")).toEqual(["warning"]);
  });

  it("warns when two package managers left lockfiles", async () => {
    const root = createProject({ "package.json": "{}", "package-lock.json": "{}", "yarn.lock": "" });
    const { findings } = await analyzeProject(root);
    expect(byRule(findings, "node.lockfile")[0].title).toBe("Multiple lockfiles: package-lock.json, yarn.lock");
  });

  it("passes for one tracked lockfile, and for one lockfile when there is no Git", async () => {
    const tracked = await analyzeProject(createProject({ "package.json": "{}", "pnpm-lock.yaml": "" }, { git: true }));
    const noGit = await analyzeProject(createProject({ "package.json": "{}", "package-lock.json": "{}" }));

    expect(byRule(tracked.findings, "node.lockfile")[0].title).toBe("pnpm-lock.yaml found");
    expect(severitiesOf(noGit.findings, "node.lockfile")).toEqual(["pass"]);
  });

  it("warns when the lockfile exists but Git does not track it", async () => {
    const root = createProject({ "package.json": "{}" }, { git: true, untracked: { "package-lock.json": "{}" } });
    const { findings } = await analyzeProject(root);
    expect(byRule(findings, "node.lockfile")[0].title).toBe("package-lock.json is not tracked by Git");
  });
});

describe("Node.js: tests", () => {
  it.each([
    ["a tests folder", { "tests/app.js": "x" }],
    ["a __tests__ folder", { "src/__tests__/a.js": "x" }],
    ["a .test file", { "src/a.test.ts": "x" }],
    ["a .spec file", { "src/a.spec.jsx": "x" }],
  ])("recognizes %s", async (_label, files) => {
    const { findings } = await analyzeProject(createProject({ "package.json": "{}", ...files }));
    expect(severitiesOf(findings, "node.tests-exist")).toEqual(["pass"]);
  });

  it("does not count files inside a fixtures folder", async () => {
    const root = createProject({ "package.json": "{}", "tests/fixtures/sample/app.js": "x" });
    const { findings } = await analyzeProject(root);
    expect(severitiesOf(findings, "node.tests-exist")).toEqual(["warning"]);
  });
});

describe("Python: requirements.txt", () => {
  it("lists dependencies that have no version", async () => {
    const root = createProject({ "requirements.txt": "flask==3.0.0\nrequests\nnumpy  # math\n" });
    const { findings } = await analyzeProject(root);
    const [unpinned] = byRule(findings, "python.requirements-unpinned");

    expect(unpinned.severity).toBe("warning");
    expect(unpinned.title).toBe("2 dependencies have no version: requests, numpy");
  });

  it("uses singular wording for one dependency", async () => {
    const { findings } = await analyzeProject(createProject({ "requirements.txt": "requests\n" }));
    expect(byRule(findings, "python.requirements-unpinned")[0].title).toBe("1 dependency has no version: requests");
  });

  it("passes when everything has a version, ignoring comments, options and URLs", async () => {
    const root = createProject({
      "requirements.txt": "# deps\n-r base.txt\nflask==3.0.0\nrequests>=2.0\nmylib @ https://example.com/mylib.zip\n",
    });
    const { findings } = await analyzeProject(root);
    expect(severitiesOf(findings, "python.requirements-unpinned")).toEqual(["pass"]);
  });

  it("warns about an empty requirements.txt", async () => {
    const { findings } = await analyzeProject(createProject({ "requirements.txt": "# nothing yet\n\n" }));
    expect(severitiesOf(findings, "python.requirements-empty")).toEqual(["warning"]);
  });

  it("says nothing about requirements when the project uses only pyproject.toml", async () => {
    const { findings } = await analyzeProject(createProject({ "pyproject.toml": "[project]\nname='x'\n" }));
    expect(byRule(findings, "python.requirements-unpinned")).toEqual([]);
    expect(byRule(findings, "python.requirements-empty")).toEqual([]);
  });
});

describe("Python: version and tests", () => {
  it.each([
    [".python-version", { ".python-version": "3.12" }],
    ["runtime.txt", { "runtime.txt": "python-3.12.1" }],
    ["requires-python", { "pyproject.toml": 'requires-python = ">=3.10"' }],
    ["python_requires", { "setup.py": "setup(python_requires='>=3.9')" }],
    ["Pipfile", { Pipfile: "[requires]\npython_version = '3.12'" }],
  ])("accepts a version declared through %s", async (_label, files) => {
    const { findings } = await analyzeProject(createProject({ "requirements.txt": "flask==3.0.0", ...files }));
    expect(severitiesOf(findings, "python.version-declared")).toEqual(["pass"]);
  });

  it("reports an undeclared Python version as information", async () => {
    const { findings } = await analyzeProject(createProject({ "requirements.txt": "flask==3.0.0" }));
    expect(severitiesOf(findings, "python.version-declared")).toEqual(["info"]);
  });

  it.each([
    ["a tests folder", { "tests/helpers.py": "x" }],
    ["a test_ file", { "test_app.py": "x" }],
    ["a _test file", { "app_test.py": "x" }],
  ])("recognizes %s", async (_label, files) => {
    const { findings } = await analyzeProject(createProject({ "requirements.txt": "flask==3.0.0", ...files }));
    expect(severitiesOf(findings, "python.tests-exist")).toEqual(["pass"]);
  });

  it("warns when there are no tests, and ignores fixtures", async () => {
    const root = createProject({ "requirements.txt": "flask==3.0.0", "tests/fixtures/data.py": "x" });
    const { findings } = await analyzeProject(root);
    expect(severitiesOf(findings, "python.tests-exist")).toEqual(["warning"]);
  });
});

describe("ecosystem rules only run for detected ecosystems", () => {
  it("does not run Node rules on a Python project, or Python rules on a Node project", async () => {
    const python = await analyzeProject(createProject({ "requirements.txt": "flask==3.0.0" }));
    const node = await analyzeProject(createProject({ "package.json": "{}" }));

    expect(python.findings.some((f) => f.ruleId.startsWith("node."))).toBe(false);
    expect(node.findings.some((f) => f.ruleId.startsWith("python."))).toBe(false);
  });

  it("runs only universal rules on an unsupported project", async () => {
    const { findings } = await analyzeProject(createProject({ "main.c": "int main(){}" }));
    expect(findings.some((f) => f.ruleId.startsWith("node.") || f.ruleId.startsWith("python."))).toBe(false);
  });
});