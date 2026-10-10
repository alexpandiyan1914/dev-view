import { afterAll, describe, expect, it } from "vitest";
import { scanDirectory } from "../src/core/scanner.js";
import { cleanupProjects, createProject } from "./helpers/project.js";

afterAll(cleanupProjects);

describe("scanDirectory", () => {
  it("lists files with forward-slash paths, sorted", async () => {
    const root = createProject({ "b.txt": "b", "src/deep/a.ts": "a", "a.txt": "a" });
    const { files, truncated } = await scanDirectory(root);

    expect(files.map((f) => f.path)).toEqual(["a.txt", "b.txt", "src/deep/a.ts"]);
    expect(truncated).toBe(false);
  });

  it("records file sizes", async () => {
    const root = createProject({ "hello.txt": "12345" });
    const { files } = await scanDirectory(root);
    expect(files[0]).toEqual({ path: "hello.txt", size: 5 });
  });

  it("never walks into node_modules, .git, venv folders or __pycache__", async () => {
    const root = createProject({
      "keep.txt": "x",
      "node_modules/pkg/index.js": "x",
      ".venv/lib/x.py": "x",
      "venv/lib/x.py": "x",
      "src/__pycache__/x.pyc": "x",
    });
    const { files } = await scanDirectory(root);
    expect(files.map((f) => f.path)).toEqual(["keep.txt"]);
  });

  it("skips .git contents in a real repository", async () => {
    const root = createProject({ "a.txt": "a" }, { git: true });
    const { files } = await scanDirectory(root);
    expect(files.map((f) => f.path)).toEqual(["a.txt"]);
  });

  it("stops at the limit and says so", async () => {
    const root = createProject({ "1.txt": "1", "2.txt": "2", "3.txt": "3", "4.txt": "4" });
    const { files, truncated } = await scanDirectory(root, 2);

    expect(files).toHaveLength(2);
    expect(truncated).toBe(true);
  });

  it("handles an empty folder", async () => {
    const root = createProject({});
    expect(await scanDirectory(root)).toEqual({ files: [], truncated: false });
  });
});