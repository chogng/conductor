/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import { IConfigurationService } from "src/cs/platform/configuration/common/configuration";
import {
  ConfigurationScope,
  Extensions as ConfigurationExtensions,
  type IConfigurationNode,
  type IConfigurationRegistry,
} from "src/cs/platform/configuration/common/configurationRegistry";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { Registry } from "src/cs/platform/registry/common/platform";
import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
  type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import {
  collectCurrentTablePerformanceDiagnosticsMeasurements,
  createTablePerformanceDiagnosticsReportText,
} from "src/cs/workbench/contrib/performance/browser/tablePerformanceDiagnostics";
import {
  setPerformanceMeasurementEnabled,
} from "src/cs/workbench/contrib/performance/browser/performanceMeasurements";
import {
  INotificationService,
  Severity,
} from "src/cs/workbench/services/notification/common/notificationService";

const TABLE_PERFORMANCE_DIAGNOSTICS_CONTRIBUTION_ID = "workbench.contrib.tablePerformanceDiagnostics";
const TABLE_PERFORMANCE_DIAGNOSTICS_FLUSH_INTERVAL_MS = 60_000;
const COPY_TABLE_PERFORMANCE_DIAGNOSTICS_REPORT_COMMAND_ID =
  "perf.table.copyPerformanceDiagnosticsReport";

export const TABLE_PERFORMANCE_DIAGNOSTICS_ENABLED_CONFIGURATION =
  "table.performance.diagnostics.enabled";

class TablePerformanceDiagnosticsContribution extends Disposable implements IWorkbenchContribution {
  public static readonly ID = TABLE_PERFORMANCE_DIAGNOSTICS_CONTRIBUTION_ID;

  public constructor(
    @IConfigurationService private readonly configurationService: IConfigurationService,
  ) {
    super();

    this.updateMeasurementState();
    this._register(this.configurationService.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration(TABLE_PERFORMANCE_DIAGNOSTICS_ENABLED_CONFIGURATION)) {
        this.updateMeasurementState();
      }
    }));

    const interval = globalThis.setInterval(() => {
      collectCurrentTablePerformanceDiagnosticsMeasurements();
    }, TABLE_PERFORMANCE_DIAGNOSTICS_FLUSH_INTERVAL_MS);
    this._register(toDisposable(() => {
      globalThis.clearInterval(interval);
      collectCurrentTablePerformanceDiagnosticsMeasurements();
      setPerformanceMeasurementEnabled(false);
    }));
  }

  private updateMeasurementState(): void {
    setPerformanceMeasurementEnabled(readDiagnosticsEnabled(this.configurationService));
  }
}

registerAction2(class CopyTablePerformanceDiagnosticsReportAction extends Action2 {
  public constructor() {
    super({
      category: localize("performance.commands.category", "Performance"),
      f1: true,
      id: COPY_TABLE_PERFORMANCE_DIAGNOSTICS_REPORT_COMMAND_ID,
      title: localize(
        "performance.commands.copyTablePerformanceDiagnosticsReport",
        "Copy table performance diagnostics report",
      ),
      metadata: {
        description: localize(
          "performance.commands.copyTablePerformanceDiagnosticsReport.description",
          "Copy a local-only table performance diagnostics report for manual issue submission.",
        ),
      },
    });
  }

  public async run(accessor: ServicesAccessor): Promise<boolean> {
    return copyTablePerformanceDiagnosticsReport(accessor.get(INotificationService));
  }
});

const performanceConfiguration = Object.freeze<IConfigurationNode>({
  id: "performance",
  order: 101,
  title: localize("performanceConfigurationTitle", "Performance"),
  type: "object",
  properties: {
    [TABLE_PERFORMANCE_DIAGNOSTICS_ENABLED_CONFIGURATION]: {
      type: "boolean",
      default: false,
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental"],
      markdownDescription: localize(
        "table.performance.diagnostics.enabled",
        "Collects local table performance diagnostics. Measurements stay on this device and are only copied when you run the table performance diagnostics report command.",
      ),
    },
  },
});

const readDiagnosticsEnabled = (configurationService: IConfigurationService): boolean =>
  configurationService.getValue<boolean>(TABLE_PERFORMANCE_DIAGNOSTICS_ENABLED_CONFIGURATION) === true;

const copyTablePerformanceDiagnosticsReport = async (
  notificationService: INotificationService,
): Promise<boolean> => {
  try {
    const { report, text } = createTablePerformanceDiagnosticsReportText();
    await writeClipboardText(text);
    notificationService.notify({
      id: "performance.copyTablePerformanceDiagnosticsReport",
      message: report.sampleCount === 0
        ? localize(
          "performance.copyTablePerformanceDiagnosticsReport.empty",
          "Table performance diagnostics report copied. No samples have been collected yet.",
        )
        : localize(
          "performance.copyTablePerformanceDiagnosticsReport.success",
          "Table performance diagnostics report copied.",
        ),
      presentation: { type: report.sampleCount === 0 ? "warning" : "success" },
      severity: report.sampleCount === 0 ? Severity.Warning : Severity.Info,
    });
    return true;
  } catch (error) {
    notificationService.notify({
      id: "performance.copyTablePerformanceDiagnosticsReport",
      message: localize(
        "performance.copyTablePerformanceDiagnosticsReport.failed",
        "Failed to copy table performance diagnostics report: {error}",
        { error: error instanceof Error ? error.message : String(error) },
      ),
      severity: Severity.Error,
    });
    return false;
  }
};

const writeClipboardText = async (text: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) {
      throw new Error(localize(
        "performance.copyTablePerformanceDiagnosticsReport.failedFallback",
        "Clipboard copy command failed.",
      ));
    }
  } finally {
    textarea.remove();
  }
};

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
  .registerConfiguration(performanceConfiguration);

registerWorkbenchContribution2(
  TablePerformanceDiagnosticsContribution.ID,
  TablePerformanceDiagnosticsContribution,
  WorkbenchPhase.Eventually,
);
