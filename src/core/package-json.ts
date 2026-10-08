import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type PackageJson = Record<string, unknown>;
export type PackageJsonResult = { ok: true; data: PackageJson } | { ok: false };

/** Reads and parses package.json. Broken or unreadable JSON gives { ok: false }, never a crash. */
export async function readPackageJson(root: string): Promise<PackageJsonResult> {
  try {
    const text = await readFile(join(root, "package.json"), "utf8");
    const parsed: unknown = JSON.parse(text.replace(/^\uFEFF/, ""));
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return { ok: true, data: parsed as PackageJson };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

/** The keys of an object-like value, or an empty list for anything else. */
export function keysOf(value: unknown): string[] {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];
}