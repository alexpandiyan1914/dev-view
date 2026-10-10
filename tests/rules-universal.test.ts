import { afterAll, describe, expect, it } from "vitest";
import { analyzeProject, byRule, cleanupProjects, createProject, MIB, severitiesOf } from "./helpers/project.js";

afterAll(cleanupProjects);

const FAKE_PRIVATE_KEY = "-----BEGIN OPENSSH PRIVATE KEY-----\nNOT-A-REAL-KEY\n-----END OPENSSH PRIVATE KEY-----\n";
const PUBLIC_CERT = "-----BEGIN CERTIFICATE-----\nNOT-A-REAL-CERT\n-----END CERTIFICATE-----\n";

describe("documentation rules", () => {
  it("accepts README and LICENSE in common spellings", async () => {
    const root = createProject({ "readme.md": "# hi", COPYING: "license text" });
    const { findings } = await analyzeProject(root);

    expect(severitiesOf(findings, "docs.readme-exists")).toEqual(["pass"]);
    expect(severitiesOf(findings, "docs.license-exists")).toEqual(["pass"]);
  });

  it("warns, with why and suggestion, when both are missing", async () => {
    const { findings } = await analyzeProject(createProject({ "main.c": "int main(){}" }));
    const [readme] = byRule(findings, "docs.readme-exists");

    expect(readme.severity).toBe("warning");
    expect(readme.why).toBeTruthy();
    expect(readme.suggestion).toBeTruthy();
    expect(severitiesOf(findings, "docs.license-exists")).toEqual(["warning"]);
  });

  it("does not count a README inside a subfolder", async () => {
    const { findings } = await analyzeProject(createProject({ "docs/README.md": "# hi" }));
    expect(severitiesOf(findings, "docs.readme-exists")).toEqual(["warning"]);
  });
});

describe("Git rules", () => {
  it("warns when the folder is not a Git repository", async () => {
    const { findings } = await analyzeProject(createProject({ "a.txt": "a" }));
    expect(severitiesOf(findings, "git.repository-exists")).toEqual(["warning"]);
  });

  it("stays silent about tracked-file rules when there is no Git", async () => {
    const { findings } = await analyzeProject(createProject({ ".env": "SECRET=1" }));

    expect(byRule(findings, "security.env-tracked")).toEqual([]);
    expect(byRule(findings, "artifacts.generated-tracked")).toEqual([]);
    expect(byRule(findings, "artifacts.large-file")).toEqual([]);
  });

  it("passes for a Git repository and checks .gitignore separately", async () => {
    const withIgnore = await analyzeProject(createProject({ ".gitignore": "dist/" }, { git: true }));
    const without = await analyzeProject(createProject({ "a.txt": "a" }, { git: true }));

    expect(severitiesOf(withIgnore.findings, "git.repository-exists")).toEqual(["pass"]);
    expect(severitiesOf(withIgnore.findings, "git.gitignore-exists")).toEqual(["pass"]);
    expect(severitiesOf(without.findings, "git.gitignore-exists")).toEqual(["warning"]);
  });
});

describe("environment file rules", () => {
  it("raises an error for a tracked .env, including nested ones", async () => {
    const root = createProject({ ".env": "A=1", "apps/web/.env.production": "B=2" }, { git: true });
    const { findings } = await analyzeProject(root);
    const errors = byRule(findings, "security.env-tracked").filter((f) => f.severity === "error");

    expect(errors.map((f) => f.title)).toEqual([
      ".env is tracked by Git",
      "apps/web/.env.production is tracked by Git",
    ]);
    expect(errors[0].suggestion).toContain("rotate");
  });

  it("does not flag .env.example, .env.sample or .env.template", async () => {
    const root = createProject({ ".env.example": "A=", ".env.sample": "A=", ".env.template": "A=" }, { git: true });
    const { findings } = await analyzeProject(root);
    expect(severitiesOf(findings, "security.env-tracked")).toEqual(["pass"]);
  });

  it("warns about an untracked .env that .gitignore does not cover", async () => {
    const root = createProject({ "a.txt": "a" }, { git: true, untracked: { ".env.local": "A=1" } });
    const { findings } = await analyzeProject(root);

    expect(severitiesOf(findings, "security.env-not-ignored")).toEqual(["warning"]);
    expect(byRule(findings, "security.env-not-ignored")[0].title).toBe(".env.local is not ignored by Git");
  });

  it("is happy when .env exists but .gitignore protects it", async () => {
    const root = createProject({ ".gitignore": ".env\n" }, { git: true, untracked: { ".env": "A=1" } });
    const { findings } = await analyzeProject(root);

    expect(byRule(findings, "security.env-not-ignored")).toEqual([]);
    expect(severitiesOf(findings, "security.env-tracked")).toEqual(["pass"]);
  });
});

