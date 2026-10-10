import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { FileEntry } from "../types/result.js";

const SKIP_DIRS = new Set([".git", "node_modules", ".venv", "venv", "__pycache__"]);
const MAX_FILES = 20_000;

export interface ScanResult {
  files: FileEntry[];
  truncated: boolean;
}

export async function scanDirectory(root: string, maxFiles: number = MAX_FILES): Promise<ScanResult> {
  const files: FileEntry[] = [];
  let truncated = false;

  async function walk(absDir: string, relDir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) {
        truncated = true;
        return;
      }

      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      const abs = join(absDir, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(abs, rel);
      } else if (entry.isFile()) {
        try {
          const info = await stat(abs);
          files.push({ path: rel, size: info.size });
        } catch {

        }
      }
    }
  }

  await walk(root, "");
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, truncated };
}