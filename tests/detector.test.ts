import { afterAll, describe, expect, it } from "vitest";
import { detectProject } from "../src/detectors/index.js";
import { loadLocalProject } from "../src/input/local.js";
import { cleanupProjects, createProject, fixturePath } from "./helpers/project.js";

afterAll(cleanupProjects);

async function detect(root: string) {
  return (await detectProject(await loadLocalProject(root))).ecosystems;
}

const names = (items: { name: string }[]) => items.map((i) => i.name);

describe("detection on the committed fixtures", () => {
  it("finds Node.js, TypeScript and React", async () => {
    const [node] = await detect(fixturePath("node-react-ts"));
    expect(node.id).toBe("node");
    expect(node.evidence).toEqual(["package.json"]);
    expect(names(node.technologies)).toEqual(["TypeScript", "React"]);
  });

  it("finds Python and FastAPI, but not Flask (flask-cors is a different package)", async () => {
    const [python] = await detect(fixturePath("python-fastapi"));
    expect(python.id).toBe("python");
    expect(names(python.technologies)).toEqual(["FastAPI"]);
  });

  it("still detects Node.js when package.json is broken", async () => {
    const [node] = await detect(fixturePath("broken-node"));
    expect(node.id).toBe("node");
    expect(node.technologies).toEqual([]);
  });

  it("detects nothing in an unsupported project", async () => {
    expect(await detect(fixturePath("unsupported"))).toEqual([]);
  });
});

describe("Node.js detection details", () => {
  it("detects TypeScript from tsconfig.json alone", async () => {
    const root = createProject({ "package.json": "{}", "tsconfig.json": "{}" });
    const [node] = await detect(root);
    expect(names(node.technologies)).toEqual(["TypeScript"]);
  });

  it("reads devDependencies and peerDependencies too", async () => {
    const root = createProject({
      "package.json": JSON.stringify({ devDependencies: { vue: "^3" }, peerDependencies: { express: "^4" } }),
    });
    const [node] = await detect(root);
    expect(names(node.technologies)).toEqual(["Vue", "Express"]);
  });

  it("ignores a package.json whose content is not an object", async () => {
    const root = createProject({ "package.json": "[1, 2, 3]" });
    const [node] = await detect(root);
    expect(node.technologies).toEqual([]);
  });

  it("handles a package.json saved with a hidden BOM character", async () => {
    const root = createProject({ "package.json": "\uFEFF" + JSON.stringify({ dependencies: { react: "^18" } }) });
    const [node] = await detect(root);
    expect(names(node.technologies)).toEqual(["React"]);
  });
});

describe("Python detection details", () => {
  it("matches package names case-insensitively and with version specifiers", async () => {
    const root = createProject({ "requirements.txt": "Flask==3.0.0\nDjango>=4.2\n" });
    const [python] = await detect(root);
    expect(names(python.technologies)).toEqual(["Flask", "Django"]);
  });

  it("ignores packages that appear only in comments", async () => {
    const root = createProject({ "requirements.txt": "# flask is great\nrequests==2.0\n" });
    const [python] = await detect(root);
    expect(python.technologies).toEqual([]);
  });

  it("reads dependencies from pyproject.toml", async () => {
    const root = createProject({ "pyproject.toml": '[project]\ndependencies = ["fastapi>=0.110"]\n' });
    const [python] = await detect(root);
    expect(names(python.technologies)).toEqual(["FastAPI"]);
  });

  it("lists every marker file as evidence", async () => {
    const root = createProject({ "requirements.txt": "", "setup.py": "" });
    const [python] = await detect(root);
    expect(python.evidence).toEqual(["requirements.txt", "setup.py"]);
  });
});

describe("mixed and empty projects", () => {
  it("detects several ecosystems in one project", async () => {
    const root = createProject({ "package.json": "{}", "requirements.txt": "flask==3.0.0" });
    expect((await detect(root)).map((e) => e.id)).toEqual(["node", "python"]);
  });

  it("detects nothing in an empty folder", async () => {
    expect(await detect(createProject({}))).toEqual([]);
  });
});