export type ConductorStoreOptions = {
  getHomeDir: () => string;
};

export type ConductorStorePersistenceInfo = {
  currentPath: string;
  defaultPath: string;
  isCustom: boolean;
  isConfigurable: boolean;
};

export interface IConductorStoreService {
  getHomeDir(): string;
  getPersistenceInfo(): ConductorStorePersistenceInfo;
  getConductorSettings(): Record<string, unknown>;
  patchConductorSettings(updates: unknown): Record<string, unknown>;
  getTemplates(): unknown[];
  upsertTemplate(payload: unknown): unknown;
  deleteTemplate(id: unknown): { success: true };
  setPersistencePath(nextPath: unknown): ConductorStorePersistenceInfo;
}
