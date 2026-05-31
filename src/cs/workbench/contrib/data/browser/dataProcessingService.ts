import type { MutableRef } from "src/cs/base/common/ref";
import {
  startProcessingJob,
  startRuleProcessingJob,
  terminateProcessingWorker,
  type ProcessingJobOptions,
  type RuleProcessingJobOptions,
} from "src/cs/workbench/contrib/data/asyncProcessing";
import type { IDataProcessingService } from "src/cs/workbench/contrib/data/common/data";

export class BrowserDataProcessingService
  implements IDataProcessingService<
    ProcessingJobOptions,
    RuleProcessingJobOptions,
    MutableRef<Worker | null>,
    Worker | null
  >
{
  startProcessingJob(options: ProcessingJobOptions): void {
    startProcessingJob(options);
  }

  startRuleProcessingJob(options: RuleProcessingJobOptions): void {
    startRuleProcessingJob(options);
  }

  terminateProcessingWorker(
    workerRef: MutableRef<Worker | null>,
    worker?: Worker | null,
  ): void {
    terminateProcessingWorker(workerRef, worker);
  }
}
