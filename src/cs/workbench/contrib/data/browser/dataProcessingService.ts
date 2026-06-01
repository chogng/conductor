import type { MutableState } from "src/cs/workbench/contrib/session/analysis-session-context";
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
    MutableState<Worker | null>,
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
    workerRef: MutableState<Worker | null>,
    worker?: Worker | null,
  ): void {
    terminateProcessingWorker(workerRef, worker);
  }
}
