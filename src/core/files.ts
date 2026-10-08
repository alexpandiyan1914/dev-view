import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectContext } from "../types/result.js";

/** True if the project root contains a file with exactly this name. */
export function hasRootFile(ctx: ProjectContext, name: string): boolean {
  return ctx.files.some((f) => f.path === name);
}

/** Reads a root file as text. Returns null if it does not exist or cannot be read. */
export async function readRootFile(ctx: ProjectContext, name: string): Promise<string | null> {
  if (!hasRootFile(ctx, name)) return null;
  try {
    return await readFile(join(ctx.rootPath, name), "utf8");
  } catch {
    return null;
  }
}