export type StoreOptions = {
  getHomeDir: () => string;
};

export type PersistenceInfo = {
  currentPath: string;
  defaultPath: string;
  isCustom: boolean;
  isConfigurable: boolean;
};

export interface IStorageService {
  getHomeDir(): string;
  getPersistenceInfo(): PersistenceInfo;
  getConductorSettings(): Record<string, unknown>;
  patchConductorSettings(updates: unknown): Record<string, unknown>;
  getTemplates(): unknown[];
  upsertTemplate(payload: unknown): unknown;
  deleteTemplate(id: unknown): { success: true };
  setPersistencePath(nextPath: unknown): PersistenceInfo;
}
