import type { Detection, DetectedEcosystem, ProjectContext } from "../types/result.js";
import { detectNode } from "./node.js";
import { detectPython } from "./python.js";
import { detectJava } from "./java.js";

type Detector = (ctx: ProjectContext) => Promise<DetectedEcosystem | null>;

const DETECTORS: Detector[] = [detectNode, detectPython, detectJava];

export async function detectProject(ctx: ProjectContext): Promise<Detection> {
  const results = await Promise.all(DETECTORS.map((detect) => detect(ctx)));
  return { ecosystems: results.filter((e): e is DetectedEcosystem => e !== null) };
}