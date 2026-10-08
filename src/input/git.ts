import { execFile, spawn } from "node:child_process";
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

/**
 * Asks Git which of the given paths are covered by .gitignore.
 * Paths go in through stdin because a long list would not fit on the command line.
 * Returns null if Git could not answer.
 */
export function getIgnoredFiles(root: string, paths: string[]): Promise<Set<string> | null> {
  if (paths.length === 0) return Promise.resolve(new Set());

  return new Promise((resolve) => {
    const child = spawn("git", ["check-ignore", "-z", "--stdin"], { cwd: root });
    let output = "";

    child.stdout.on("data", (chunk) => (output += chunk));
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      // Exit code 0 = some paths ignored, 1 = none ignored. Anything else is a real error.
      if (code === 0 || code === 1) resolve(new Set(output.split("\0").filter(Boolean)));
      else resolve(null);
    });

    child.stdin.on("error", () => {});
    child.stdin.end(paths.join("\0") + "\0");
  });
}