describe("private key rule", () => {
  it("raises an error for a tracked private key, by file content", async () => {
    const root = createProject({ id_rsa: FAKE_PRIVATE_KEY, "certs/server.key": "-----BEGIN PRIVATE KEY-----\nx\n" }, { git: true });
    const { findings } = await analyzeProject(root);
    const errors = byRule(findings, "security.private-key-tracked");

    expect(errors.map((f) => f.severity)).toEqual(["error", "error"]);
  });

  it("finds a private key that comes after a certificate in the same .pem file", async () => {
    const root = createProject({ "bundle.pem": PUBLIC_CERT + FAKE_PRIVATE_KEY }, { git: true });
    const { findings } = await analyzeProject(root);
    expect(severitiesOf(findings, "security.private-key-tracked")).toEqual(["error"]);
  });

  it("does not flag a public certificate", async () => {
    const root = createProject({ "ca.pem": PUBLIC_CERT }, { git: true });
    const { findings } = await analyzeProject(root);
    expect(severitiesOf(findings, "security.private-key-tracked")).toEqual(["pass"]);
  });

  it("ignores key-named files that are not tracked", async () => {
    const root = createProject({ "a.txt": "a" }, { git: true, untracked: { id_rsa: FAKE_PRIVATE_KEY } });
    const { findings } = await analyzeProject(root);
    expect(severitiesOf(findings, "security.private-key-tracked")).toEqual(["pass"]);
  });
});

describe("tracked generated folders", () => {
  it("raises an error for tracked node_modules and a warning for dist", async () => {
    const root = createProject(
      { "node_modules/a/index.js": "x", "node_modules/b/index.js": "x", "dist/app.js": "x", "src/index.js": "x" },
      { git: true },
    );
    const { findings } = await analyzeProject(root);
    const found = byRule(findings, "artifacts.generated-tracked");

    expect(found.map((f) => [f.title, f.severity])).toEqual([
      ["dist/ is tracked by Git (1 file)", "warning"],
      ["node_modules/ is tracked by Git (2 files)", "error"],
    ]);
  });

  it("reports nested generated folders under their own path", async () => {
    const root = createProject({ "packages/a/node_modules/x.js": "x" }, { git: true });
    const { findings } = await analyzeProject(root);
    expect(byRule(findings, "artifacts.generated-tracked")[0].title).toContain("packages/a/node_modules/");
  });

  it("does not treat a FILE named build as a generated folder", async () => {
    const root = createProject({ build: "#!/bin/sh", "tools/dist": "a file, not a folder" }, { git: true });
    const { findings } = await analyzeProject(root);
    expect(severitiesOf(findings, "artifacts.generated-tracked")).toEqual(["pass"]);
  });

  it("ignores generated folders that are properly ignored", async () => {
    const root = createProject({ ".gitignore": "dist/\n" }, { git: true, untracked: { "dist/app.js": "x" } });
    const { findings } = await analyzeProject(root);
    expect(severitiesOf(findings, "artifacts.generated-tracked")).toEqual(["pass"]);
  });
});

describe("large file rule", () => {
  it("passes just under 50 MiB, warns at 50 MiB, errors at 100 MiB", async () => {
    const root = createProject(
      { "a.txt": "a" },
      { git: true, sparse: { "small.bin": 49 * MIB, "medium.bin": 60 * MIB, "huge.bin": 101 * MIB } },
    );
    const { findings } = await analyzeProject(root);
    const found = byRule(findings, "artifacts.large-file");

    expect(found.map((f) => [f.title, f.severity])).toEqual([
      ["Large file: huge.bin (101 MiB)", "error"],
      ["Large file: medium.bin (60 MiB)", "warning"],
    ]);
  });

  it("ignores big files that Git does not track", async () => {
    const root = createProject({ "a.txt": "a" }, { git: true, untrackedSparse: { "big.bin": 80 * MIB } });
    const { findings } = await analyzeProject(root);
    expect(severitiesOf(findings, "artifacts.large-file")).toEqual(["pass"]);
  });

  it("lists at most 10 large files and counts the rest", async () => {
    const sparse = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`big${i}.bin`, 50 * MIB]));
    const root = createProject({ "a.txt": "a" }, { git: true, sparse });
    const { findings } = await analyzeProject(root);
    const found = byRule(findings, "artifacts.large-file");

    expect(found).toHaveLength(11);
    expect(found[10].severity).toBe("info");
    expect(found[10].title).toBe("...and 1 more large file");
  });
});