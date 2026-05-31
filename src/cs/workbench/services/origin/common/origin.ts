import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const IOriginService = createDecorator<IOriginService>("originService");

export type OriginHealthResult = {
  logPath?: string;
  originExePath?: string;
  [key: string]: unknown;
};

export type OriginCleanupResult = {
  removedTotal?: number;
  [key: string]: unknown;
};

export interface IOriginService {
  readonly _serviceBrand: undefined;

  canCheckHealth(): boolean;
  canManageExePath(): boolean;
  canRunCsv(): boolean;
  canRunRuntimeCleanup(): boolean;
  checkHealth(options: { path?: string }): Promise<OriginHealthResult>;
  getExePath(): Promise<string>;
  pickExePath(): Promise<string>;
  runCsv(payload: unknown): Promise<unknown>;
  runRuntimeCleanup(payload?: unknown): Promise<OriginCleanupResult>;
  setExePath(path: string): Promise<unknown>;
}
