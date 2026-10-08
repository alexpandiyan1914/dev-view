import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Finding, ProjectContext } from "../../types/result.js";

// Files like .env.example are meant to be committed, so they are safe.
const SAFE_ENDINGS = [".example", ".sample", ".template", ".dist"];

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

function isEnvFile(path: string): boolean {
  const name = fileName(path).toLowerCase();
  if (name !== ".env" && !name.startsWith(".env.")) return false;
  return !SAFE_ENDINGS.some((ending) => name.endsWith(ending));
}

export function checkEnvFiles(ctx: ProjectContext): Finding[] {
  // Without Git's list of tracked files we cannot say anything useful.
  if (ctx.trackedFiles === null) return [];

  const findings: Finding[] = [];
  const tracked = new Set(ctx.trackedFiles);

  for (const path of ctx.trackedFiles.filter(isEnvFile)) {
    findings.push({
      ruleId: "security.env-tracked",
      category: "Security",
      severity: "error",
      title: `${path} is tracked by Git`,
      message: `${path} is part of the repository`,
      why: "Anyone who can read the repository can read these values. Deleting the file later does not help, because it stays in Git history.",
      suggestion: `Run 'git rm --cached ${path}' and add it to .gitignore. Then rotate (replace) every secret inside it, because the old values may already be exposed.`,
    });
  }

  if (ctx.ignoredFiles) {
    for (const file of ctx.files) {
      if (isEnvFile(file.path) && !tracked.has(file.path) && !ctx.ignoredFiles.has(file.path)) {
        findings.push({
          ruleId: "security.env-not-ignored",
          category: "Security",
          severity: "warning",
          title: `${file.path} is not ignored by Git`,
          message: `${file.path} is untracked but .gitignore does not cover it`,
          why: "It is not committed yet, but a single 'git add .' would include it. That is how most .env leaks happen.",
          suggestion: `Add '${file.path}' to your .gitignore file.`,
        });
      }
    }
  }

  if (findings.length === 0) {
    findings.push({
      ruleId: "security.env-tracked",
      category: "Security",
      severity: "pass",
      title: "No environment files are tracked by Git",
      message: "No tracked or unprotected .env files found",
    });
  }
  return findings;
}

const KEY_FILE_NAME = /(\.(pem|key)$)|(^id_(rsa|dsa|ecdsa|ed25519)$)/i;
const PRIVATE_KEY_HEADER = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;
const MAX_KEY_FILE_BYTES = 256 * 1024;

export async function checkPrivateKeys(ctx: ProjectContext): Promise<Finding[]> {
  if (ctx.trackedFiles === null) return [];

  const sizes = new Map(ctx.files.map((f) => [f.path, f.size]));
  const findings: Finding[] = [];

  for (const path of ctx.trackedFiles) {
    if (!KEY_FILE_NAME.test(fileName(path))) continue;

    const size = sizes.get(path);
    if (size === undefined || size > MAX_KEY_FILE_BYTES) continue;

    try {
      // We look inside the file, so a public certificate (.pem) is not flagged.
      const text = await readFile(join(ctx.rootPath, path), "utf8");
      if (PRIVATE_KEY_HEADER.test(text)) {
        findings.push({
          ruleId: "security.private-key-tracked",
          category: "Security",
          severity: "error",
          title: `Private key is tracked by Git: ${path}`,
          message: `${path} contains a private key`,
          why: "A private key proves your identity to servers. Anyone who gets it can act as you, and it stays in Git history.",
          suggestion: `Run 'git rm --cached ${path}', add it to .gitignore, and replace the key, because the old one should be treated as compromised.`,
        });
      }
    } catch {
      // unreadable file: skip it
    }
  }

  if (findings.length === 0) {
    findings.push({
      ruleId: "security.private-key-tracked",
      category: "Security",
      severity: "pass",
      title: "No private keys are tracked by Git",
      message: "No tracked private key files found",
    });
  }
  return findings;
}