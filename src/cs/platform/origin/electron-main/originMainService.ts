import { createDecorator } from "../../instantiation/common/instantiation.js";
import type { OriginPlotOptions } from "./originPlotOptions.js";

export const IOriginMainService =
  createDecorator<IOriginMainService>("originMainService");

export type OriginRuntimeCleanupPolicy = {
  readonly enabled: boolean;
  readonly keepSuccessJobs: number;
  readonly failedRetentionDays: number;
};

export interface IOriginMainService {
  readonly _serviceBrand: undefined;

  getOriginExePath(): string | null;
  setOriginExePath(originExePath: unknown): Promise<string | null>;
  getRuntimeCleanupPolicy(): OriginRuntimeCleanupPolicy;
  getPlotOptions(): OriginPlotOptions;
}
