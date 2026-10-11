# Contributing to Dev View

Thank you for wanting to help. Dev View is small on purpose, and every contribution, from a typo fix
to a new check, makes it better. This guide gets you from zero to a pull request.

## Set up

You need Node.js 22.12 or newer and Git.

```bash
git clone https://github.com/<your-username>/dev-view.git
cd dev-view
npm install
npm test
```

If `npm test` is green, you are ready. Useful commands:

| Command | What it does |
| --- | --- |
| `npm run dev -- local .` | Run the CLI from the TypeScript source. |
| `npm test` / `npm run test:watch` | Run the tests once / whenever you save. |
| `npm run typecheck` | Type-check the source and the tests. |
| `npm run build` | Build `dist/cli.js`. |
| `npm run check:package` | Show what would be published (run `npm run build` first). |

## How to contribute

1. **Open an issue first** for anything bigger than a small fix, so we can agree on the approach.
2. Fork the repository and create a branch from `main`.
3. Make your change, with tests.
4. Run `npm run typecheck` and `npm test`. Both must pass.
5. Open a pull request against `main` and fill in the template.

Commit messages follow a light convention: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, for example
`feat: warn when a lockfile is not committed`.

## How Dev View is organized

```text
folder or URL → input layer → ProjectContext → detectors → rule engine → scorer → reporter
```

- `src/input/` turns a folder or a URL into a `ProjectContext` (files, Git-tracked files, ignored files).
- `src/detectors/` decide which ecosystems are present.
- `src/rules/` hold the checks. A rule looks at the context and returns findings. Rules never print.
- `src/core/` has the scanner, the engine that runs rules, the scorer and the reporter.

Local and remote mode only differ in the input layer, so a new rule automatically works for both.

## Adding a new check

Say you want a rule that warns when a project has no `CONTRIBUTING.md`.

**1. Write the rule.** A rule is a function from the project to a list of findings. Put it in
`src/rules/universal/` (or `node/`, `python/` for ecosystem-specific checks).

```ts
import { hasRootFile } from "../../core/files.js";
import type { Finding, ProjectContext } from "../../types/result.js";

export function checkContributing(ctx: ProjectContext): Finding[] {
  if (hasRootFile(ctx, "CONTRIBUTING.md")) {
    return [{
      ruleId: "docs.contributing-exists",
      category: "Documentation",
      severity: "pass",
      title: "CONTRIBUTING.md found",
      message: "CONTRIBUTING.md exists",
    }];
  }

  return [{
    ruleId: "docs.contributing-exists",
    category: "Documentation",
    severity: "info",
    title: "No CONTRIBUTING.md found",
    message: "The project root has no contributing guide",
    // Warnings and errors MUST have both `why` and `suggestion`.
    why: "Contributors do not know how to help, or what you expect from them.",
    suggestion: "Add a CONTRIBUTING.md that explains how to set up the project and open a pull request.",
  }];
}
```

**2. Register it** in `src/rules/registry.ts`, with an id and a one-line description. For an
ecosystem rule, also set `ecosystem: "node"` (or `"python"`) so it only runs on those projects.

```ts
{ id: "docs.contributing", description: "A CONTRIBUTING.md exists", run: checkContributing },
```

**3. Test it.** Add cases to `tests/rules-universal.test.ts` (or `rules-ecosystems.test.ts`).
The `createProject` helper builds a real project, even a real Git repository, in a temporary folder:

```ts
it("notices a missing CONTRIBUTING.md", async () => {
  const { findings } = await analyzeProject(createProject({ "a.txt": "a" }));
  expect(severitiesOf(findings, "docs.contributing-exists")).toEqual(["info"]);
});
```

**4. Check the safety net.** `tests/health.test.ts` runs every kind of project through the whole
program and fails if any finding is incomplete (for example a warning without a reason) or if a rule
crashes. If it passes, your rule follows the contract.

### Principles for new rules

- **Explain, do not just flag.** Every warning and error needs a `why` and a `suggestion`.
- **Avoid false alarms.** A noisy tool gets uninstalled. When in doubt, use `info`, or look inside
  the file instead of guessing from its name.
- **Read-only.** Never write to the analyzed project and never run its code.
- **Fail gently.** Unreadable files, missing Git, and broken JSON are normal. They must not crash a run.
- **One rule, one idea.** Keep rules small and independent.

## Reporting bugs

Open an issue and include the output of `dev-view --version`, your Node.js version and operating
system, and what you expected to happen. A tiny project that reproduces the problem helps a lot.

For security problems, do **not** open a public issue. See [SECURITY.md](SECURITY.md).
