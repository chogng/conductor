/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  startProcessingJob,
  startRuleProcessingJob,
  terminateProcessingWorker,
  type ProcessingJobOptions,
  type RuleProcessingJobOptions,
  type TemplateWorkerRef,
} from "src/cs/workbench/services/template/browser/templateApplyProcessing";
import {
  ITemplateApplyService as ITemplateApplyServiceId,
  type ITemplateApplyService,
} from "src/cs/workbench/services/template/common/template";

export class TemplateApplyService
  implements ITemplateApplyService<
    ProcessingJobOptions,
    RuleProcessingJobOptions,
    TemplateWorkerRef<Worker | null>,
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
    workerRef: TemplateWorkerRef<Worker | null>,
    worker?: Worker | null,
  ): void {
    terminateProcessingWorker(workerRef, worker);
  }
}

registerSingleton(ITemplateApplyServiceId, TemplateApplyService, InstantiationType.Delayed);
