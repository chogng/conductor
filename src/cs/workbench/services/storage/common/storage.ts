export type AnalysisStoreOptions = {
  getHomeDir: () => string;
};

export type AnalysisPersistenceInfo = {
  currentPath: string;
  defaultPath: string;
  isCustom: boolean;
  isConfigurable: boolean;
};

export interface IAnalysisStorageService {
  getHomeDir(): string;
  getStorePersistenceInfo(): AnalysisPersistenceInfo;
  getAnalysisSettings(): Record<string, unknown>;
  patchAnalysisSettings(updates: unknown): Record<string, unknown>;
  getAnalysisTemplates(): unknown[];
  upsertAnalysisTemplate(payload: unknown): unknown;
  deleteAnalysisTemplate(id: unknown): { success: true };
  setPersistencePath(nextPath: unknown): AnalysisPersistenceInfo;
}
