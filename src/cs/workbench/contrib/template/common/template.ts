import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { TemplateConfig } from "src/cs/workbench/contrib/template/common/templateManagerUtils";

export const TemplateContributionId = "workbench.contrib.template";

export const TemplateViewId = "workbench.template";
export const TemplateAuxiliaryBarViewId = "workbench.template.auxiliarybar";

export type TemplateImportPayloadHandler = (
  payload: unknown,
  options: { fileName: string },
) => Promise<unknown> | unknown;

export type TemplateRecord = Partial<TemplateConfig> &
  Partial<{
    readonly id: string | null;
  }> & {
    readonly [key: string]: unknown;
  };

export const ITemplateService = createDecorator<ITemplateService>("templateService");
export const ITemplateApplyService = createDecorator<ITemplateApplyService>("templateApplyService");

export interface ITemplateService {
  readonly _serviceBrand: undefined;
  downloadTemplateBundle(bundle: unknown): string;
  getTemplates(): Promise<TemplateRecord[]>;
  deleteTemplate(id: string): Promise<void>;
  saveTemplate(template: TemplateConfig): Promise<TemplateRecord>;
}

export interface ITemplateApplyService<
  TProcessingJobOptions = unknown,
  TRuleProcessingJobOptions = unknown,
  TWorkerRef = unknown,
  TWorker = unknown,
> {
  readonly _serviceBrand: undefined;
  startProcessingJob(options: TProcessingJobOptions): void;
  startRuleProcessingJob(options: TRuleProcessingJobOptions): void;
  terminateProcessingWorker(workerRef: TWorkerRef, worker?: TWorker): void;
}
