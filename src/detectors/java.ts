import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DetectedEcosystem, ProjectContext, Technology } from "../types/result.js";

const MAVEN_FILES = ["pom.xml"];
const GRADLE_FILES = ["build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"];
const MARKER_FILES = [...MAVEN_FILES, ...GRADLE_FILES];

// Only files that can list dependencies or plugins are searched for frameworks.
const DEPENDENCY_FILES = ["pom.xml", "build.gradle", "build.gradle.kts"];

// Text that appears in a build file when the project uses the framework.
const KNOWN_FRAMEWORKS: Array<{ needles: string[]; tech: Technology }> = [
  { needles: ["org.springframework.boot", "spring-boot-starter"], tech: { id: "spring-boot", name: "Spring Boot" } },
  { needles: ["io.quarkus"], tech: { id: "quarkus", name: "Quarkus" } },
  { needles: ["io.micronaut"], tech: { id: "micronaut", name: "Micronaut" } },
  {
    needles: ["com.android.application", "com.android.library", "com.android.tools.build"],
    tech: { id: "android", name: "Android" },
  },
];

/** Removes comments so that a framework that is only mentioned in a comment is not detected. */
function stripComments(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, "") // XML (pom.xml)
    .replace(/\/\*[\s\S]*?\*\//g, "") // Gradle block comments
    .split("\n")
    .filter((line) => !line.trim().startsWith("//")) // Gradle line comments (a URL's // is not at the start)
    .join("\n");
}

async function readBuildText(root: string, file: string): Promise<string> {
  try {
    return stripComments(await readFile(join(root, file), "utf8")).toLowerCase();
  } catch {
    return "";
  }
}

export async function detectJava(ctx: ProjectContext): Promise<DetectedEcosystem | null> {
  const rootFiles = new Set(ctx.files.map((f) => f.path));
  const evidence = MARKER_FILES.filter((f) => rootFiles.has(f));
  if (evidence.length === 0) return null;

  const technologies: Technology[] = [];
  if (MAVEN_FILES.some((f) => rootFiles.has(f))) technologies.push({ id: "maven", name: "Maven" });
  if (GRADLE_FILES.some((f) => rootFiles.has(f))) technologies.push({ id: "gradle", name: "Gradle" });

  const texts = await Promise.all(
    DEPENDENCY_FILES.filter((f) => rootFiles.has(f)).map((f) => readBuildText(ctx.rootPath, f)),
  );
  const combined = texts.join("\n");

  for (const { needles, tech } of KNOWN_FRAMEWORKS) {
    if (needles.some((needle) => combined.includes(needle))) technologies.push(tech);
  }

  return { id: "java", name: "Java", evidence, technologies };
}
