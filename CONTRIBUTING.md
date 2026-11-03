# Contributing to Dev View

Thank you for wanting to help. Dev View is intentionally small and focused, and every contribution,
from a typo fix to a new rule, makes it better.

This guide gets you from zero to a pull request.

## Set up

1. Fork the repository on GitHub.
2. Clone your fork:

```bash
git clone https://github.com/<your-username>/dev-view.git
cd dev-view
npm install
npm test
```

If `npm test` is green, you're ready to contribute.

Useful commands:

| Command | What it does |
| --- | --- |
| `npm run dev -- local .` | Run the CLI directly from the TypeScript source. |
| `npm test` / `npm run test:watch` | Run the tests once / whenever you save. |
| `npm run typecheck` | Type-check the source and the tests. |
| `npm run build` | Build `dist/cli.js`. |
| `npm run check:package` | Show what would be published (run `npm run build` first). |

## How to contribute

1. Open an issue first for anything bigger than a small fix, so we can agree on the approach.
2. Create a branch from `main`.
3. Make your change and add tests.
4. Run `npm run typecheck` and `npm test`. Both must pass.
5. Push your branch to your fork and open a pull request against `main`.
6. Fill in the pull request template.

Commit messages follow a light convention:

```text
feat:
fix:
docs:
test:
chore:
```

For example:

```text
feat: warn when a lockfile is not committed
```

## Pull request expectations

- Keep changes focused and easy to review.
- Include tests for new behavior.
- Update documentation when behavior changes.
- Update `CHANGELOG.md` for user-facing changes.
- Avoid unrelated refactoring in the same pull request.

## How Dev View is organized

```text
folder or URL → input layer → ProjectContext → detectors → rule engine → scorer → reporter
```

- `src/input/` turns a folder or a URL into a `ProjectContext` (files, tracked files and ignored files).
- `src/detectors/` determine which ecosystems and technologies are present.
- `src/rules/` contain the checks. A rule examines the project and returns findings. Rules never print.
- `src/core/` contains the scanner, rule engine, scorer and reporter.

Local and remote mode only differ in the input layer, so a new rule automatically works for both.

## Adding a new rule

Suppose you want a rule that warns when a project has no `CONTRIBUTING.md`.

### 1. Write the rule

A rule is a function from a project to a list of findings. Put it in
`src/rules/universal/` (or `node/`, `python/`, `java/` for ecosystem-specific rules).

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
    why: "Contributors do not know how to help or what you expect from them.",
    suggestion: "Add a CONTRIBUTING.md that explains how to set up the project and open a pull request.",
  }];
}
```

### 2. Register it

Register the rule in `src/rules/registry.ts`.

For ecosystem-specific rules, set the appropriate ecosystem so the rule only runs when relevant.

```ts
{
  id: "docs.contributing",
  description: "A CONTRIBUTING.md exists",
  run: checkContributing
}
```

### 3. Test it

Add test cases in `tests/rules-universal.test.ts` (or `rules-ecosystems.test.ts`).

The `createProject` helper creates a real temporary project and, when needed, a real Git repository.

```ts
it("notices a missing CONTRIBUTING.md", async () => {
  const { findings } = await analyzeProject(
    createProject({ "a.txt": "a" })
  );

  expect(
    severitiesOf(findings, "docs.contributing-exists")
  ).toEqual(["info"]);
});
```

### 4. Check the safety net

`tests/health.test.ts` runs every type of project through the whole program.

It fails if:

- a rule crashes
- a finding is incomplete
- a warning or error is missing a reason
- a warning or error is missing a suggestion

If it passes, the rule follows the project's contracts.

## Principles for new rules

- **Explain, don't just flag.** Every warning and error must include both `why` and `suggestion`.
- **Avoid false alarms.** A noisy tool gets ignored. Prefer evidence over guesses.
- **Read-only.** Never modify the analyzed project and never execute its code.
- **Fail gently.** Missing files, invalid JSON and Git problems must not crash a run.
- **One rule, one idea.** Keep rules small, focused and independent.

## Reporting bugs

Open an issue and include:

- `dev-view --version`
- Node.js version
- Operating system
- What happened
- What you expected to happen

A minimal reproduction project is always helpful.

For security issues, do **not** open a public issue. See [SECURITY.md](SECURITY.md).