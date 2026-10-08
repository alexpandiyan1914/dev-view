// A quick experiment: does the engine behave correctly with deliberately bad rules?
// Run with:  npx tsx scripts/try-engine.ts
import { runRules, selectRules } from "../src/core/engine.js";
import type { Rule } from "../src/core/rule.js";
import type { Detection, Finding, ProjectContext } from "../src/types/result.js";

const ctx: ProjectContext = {
  rootPath: ".",
  name: "demo",
  hasGit: false,
  files: [],
  trackedFiles: null,
  ignoredFiles: null,
  truncated: false,
};

const nodeProject: Detection = {
  ecosystems: [{ id: "node", name: "Node.js", evidence: ["package.json"], technologies: [] }],
};

const good: Finding = {
  ruleId: "demo.good",
  category: "Demo",
  severity: "pass",
  title: "All good",
  message: "ok",
};

const rules: Rule[] = [
  { id: "demo.universal", description: "always runs", run: () => [good] },
  { id: "demo.node-only", description: "node only", ecosystem: "node", run: () => [good] },
  { id: "demo.python-only", description: "python only", ecosystem: "python", run: () => [good] },
  {
    id: "demo.crashes",
    description: "throws an error",
    run: () => {
      throw new Error("boom");
    },
  },
  {
    id: "demo.incomplete",
    description: "warning without why or suggestion",
    run: () => [{ ...good, severity: "warning", title: "Something is wrong" }],
  },
];

console.log("Selected for a Node project:", selectRules(nodeProject, rules).map((r) => r.id).join(", "));

const findings = await runRules(ctx, nodeProject, rules);
console.log("\nFindings:");
for (const f of findings) {
  console.log(`  [${f.severity}] ${f.ruleId}: ${f.title}${f.severity === "info" ? "  (" + f.message + ")" : ""}`);
}