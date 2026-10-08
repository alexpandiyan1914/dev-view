import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Asks Git which files are tracked. Read-only: `git ls-files` changes nothing.
 * Returns null if Git is missing or this is not a repository.
 */
export async function getTrackedFiles(root: string): Promise<string[] | null> {
  try {
    const { stdout } = await run("git", ["ls-files", "-z"], {
      cwd: root,
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout.split("\0").filter(Boolean);
  } catch {
    return null;
  }
}