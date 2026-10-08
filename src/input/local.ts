import { existsSync, statSync } from "node:fs";
import { basename, resolve, join } from "node:path";
import type { ProjectContext } from "../types/result.js";
import { scanDirectory } from "../core/scanner.js";
import { getTrackedFiles } from "./git.js";

export async function loadLocalProject(path: string = "."): Promise<ProjectContext> {
  const rootPath = resolve(path);

  if (!existsSync(rootPath) || !statSync(rootPath).isDirectory()) {
    throw new Error(`Not a valid directory: ${rootPath}`);
  }

  const hasGit = existsSync(join(rootPath, ".git"));

  // Scanning the disk and asking Git are independent, so run them together.
  const [{ files, truncated }, trackedFiles] = await Promise.all([
    scanDirectory(rootPath),
    hasGit ? getTrackedFiles(rootPath) : Promise.resolve(null),
  ]);

  return { rootPath, name: basename(rootPath), hasGit, files, trackedFiles, truncated };
}