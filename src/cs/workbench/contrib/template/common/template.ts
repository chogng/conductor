import type { TemplateConfig } from "src/cs/workbench/contrib/template/common/templateManagerUtils";

export const TemplateContributionId = "workbench.contrib.template";

export const TemplateViewId = "workbench.template";

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

export interface ITemplateService {
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
  startProcessingJob(options: TProcessingJobOptions): void;
  startRuleProcessingJob(options: TRuleProcessingJobOptions): void;
  terminateProcessingWorker(workerRef: TWorkerRef, worker?: TWorker): void;
}
