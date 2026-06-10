export type ConductorStoreOptions = {
  getHomeDir: () => string;
};

export interface IConductorStoreService {
  getHomeDir(): string;
  getConductorSettings(): Record<string, unknown>;
  patchConductorSettings(updates: unknown): Record<string, unknown>;
  getTemplates(): unknown[];
  upsertTemplate(payload: unknown): unknown;
  deleteTemplate(id: unknown): { success: true };
}
