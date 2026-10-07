import { existsSync, statSync } from "node:fs";
import { basename, resolve, join } from "node:path";
import type { ProjectContext } from "../types/result.js";

export function loadLocalProject(path: string = "."): ProjectContext {
  const rootPath = resolve(path);

  if (!existsSync(rootPath) || !statSync(rootPath).isDirectory()) {
    throw new Error(`Not a valid directory: ${rootPath}`);
  }

  return {
    rootPath,
    name: basename(rootPath),
    hasGit: existsSync(join(rootPath, ".git")),
  };
}