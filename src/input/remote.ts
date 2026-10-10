import { execFile } from "node:child_process";
import { rmSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ProjectContext } from "../types/result.js";
import { onInterrupt } from "../core/interrupt.js";
import { loadLocalProject } from "./local.js";

const run = promisify(execFile);
const CLONE_TIMEOUT_MS = 120_000;

/** A problem with a remote repository, written so the user knows what to do next. */
export class RemoteError extends Error {
  constructor(
    readonly title: string,
    readonly details: string,
    readonly suggestion: string,
  ) {
    super(title);
  }
}

export interface RepoRef {
  cloneUrl: string;
  displayUrl: string;
  name: string;
}

const EXAMPLE = "Use the full address, for example https://github.com/user/project";
const SEGMENT = /^[A-Za-z0-9._-]+$/;

function invalidUrl(details: string): RemoteError {
  return new RemoteError("Invalid repository URL", details, EXAMPLE);
}

/**
 * Checks the URL the user typed and turns it into a safe clone address.
 * This runs BEFORE anything touches the network or the disk.
 */
export function parseRepoUrl(input: string): RepoRef {
  const text = input.trim();

  // SSH style: git@github.com:user/project.git
  if (/^[\w.-]+@[\w.-]+:/.test(text)) {
    throw new RemoteError(
      "Unsupported repository URL",
      "SSH addresses need your private key, so they are not supported.",
      EXAMPLE,
    );
  }

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw invalidUrl(`"${text}" is not a valid web address.`);
  }

  if (url.protocol !== "https:") {
    throw new RemoteError(
      "Unsupported repository URL",
      `Only https:// addresses are supported, but this one uses "${url.protocol.replace(":", "")}://".`,
      EXAMPLE,
    );
  }

  if (url.username || url.password) {
    throw new RemoteError(
      "Credentials in the URL are not allowed",
      "A username or password inside a URL can leak into logs and process lists.",
      "Remove them from the address. Dev View analyzes repositories that anyone can clone.",
    );
  }

  const isGitHub = url.hostname === "github.com" || url.hostname === "www.github.com";
  let segments = url.pathname.split("/").filter(Boolean);

  // Browser links like github.com/user/project/tree/main/src: keep only owner and repo.
  if (isGitHub) segments = segments.slice(0, 2);

  if (segments.length < 2) {
    throw invalidUrl("The address must include the owner and the repository name.");
  }

  const last = segments.length - 1;
  segments[last] = segments[last].replace(/\.git$/i, "");

  if (!segments.every((part) => SEGMENT.test(part) && part !== "." && part !== "..")) {
    throw invalidUrl("The repository path contains unusual characters.");
  }

  const host = url.hostname === "www.github.com" ? "github.com" : url.host;
  const displayUrl = `https://${host}/${segments.join("/")}`;

  return { cloneUrl: `${displayUrl}.git`, displayUrl, name: segments[last] };
}

/** Turns Git's raw error output into a clear, actionable message. */
export function explainCloneFailure(error: unknown): RemoteError {
  const err = error as { code?: unknown; killed?: boolean; signal?: string; stderr?: string };

  if (err.code === "ENOENT") {
    return new RemoteError(
      "Git is not installed",
      "Dev View needs the 'git' command to fetch repositories.",
      "Install Git from https://git-scm.com, then open a new terminal and try again.",
    );
  }

  if (err.killed || err.signal === "SIGTERM") {
    return new RemoteError(
      "The repository took too long to fetch",
      `Fetching did not finish within ${CLONE_TIMEOUT_MS / 1000} seconds. The repository may be very large, or your connection slow.`,
      "Try again on a faster connection, or clone it yourself and run 'dev-view local' on the folder.",
    );
  }

  const stderr = (err.stderr ?? "").toLowerCase();

  if (/repository .*not found|could not read username|authentication failed|returned error: (401|403|404)|terminal prompts disabled/.test(stderr)) {
    return new RemoteError(
      "Unable to access repository",
      "The repository may be private, unavailable, or the URL may be incorrect.",
      "Check the spelling of the URL and open it in a browser. For a private repository, clone it yourself and run 'dev-view local' on the folder.",
    );
  }

  if (/could not resolve host|failed to connect|connection (timed out|reset|refused)|network is unreachable|timed out|ssl|tls|proxy/.test(stderr)) {
    return new RemoteError(
      "Network problem while fetching",
      "Dev View could not reach the Git host.",
      "Check your internet connection (and any proxy or VPN), then try again.",
    );
  }

  const lastLine = (err.stderr ?? "").trim().split("\n").pop() ?? "unknown error";
  return new RemoteError(
    "Could not fetch the repository",
    `Git reported: ${lastLine}`,
    "Check the URL, or clone the repository yourself and run 'dev-view local' on the folder.",
  );
}

async function cloneRepository(cloneUrl: string, target: string): Promise<void> {
  try {
    await run(
      "git",
      [
        "-c", "credential.helper=", // never open a login window or read saved passwords
        "-c", "core.longpaths=true", // Windows: allow very long file paths
        "clone",
        "--depth", "1", // only the latest snapshot, not the whole history
        "--quiet",
        "--", // everything after this is data, never an option
        cloneUrl,
        target,
      ],
      {
        timeout: CLONE_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0", // fail instead of asking for a username
          GIT_LFS_SKIP_SMUDGE: "1", // do not download big Git LFS files
        },
      },
    );
  } catch (error) {
    throw explainCloneFailure(error);
  }
}

export interface RemoteProject {
  ctx: ProjectContext;
  /** Deletes the temporary copy. Always call it when you are done. */
  cleanup: () => Promise<void>;
}

/** Clones the repository into a temp folder and builds the same ProjectContext local mode builds. */
export async function fetchRemoteProject(repo: RepoRef): Promise<RemoteProject> {
  const tempDir = await mkdtemp(join(tmpdir(), "dev-view-"));

  // If the user presses Ctrl+C mid-clone, do not leave the temp folder behind.
  const unregister = onInterrupt(() => rmSync(tempDir, { recursive: true, force: true }));

  const cleanup = async (): Promise<void> => {
    unregister();
    await rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
  };

  try {
    await cloneRepository(repo.cloneUrl, tempDir);
    const ctx = await loadLocalProject(tempDir, repo.name);

    if (ctx.trackedFiles !== null && ctx.trackedFiles.length === 0) {
      throw new RemoteError(
        "The repository is empty",
        "It has no files to analyze yet.",
        "Make a first commit with some files, then run Dev View again.",
      );
    }
    return { ctx, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}