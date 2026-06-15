import {
  ConfigurationTarget,
  type IConfigurationService,
} from "../../configuration/common/configuration.js";
import { normalizeOriginExePath } from "./core.js";
import {
  normalizeOriginPlotOptions,
  type OriginPlotOptions,
} from "./originPlotOptions.js";
import type { IOriginMainService, OriginRuntimeCleanupPolicy } from "./originMainService.js";

export class OriginMainService implements IOriginMainService {
  public declare readonly _serviceBrand: undefined;

  public constructor(
    private readonly configurationService: IConfigurationService,
  ) {}

  public getOriginExePath(): string | null {
    return normalizeOriginExePath(
      this.configurationService.getValue("originExePath"),
    );
  }

  public async setOriginExePath(originExePath: unknown): Promise<string | null> {
    const normalizedPath = normalizeOriginExePath(originExePath);
    await this.configurationService.updateValue(
      "originExePath",
      normalizedPath,
      ConfigurationTarget.USER,
    );
    return this.getOriginExePath();
  }

  public getRuntimeCleanupPolicy(): OriginRuntimeCleanupPolicy {
    return {
      enabled: Boolean(this.configurationService.getValue("originRuntimeCleanupEnabled")),
      keepSuccessJobs: Number(this.configurationService.getValue("originRuntimeKeepSuccessJobs")),
      failedRetentionDays: Number(this.configurationService.getValue("originRuntimeFailedRetentionDays")),
    };
  }

  public getPlotOptions(): OriginPlotOptions {
    return normalizeOriginPlotOptions({
      plotCommand: this.configurationService.getValue("originPlotCommandDefault"),
      plotType: this.configurationService.getValue("originPlotTypeDefault"),
      postPlotCommands: this.configurationService.getValue("originPlotPostCommandsDefault"),
      lineWidth: this.configurationService.getValue("originPlotLineWidthDefault"),
      xyPairs: this.configurationService.getValue("originPlotXyPairsDefault"),
    });
  }
}
