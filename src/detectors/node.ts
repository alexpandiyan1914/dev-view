import { readPackageJson, keysOf, type PackageJson } from "../core/package-json.js";
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

function dependencyNames(pkg: PackageJson): Set<string> {
  const names = new Set<string>();
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    for (const name of keysOf(pkg[field])) names.add(name);
  }
  return names;
}

export async function detectNode(ctx: ProjectContext): Promise<DetectedEcosystem | null> {
  const rootFiles = new Set(ctx.files.map((f) => f.path));
  if (!rootFiles.has("package.json")) return null;

  const technologies: Technology[] = [];
  const result = await readPackageJson(ctx.rootPath);
  const deps = result.ok ? dependencyNames(result.data) : new Set<string>();

  if (deps.has("typescript") || rootFiles.has("tsconfig.json")) {
    technologies.push({ id: "typescript", name: "TypeScript" });
  }
  for (const { dep, tech } of KNOWN_DEPENDENCIES) {
    if (deps.has(dep)) technologies.push(tech);
  }

  return { id: "node", name: "Node.js", evidence: ["package.json"], technologies };
}