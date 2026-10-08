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

/** One file found on disk. `path` is relative to the project root, always with "/" separators. */
export interface FileEntry {
  path: string;
  size: number;
}

export interface ProjectContext {
  rootPath: string;
  name: string;
  hasGit: boolean;
  /** Every file on disk (skipping node_modules, .git, etc.), sorted by path. */
  files: FileEntry[];
  /** Files Git tracks. null when this is not a Git repo or Git could not be run. */
  trackedFiles: string[] | null;
  /** true when the scan stopped early because the project is very large. */
  truncated: boolean;
}

export interface Technology {
  id: string;
  name: string;
}

export interface DetectedEcosystem {
  id: "node" | "python";
  name: string;
  evidence: string[];
  technologies: Technology[];
}

export interface Detection {
  ecosystems: DetectedEcosystem[];
}