import { describe, expect, it } from "vitest";
import { runRules, selectRules } from "../src/core/engine.js";
import type { Rule } from "../src/core/rule.js";
import { RULES } from "../src/rules/registry.js";
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
const noEcosystem: Detection = { ecosystems: [] };

const good: Finding = { ruleId: "demo.good", category: "Demo", severity: "pass", title: "Good", message: "ok" };

describe("selectRules", () => {
  const rules: Rule[] = [
    { id: "a.universal", description: "d", run: () => [] },
    { id: "b.node", description: "d", ecosystem: "node", run: () => [] },
    { id: "c.python", description: "d", ecosystem: "python", run: () => [] },
  ];

  it("keeps universal rules and rules for detected ecosystems", () => {
    expect(selectRules(nodeProject, rules).map((r) => r.id)).toEqual(["a.universal", "b.node"]);
  });

  it("keeps only universal rules when nothing is detected", () => {
    expect(selectRules(noEcosystem, rules).map((r) => r.id)).toEqual(["a.universal"]);
  });
});

describe("runRules", () => {
  it("keeps going when one rule crashes, and reports it as an internal finding", async () => {
    const rules: Rule[] = [
      { id: "ok", description: "d", run: () => [good] },
      { id: "boom", description: "d", run: () => { throw new Error("boom"); } },
    ];
    const findings = await runRules(ctx, noEcosystem, rules);

    expect(findings).toHaveLength(2);
    expect(findings[0]).toEqual(good);
    expect(findings[1].ruleId).toBe("internal.engine");
    expect(findings[1].title).toContain("boom");
  });

  it("handles rules that return a promise", async () => {
    const rules: Rule[] = [{ id: "async", description: "d", run: async () => [good] }];
    expect(await runRules(ctx, noEcosystem, rules)).toEqual([good]);
  });

  it("keeps an incomplete finding but flags it", async () => {
    const incomplete: Finding = { ...good, severity: "warning" };
    const rules: Rule[] = [{ id: "bad", description: "d", run: () => [incomplete] }];
    const findings = await runRules(ctx, noEcosystem, rules);

    expect(findings[0]).toEqual(incomplete);
    expect(findings[1].ruleId).toBe("internal.engine");
    expect(findings[1].message).toBe("missing why; missing suggestion");
  });

  it("returns findings in registry order", async () => {
    const rules: Rule[] = [
      { id: "first", description: "d", run: async () => [{ ...good, ruleId: "first" }] },
      { id: "second", description: "d", run: () => [{ ...good, ruleId: "second" }] },
    ];
    const ids = (await runRules(ctx, noEcosystem, rules)).map((f) => f.ruleId);
    expect(ids).toEqual(["first", "second"]);
  });
});

describe("the real rule registry", () => {
  it("has unique ids", () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("describes every rule", () => {
    for (const rule of RULES) expect(rule.description.trim()).not.toBe("");
  });

  it("only uses known ecosystems", () => {
    for (const rule of RULES) {
      if (rule.ecosystem) expect(["node", "python"]).toContain(rule.ecosystem);
    }
  });
});