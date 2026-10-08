// Creates two real Git repositories in your temp folder for testing Dev View:
//   leaky: full of problems that Dev View should find
//   clean: a healthy project where everything should pass
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

const base = join(tmpdir(), "dev-view-tests");
rmSync(base, { recursive: true, force: true });

function git(cwd, ...args) {
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args], {
    cwd,
    stdio: "ignore",
  });
}

function write(repo, file, content) {
  const target = join(repo, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function makeRepo(name, files) {
  const repo = join(base, name);
  mkdirSync(repo, { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  for (const [file, content] of Object.entries(files)) write(repo, file, content);
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "initial commit");
  return repo;
}

// A FAKE key: it has the header Dev View looks for, but it is not a real key.
const fakeKey =
  "-----BEGIN OPENSSH PRIVATE KEY-----\nTHIS-IS-NOT-A-REAL-KEY\n-----END OPENSSH PRIVATE KEY-----\n";

const leaky = makeRepo("leaky", {
  ".env": "API_KEY=not-a-real-secret\n",
  ".env.example": "API_KEY=\n",
  id_rsa: fakeKey,
  "node_modules/left-pad/index.js": "module.exports = () => {};\n",
  "dist/app.js": "console.log('built');\n",
  "src/index.js": "console.log('hello');\n",
  "assets/demo.bin": Buffer.alloc(60 * 1024 * 1024), // 60 MiB of zeros
});
// Created AFTER the commit: untracked, and no .gitignore protects it.
write(leaky, ".env.local", "DB_PASSWORD=not-a-real-password\n");

const clean = makeRepo("clean", {
  "README.md": "# Clean project\n",
  LICENSE: "MIT License\n",
  ".gitignore": ".env\nnode_modules/\ndist/\n",
  ".env.example": "API_KEY=\n",
  "src/index.js": "console.log('hello');\n",
});
// Present on disk but protected by .gitignore, so this is fine.
write(clean, ".env", "API_KEY=not-a-real-secret\n");
write(clean, "dist/app.js", "console.log('built');\n");

console.log("Created:");
console.log("  " + leaky);
console.log("  " + clean);