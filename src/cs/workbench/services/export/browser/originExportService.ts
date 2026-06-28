/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import {
  ORIGIN_CSV_AUTO_ZIP_FALLBACK_CODES,
  attachOriginCsvPaths,
  buildOriginCsvJobs,
  canRunOriginCsv,
  exportOriginZip,
  fillMissingOriginCsvText,
  runOriginCsvJobs,
  type OriginCsvRequestBuilder,
  type OriginDisplayRange,
  type OriginExportPlanLike,
  type OriginPayloadBuilder,
  type OriginZipExportResult,
} from "src/cs/workbench/services/origin/browser/originController";
import { formatOriginBridgeError } from "src/cs/workbench/services/export/common/originBridgeError";
import {
  INotificationService,
  Severity,
  type NotificationPresentationType,
} from "src/cs/workbench/services/notification/common/notificationService";

export type OriginControllerOptions = {
  readonly buildCsvExportRequest: OriginCsvRequestBuilder;
  readonly buildPayloads: OriginPayloadBuilder;
  readonly originAxisSettings: unknown;
  readonly originBusyRef: { current: boolean };
  readonly originChartXRange: OriginDisplayRange | null;
  readonly originChartYRange: (OriginDisplayRange & { mode: "linear" | "log" }) | null;
  readonly notificationService: INotificationService;
  readonly originOpenPlotOptions: unknown;
};

export type OpenInOriginOptions = Omit<OriginControllerOptions, "originBusyRef">;
export type ExportOriginZipOptions = {
  readonly buildCsvExportRequest: OriginCsvRequestBuilder;
  readonly buildPayloads: OriginPayloadBuilder;
  readonly notificationService: INotificationService;
};

const showOriginNotification = (
  notificationService: INotificationService,
  message: string,
  type?: unknown,
): void => {
  const notificationType: NotificationPresentationType =
    type === "error" || type === "warning" || type === "info" || type === "success"
      ? type
      : "success";
  const severity = Severity.fromValue(notificationType);
  notificationService.notify({
    id: "workbench.originExport",
    message,
    presentation: { type: notificationType },
    severity: severity === Severity.Ignore ? Severity.Info : severity,
  });
};

const getOriginOpenSuccessMessage = (
  result: OriginExportPlanLike,
): { message: string; type: "success" } => {
  const mode = result.mode;
  const totalCanvasCount = result.totalCanvasCount ?? result.payloads.length;
  const totalCurveCount = result.totalCurveCount ?? totalCanvasCount;
  const mixedYScales = Boolean(result.mixedYScales);

  if (mode === "merged" && totalCanvasCount > 1) {
    return {
      message: localize("origin.open.combinedSuccess", "Origin launched, and {curves} curve(s) from {files} file(s) were summarized into one worksheet.", {
        curves: totalCurveCount,
        files: totalCanvasCount,
      }),
      type: "success",
    };
  }

  if (mode === "workbookBooks" && totalCanvasCount > 1) {
    return {
      message: localize("origin.open.workbookBooksSuccess", "Origin export tasks submitted for {count} thumbnail(s) into different workbooks of the same Origin window.", {
        count: totalCanvasCount,
      }),
      type: "success",
    };
  }

  if (mode === "workbookSheets" && totalCanvasCount > 1) {
    return {
      message: mixedYScales
        ? "Mixed linear/log export was split into separate Origin worksheets."
        : localize("origin.open.workbookSheetsSuccess", "Origin export tasks submitted for {count} thumbnail(s) into different worksheets of the same workbook.", {
            count: totalCanvasCount,
          }),
      type: "success",
    };
  }

  if (mode === "separate" && totalCanvasCount > 1) {
    return {
      message: localize("origin.open.batchSuccess", "Origin export tasks submitted for {count} thumbnail(s), one standalone Origin window each.", {
        count: totalCanvasCount,
      }),
      type: "success",
    };
  }

  return {
    message: localize("origin.open.success", "Origin launched and import task submitted."),
    type: "success",
  };
};

const getOriginZipSuccessMessage = (
  exported: OriginZipExportResult,
): { message: string; type: "success" } => {
  if (exported.mode === "merged") {
    return {
      message: localize("origin.zipExport.success", "Exported a ZIP package with CSV data for {curves} curve(s) from {files} file(s).", {
        curves: exported.curveCount,
        files: exported.canvasCount,
      }),
      type: "success",
    };
  }

  if (exported.mode === "workbookSheets") {
    return {
      message: exported.mixedYScales
        ? "Mixed linear/log export was packaged as separate worksheets."
        : localize("origin.zipExport.workbookSheetsSuccess", "Exported a ZIP package with CSV files for {count} thumbnails.", {
            count: exported.canvasCount,
          }),
      type: "success",
    };
  }

  return {
    message: localize("origin.zipExport.batchSuccess", "Exported a ZIP package with standalone CSV files for {count} thumbnail(s).", {
      count: exported.canvasCount,
    }),
    type: "success",
  };
};

