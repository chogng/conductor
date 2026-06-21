import path from "node:path";
import { fileURLToPath } from "node:url";

export const workspace = path.resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
export const defaultOutputRoot = path.join(workspace, ".build", "bench", "template-apply-performance-trace");
export const traceQuery = [
  "conductorTemplateApplyPerformanceTrace=1",
  "conductorPerformanceTrace=1",
].join("&");
export const stressViewport = { width: 1920, height: 1200 };
