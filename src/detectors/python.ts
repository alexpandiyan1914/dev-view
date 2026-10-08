import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DetectedEcosystem, ProjectContext, Technology } from "../types/result.js";

const MARKER_FILES = ["requirements.txt", "pyproject.toml", "setup.py", "Pipfile"];
const DEPENDENCY_FILES = ["requirements.txt", "pyproject.toml", "Pipfile"];

const KNOWN_PACKAGES: Array<{ pkg: string; tech: Technology }> = [
  { pkg: "fastapi", tech: { id: "fastapi", name: "FastAPI" } },
  { pkg: "flask", tech: { id: "flask", name: "Flask" } },
  { pkg: "django", tech: { id: "django", name: "Django" } },
];

/** True if `name` appears as a whole package name ("flask" matches, "flask-cors" does not). */
function mentionsPackage(text: string, name: string): boolean {
  const pattern = new RegExp(`(^|[^a-z0-9_.-])${name}(?![a-z0-9_.-])`, "m");
  return pattern.test(text);
}

async function readText(root: string, file: string): Promise<string> {
  try {
    const text = await readFile(join(root, file), "utf8");
    return text
      .toLowerCase()
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
  } catch {
    return "";
  }
}

export async function detectPython(ctx: ProjectContext): Promise<DetectedEcosystem | null> {
  const rootFiles = new Set(ctx.files.map((f) => f.path));
  const evidence = MARKER_FILES.filter((f) => rootFiles.has(f));
  if (evidence.length === 0) return null;

  const texts = await Promise.all(
    DEPENDENCY_FILES.filter((f) => rootFiles.has(f)).map((f) => readText(ctx.rootPath, f)),
  );
  const combined = texts.join("\n");

  const technologies = KNOWN_PACKAGES.filter(({ pkg }) => mentionsPackage(combined, pkg)).map(
    ({ tech }) => tech,
  );

  return { id: "python", name: "Python", evidence, technologies };
}