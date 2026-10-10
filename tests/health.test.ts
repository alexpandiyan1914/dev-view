import { afterAll, describe, expect, it } from "vitest";
import { validateFinding } from "../src/core/rule.js";
import { analyzeProject, cleanupProjects, createProject, fixturePath, MIB, type Files } from "./helpers/project.js";

afterAll(cleanupProjects);

const HEALTHY_NODE: Files = {
  "README.md": "# Healthy",
  LICENSE: "MIT License",
  ".gitignore": "node_modules/\ndist/\n.env\n",
  "package.json": JSON.stringify({
    name: "healthy",
    version: "1.0.0",
    description: "A healthy project",
    license: "MIT",
    main: "dist/index.js",
    files: ["dist"],
    engines: { node: ">=20" },
    scripts: { test: "vitest run" },
  }),
  "package-lock.json": "{}",
  "src/index.js": "export {};",
  "tests/index.test.js": "// test",
};

const HEALTHY_PYTHON: Files = {
  "README.md": "# Healthy",
  LICENSE: "MIT License",
  ".gitignore": "__pycache__/\n.venv/\n.env\n",
  "requirements.txt": "flask==3.0.0\n",
  "pyproject.toml": '[project]\nrequires-python = ">=3.10"\n',
  "app.py": "print('hi')",
  "tests/test_app.py": "def test_ok(): pass",
};

const LEAKY: Files = {
  ".env": "API_KEY=not-a-real-secret",
  ".env.example": "API_KEY=",
  id_rsa: "-----BEGIN OPENSSH PRIVATE KEY-----\nNOT-A-REAL-KEY\n",
  "node_modules/left-pad/index.js": "x",
  "dist/app.js": "x",
  "src/index.js": "x",
};

/**
 * Every kind of project the PRD asks us to cover: healthy, broken, missing files,
 * no Git, unsupported, large files, tracked secrets.
 */
const SCENARIOS: Record<string, () => string> = {
  "healthy Node.js project": () => createProject(HEALTHY_NODE, { git: true }),
  "healthy Python project": () => createProject(HEALTHY_PYTHON, { git: true }),
  "broken Node.js project (invalid package.json)": () => createProject({ "package.json": "{ nope" }, { git: true }),
  "broken Python project (empty requirements)": () => createProject({ "requirements.txt": "" }, { git: true }),
  "project with tracked secrets and generated folders": () =>
    createProject(LEAKY, { git: true, untracked: { ".env.local": "A=1" } }),
  "project with a huge tracked file": () => createProject({ "a.txt": "a" }, { git: true, sparse: { "huge.bin": 120 * MIB } }),
  "project without Git": () => createProject({ "README.md": "# hi", ".env": "A=1" }),
  "unsupported project": () => createProject({ "main.c": "int main(){}" }, { git: true }),
  "unsupported committed fixture": () => fixturePath("unsupported"),
  "empty folder": () => createProject({}),
  "Git repository with no files": () => createProject({}, { git: true }),
  "mixed Node.js and Python project": () =>
    createProject({ "package.json": "{}", "requirements.txt": "flask==3.0.0" }, { git: true }),
};

describe.each(Object.entries(SCENARIOS))("%s", (_name, build) => {
  it("never crashes and never trips an internal check", async () => {
    const { findings } = await analyzeProject(build());

    const internal = findings.filter((f) => f.category === "Internal");
    expect(internal).toEqual([]);
  });

  it("gives every finding a complete, well-formed shape", async () => {
    const { findings } = await analyzeProject(build());

    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(validateFinding(finding), `${finding.ruleId}: ${finding.title}`).toEqual([]);
    }
  });

  it("produces a score between 0 and 100", async () => {
    const { score } = await analyzeProject(build());
    expect(score.value).toBeGreaterThanOrEqual(0);
    expect(score.value).toBeLessThanOrEqual(100);
  });
});

describe("expected scores", () => {
  it("gives a healthy Node.js project a perfect score", async () => {
    const { score, findings } = await analyzeProject(createProject(HEALTHY_NODE, { git: true }));
    expect(findings.filter((f) => f.severity === "warning" || f.severity === "error")).toEqual([]);
    expect(score.value).toBe(100);
  });

  it("gives a healthy Python project a perfect score", async () => {
    const { score } = await analyzeProject(createProject(HEALTHY_PYTHON, { git: true }));
    expect(score.value).toBe(100);
  });

  it("scores the leaky project 55 (3 errors, 5 warnings)", async () => {
    const root = createProject(LEAKY, { git: true, untracked: { ".env.local": "A=1" } });
    const { score } = await analyzeProject(root);

    expect(score.errors).toBe(3);
    expect(score.warnings).toBe(5); // no README, no LICENSE, no .gitignore, .env.local, dist/
    expect(score.value).toBe(55); // 100 - 3 x 10 - 5 x 3
  });

  it("finds the same problems on every run (deterministic)", async () => {
    const root = createProject(LEAKY, { git: true });
    const first = await analyzeProject(root);
    const second = await analyzeProject(root);

    expect(second.findings).toEqual(first.findings);
    expect(second.score).toEqual(first.score);
  });
});