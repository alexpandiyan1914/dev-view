export type Severity = "pass" | "info" | "warning" | "error";

export interface Finding {
  ruleId: string;
  category: string;
  severity: Severity;
  title: string;
  message: string;
  why?: string;
  suggestion?: string;
}

export interface ProjectContext {
  rootPath: string;
  name: string;
  hasGit: boolean;
}