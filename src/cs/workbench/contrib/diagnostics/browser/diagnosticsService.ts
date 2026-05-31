import type { IDiagnosticsService } from "src/cs/workbench/contrib/diagnostics/common/diagnostics";

export class BrowserDiagnosticsService implements IDiagnosticsService {
  touchAnalysisCacheSourceFile(file: unknown): void {
    if (!file || typeof file !== "object") return;
    (file as { analysisCacheTouchedAt?: number }).analysisCacheTouchedAt = Date.now();
  }
}