const getFallbackReason = (
  detail: {
    code?: unknown;
    message?: string;
    originExe?: unknown;
    stage?: unknown;
  },
): string => {
  const fallbackReasonParts = [
    String(detail.code || "").trim().toUpperCase(),
    String(detail.stage || "").trim().toUpperCase(),
    String(detail.originExe || "").trim()
      ? `EXE=${String(detail.originExe || "").trim()}`
      : "",
  ].filter((item) => item.length > 0);

  return fallbackReasonParts.length > 0
    ? fallbackReasonParts.join(" @ ")
    : detail.message || localize("common.unknownError", "Unknown error");
};

const getFallbackZipSuccessMessage = ({
  fallback,
  fallbackReason,
}: {
  fallback: OriginZipExportResult;
  fallbackReason: string;
}): { message: string; type: "warning" } => {
  if (fallback.mode === "merged") {
    return {
      message: localize("origin.open.fallbackZip.successWithReasonAndStats", "Auto open failed ({reason}). Exported a ZIP package with CSV data for {curves} curve(s) from {files} file(s).", {
        curves: fallback.curveCount,
        files: fallback.canvasCount,
        reason: fallbackReason,
      }),
      type: "warning",
    };
  }

  if (fallback.mode === "workbookSheets") {
    return {
      message: fallback.mixedYScales
        ? `Mixed linear/log export was split into separate worksheets. ${fallbackReason}`
        : localize("origin.open.fallbackZip.workbookSheetsSuccessWithReason", "Auto open failed ({reason}). Exported a ZIP package with CSV files for {count} thumbnails.", {
            count: fallback.canvasCount,
            reason: fallbackReason,
          }),
      type: "warning",
    };
  }

  return {
    message: localize("origin.open.fallbackZip.batchSuccessWithReason", "Auto open failed ({reason}). Exported a ZIP package with CSV files for {count} thumbnails.", {
      count: fallback.canvasCount,
      reason: fallbackReason,
    }),
    type: "warning",
  };
};

export const runOpenInOrigin = async ({
  buildCsvExportRequest,
  buildPayloads,
  originAxisSettings,
  originBusyRef,
  originChartXRange,
  originChartYRange,
  notificationService,
  originOpenPlotOptions,
}: OriginControllerOptions): Promise<void> => {
  if (originBusyRef.current) return;

  try {
    originBusyRef.current = true;
    if (!canRunOriginCsv()) {
      throw new Error(localize("origin.executable.required", "Please select Origin executable path first."));
    }

    const result = buildPayloads({
      omitRustEligibleCsvText: true,
    });
    const shouldBatchOriginCsvJobs =
      result.mode === "workbookBooks" || result.mode === "workbookSheets";
    const originCsvJobs = buildOriginCsvJobs({
      axisSettings: originAxisSettings,
      chartXRange: originChartXRange,
      chartYRange: originChartYRange,
      plan: result,
      plotOptions: originOpenPlotOptions,
    });

    await attachOriginCsvPaths({
      buildCsvExportRequest,
      jobs: originCsvJobs,
      payloads: result.payloads,
    });
    fillMissingOriginCsvText({
      buildPayloads,
      jobs: originCsvJobs,
    });
    await runOriginCsvJobs({
      jobs: originCsvJobs,
      shouldBatch: shouldBatchOriginCsvJobs,
    });

    const success = getOriginOpenSuccessMessage(result);
    showOriginNotification(notificationService, success.message, success.type);
  } catch (err) {
    const detail = formatOriginBridgeError(err);
    const code = String(detail.code || "").trim().toUpperCase();

    if (detail.code === "ORIGIN_EXE_REQUIRED") {
      showOriginNotification(notificationService, localize("origin.executable.required", "Please select Origin executable path first."), "error");
    } else if (ORIGIN_CSV_AUTO_ZIP_FALLBACK_CODES.has(code)) {
      const fallbackReason = getFallbackReason(detail);
      try {
        const fallback = await exportOriginZip({
          buildCsvExportRequest,
          buildPayloads,
        });
        if (!fallback) return;

        const success = getFallbackZipSuccessMessage({
          fallback,
          fallbackReason,
        });
        showOriginNotification(notificationService, success.message, success.type);
      } catch (fallbackErr) {
        const fallbackMessage =
          fallbackErr instanceof Error
            ? fallbackErr.message
            : String(fallbackErr ?? localize("common.unknownError", "Unknown error"));
        showOriginNotification(
          notificationService,
          localize("origin.open.fallbackZip.failed", "Auto open failed, and ZIP fallback export failed: {error}", {
            error: fallbackMessage,
          }),
          "error",
        );
      }
    } else {
      showOriginNotification(
        notificationService,
        localize("origin.open.failed", "Failed to open in Origin: {error}", { error: detail.messageText }),
        "error",
      );
    }
  } finally {
    originBusyRef.current = false;
  }
};

export const runExportOriginZip = async ({
  buildCsvExportRequest,
  buildPayloads,
  notificationService,
}: ExportOriginZipOptions): Promise<void> => {
  try {
    const exported = await exportOriginZip({
      buildCsvExportRequest,
      buildPayloads,
    });
    if (!exported) return;

    const success = getOriginZipSuccessMessage(exported);
    showOriginNotification(notificationService, success.message, success.type);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err ?? localize("common.unknownError", "Unknown error"));
    showOriginNotification(notificationService, localize("origin.open.fallbackZip.failed", "Auto open failed, and ZIP fallback export failed: {error}", { error: message }), "error");
  }
};
