#!/usr/bin/env node
/**
 * Package guard. Runs before every publish (see "prepublishOnly" in package.json) and in CI.
 *
 * It looks at what `npm pack` WOULD put in the package and stops the release if anything is off:
 * a missing file, a stray file, a leftover placeholder, a broken shebang, missing metadata.
 * Nothing is modified and nothing is uploaded.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const RELEASE = process.argv.includes("--release");
const REQUIRED_FILES = ["package.json", "README.md", "LICENSE", "CHANGELOG.md", "dist/cli.js"];
const MAX_UNPACKED_BYTES = 300 * 1024;

const failures = [];
const passes = [];
const check = (ok, passText, failText) => (ok ? passes : failures).push(ok ? passText : failText);

// ---- what would be published? ------------------------------------------------------------
let packed;
try {
  // `execSync` runs through the shell, so this also works on Windows (where npm is npm.cmd)
  const output = execSync("npm pack --dry-run --json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  packed = JSON.parse(output)[0];
} catch {
  console.error("✖ Could not run `npm pack --dry-run`. Did you run `npm run build` first?");
  process.exit(1);
}

const files = packed.files.map((f) => f.path.replaceAll("\\", "/"));

for (const required of REQUIRED_FILES) {
  check(files.includes(required), `${required} is in the package`, `${required} is MISSING from the package`);
}
const unexpected = files.filter((f) => !REQUIRED_FILES.includes(f));
check(
  unexpected.length === 0,
  "nothing unexpected is in the package",
  `unexpected files would be published: ${unexpected.join(", ")}`,
);
check(
  packed.unpackedSize <= MAX_UNPACKED_BYTES,
  `package is small (${(packed.unpackedSize / 1024).toFixed(0)} kB unpacked)`,
  `package is unexpectedly large (${(packed.unpackedSize / 1024).toFixed(0)} kB unpacked)`,
);

// ---- the command-line entry -----------------------------------------------------------------
if (files.includes("dist/cli.js")) {
  const firstLine = readFileSync("dist/cli.js", "utf8").split("\n")[0];
  check(
    firstLine === "#!/usr/bin/env node",
    "dist/cli.js starts with a clean shebang",
    `dist/cli.js first line is ${JSON.stringify(firstLine)}, expected "#!/usr/bin/env node" with no carriage return`,
  );
}

// ---- package.json metadata ------------------------------------------------------------------
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

check(/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(pkg.version ?? ""), `version ${pkg.version} is valid semver`, "version is not valid semver");
check(pkg.bin?.["dev-view"] === "./dist/cli.js", "bin points at dist/cli.js", 'bin["dev-view"] must be "./dist/cli.js"');
check(pkg.license === "MIT", "license is MIT", "license field is not MIT");
check(Boolean(pkg.engines?.node), `engines.node is ${pkg.engines?.node}`, "engines.node is missing");
check(
  typeof pkg.description === "string" && pkg.description.length >= 40 && pkg.description.length <= 300,
  "description has a sensible length",
  "description should be between 40 and 300 characters",
);
check(Array.isArray(pkg.keywords) && pkg.keywords.length >= 5, "keywords are set", "add at least 5 keywords");
check(Boolean(pkg.repository?.url && pkg.homepage && pkg.bugs?.url), "repository, homepage and bugs links are set", "repository, homepage or bugs.url is missing");
check(
  Object.keys(pkg.dependencies ?? {}).every((name) => !["vitest", "typescript", "tsup", "tsx"].includes(name)),
  "only runtime dependencies are listed under dependencies",
  "a build or test tool is listed under dependencies instead of devDependencies",
);

// ---- leftover placeholders ----------------------------------------------------------------------
const placeholder = /YOUR NAME|<your name>|TODO:/i;
for (const file of ["package.json", "LICENSE", "README.md", "CHANGELOG.md"]) {
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue; // already reported as missing above
  }
  check(!placeholder.test(text), `${file} has no leftover placeholder`, `${file} still contains a placeholder (YOUR NAME / TODO)`);
}

// ---- release-only checks (publishing cannot be undone) ---------------------------------------------
if (RELEASE) {
  const git = (args) => execSync(`git ${args}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

  try {
    const branch = git("rev-parse --abbrev-ref HEAD");
    check(branch === "main", "releasing from the main branch", `you are on "${branch}"; publish from main`);

    check(git("status --porcelain") === "", "no uncommitted changes", "there are uncommitted changes; commit or stash them first");

    let upstream = "";
    try {
      upstream = git("rev-parse @{u}");
    } catch {
      // no upstream configured
    }
    check(
      upstream !== "" && upstream === git("rev-parse HEAD"),
      "main matches the copy on GitHub",
      "main differs from GitHub (run `git pull`, or `git push` your commits) so you would publish code nobody can see",
    );
  } catch {
    failures.push("could not read the Git state; is this a Git repository?");
  }

  const changelog = readFileSync("CHANGELOG.md", "utf8");
  const heading = new RegExp(`^## \\[${pkg.version.replaceAll(".", "\\.")}\\] - \\d{4}-\\d{2}-\\d{2}\\s*$`, "m");
  check(
    heading.test(changelog),
    `CHANGELOG has a dated entry for ${pkg.version}`,
    `CHANGELOG.md needs a heading like "## [${pkg.version}] - YYYY-MM-DD" (not "Unreleased")`,
  );
}

// ---- report -----------------------------------------------------------------------------------------
for (const text of passes) console.log(`  ✔ ${text}`);
for (const text of failures) console.log(`  ✖ ${text}`);

if (failures.length > 0) {
  console.log(`\n${failures.length} problem(s) found. Fix them before publishing.`);
  process.exit(1);
}
console.log(`\nPackage looks good: ${files.length} files, ${(packed.size / 1024).toFixed(1)} kB packed.`);
