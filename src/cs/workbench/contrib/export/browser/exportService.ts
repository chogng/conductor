import {
  runExportOriginZip,
  runOpenInOrigin,
  type ExportOriginZipOptions,
  type OpenInOriginOptions,
} from "src/cs/workbench/contrib/export/browser/exportController";
import type { IExportService } from "src/cs/workbench/contrib/export/common/export";

export class BrowserExportService implements IExportService {
  private readonly originBusyRef = { current: false };

  openInOrigin(options: OpenInOriginOptions): Promise<void> {
    return runOpenInOrigin({
      ...options,
      originBusyRef: this.originBusyRef,
    });
  }

  exportOriginZip(options: ExportOriginZipOptions): Promise<void> {
    return runExportOriginZip(options);
  }
}
