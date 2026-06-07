import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type { MutableState } from "src/cs/workbench/services/session/common/session";
import {
  startProcessingJob,
  startRuleProcessingJob,
  terminateProcessingWorker,
  type ProcessingJobOptions,
  type RuleProcessingJobOptions,
} from "src/cs/workbench/contrib/template/browser/templateApplyProcessing";
import {
  ITemplateApplyService as ITemplateApplyServiceId,
  type ITemplateApplyService,
} from "src/cs/workbench/contrib/template/common/template";

export class TemplateApplyService
  implements ITemplateApplyService<
    ProcessingJobOptions,
    RuleProcessingJobOptions,
    MutableState<Worker | null>,
    Worker | null
  >
{
  public declare readonly _serviceBrand: undefined;

  startProcessingJob(options: ProcessingJobOptions): void {
    startProcessingJob(options);
  }

  startRuleProcessingJob(options: RuleProcessingJobOptions): void {
    startRuleProcessingJob(options);
  }

  terminateProcessingWorker(
    workerRef: MutableState<Worker | null>,
    worker?: Worker | null,
  ): void {
    terminateProcessingWorker(workerRef, worker);
  }
}

registerSingleton(ITemplateApplyServiceId, TemplateApplyService, InstantiationType.Delayed);
