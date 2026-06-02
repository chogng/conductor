export const TemplateContributionId = "workbench.contrib.template";

export const TemplateViewId = "workbench.template";

export type TemplateImportPayloadHandler = (
  payload: unknown,
  options: { fileName: string },
) => Promise<unknown> | unknown;

export interface ITemplateService {
  downloadTemplateBundle(bundle: unknown): string;
  importTemplateFromDialog(
    importTemplatesFromPayload: TemplateImportPayloadHandler,
  ): Promise<void>;
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
