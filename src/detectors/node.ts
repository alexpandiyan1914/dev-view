import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DetectedEcosystem, ProjectContext, Technology } from "../types/result.js";

const KNOWN_DEPENDENCIES: Array<{ dep: string; tech: Technology }> = [
  { dep: "react", tech: { id: "react", name: "React" } },
  { dep: "react-native", tech: { id: "react-native", name: "React Native" } },
  { dep: "next", tech: { id: "nextjs", name: "Next.js" } },
  { dep: "vue", tech: { id: "vue", name: "Vue" } },
  { dep: "@angular/core", tech: { id: "angular", name: "Angular" } },
  { dep: "express", tech: { id: "express", name: "Express" } },
  { dep: "@nestjs/core", tech: { id: "nestjs", name: "NestJS" } },
];

async function readPackageJson(root: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null; // broken JSON must never crash detection
  }
}

function dependencyNames(pkg: Record<string, unknown>): Set<string> {
  const names = new Set<string>();
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const value = pkg[field];
    if (value && typeof value === "object") {
      for (const name of Object.keys(value)) names.add(name);
    }
  }
  return names;
}

export async function detectNode(ctx: ProjectContext): Promise<DetectedEcosystem | null> {
  const rootFiles = new Set(ctx.files.map((f) => f.path));
  if (!rootFiles.has("package.json")) return null;

  const technologies: Technology[] = [];
  const pkg = await readPackageJson(ctx.rootPath);
  const deps = pkg ? dependencyNames(pkg) : new Set<string>();

  if (deps.has("typescript") || rootFiles.has("tsconfig.json")) {
    technologies.push({ id: "typescript", name: "TypeScript" });
  }
  for (const { dep, tech } of KNOWN_DEPENDENCIES) {
    if (deps.has(dep)) technologies.push(tech);
  }

  return { id: "node", name: "Node.js", evidence: ["package.json"], technologies };
}