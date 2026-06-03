import { localize } from "src/cs/nls";
import type { MutableState } from "src/cs/workbench/contrib/session/browser/sessionContext";
import {
  ORIGIN_CSV_AUTO_ZIP_FALLBACK_CODES,
  attachOriginCsvPaths,
  buildOriginCsvJobs,
  canRunOriginCsv,
  fillMissingOriginCsvText,
  runOriginCsvJobs,
  type OriginDisplayRange,
  type OriginZipExportResult,
} from "src/cs/workbench/contrib/origin/browser/originController";
import type { OriginExportPlan } from "src/cs/workbench/contrib/export/common/originSelectionExport";
import { formatOriginBridgeError } from "src/cs/workbench/contrib/origin/common/originBridgeError";

type ToastFn = (message: string, type?: unknown) => void;

export type OriginControllerOptions = {
  buildCsvExportRequest: (payload: unknown) => unknown;
  buildPayloads: (options?: { omitRustEligibleCsvText?: boolean }) => OriginExportPlan;
  exportOriginZipFallback: () => Promise<OriginZipExportResult | null | undefined>;
  originAxisSettings: unknown;
  originBusyRef: MutableState<boolean>;
  originChartXRangeRef: MutableState<OriginDisplayRange | null>;
  originChartYRangeRef: MutableState<{
    max: number;
    min: number;
    mode: "linear" | "log";
    step?: number | null;
  } | null>;
  originOpenPlotOptions: unknown;
  showToast: ToastFn;
};

export type OpenInOriginOptions = Omit<OriginControllerOptions, "originBusyRef">;
export type ExportOriginZipOptions = Pick<
  OriginControllerOptions,
  "exportOriginZipFallback" | "showToast" 
>;

const getOriginOpenSuccessMessage = (
  result: OriginExportPlan,
): { message: string; type: "success" } => {
  if (result.mode === "merged" && result.totalCanvasCount > 1) {
    return {
      message: localize("da_open_in_origin_combined_success", "Origin launched, and {curves} curve(s) from {files} file(s) were summarized into one worksheet.", {
        curves: result.totalCurveCount,
        files: result.totalCanvasCount,
      }),
      type: "success",
    };
  }

  if (result.mode === "workbookBooks" && result.totalCanvasCount > 1) {
    return {
      message: localize("da_open_in_origin_workbook_books_success", "Origin export tasks submitted for {count} thumbnail(s) into different workbooks of the same Origin window.", {
        count: result.totalCanvasCount,
      }),
      type: "success",
    };
  }

  if (result.mode === "workbookSheets" && result.totalCanvasCount > 1) {
    return {
      message: result.mixedYScales
        ? "Mixed linear/log export was split into separate Origin worksheets."
        : localize("da_open_in_origin_workbook_sheets_success", "Origin export tasks submitted for {count} thumbnail(s) into different worksheets of the same workbook.", {
            count: result.totalCanvasCount,
          }),
      type: "success",
    };
  }

  if (result.mode === "separate" && result.totalCanvasCount > 1) {
    return {
      message: localize("da_open_in_origin_batch_success", "Origin export tasks submitted for {count} thumbnail(s), one standalone Origin window each.", {
        count: result.totalCanvasCount,
      }),
      type: "success",
    };
  }

  return {
    message: localize("da_open_in_origin_success", "Origin launched and import task submitted."),
    type: "success",
  };
};

const getOriginZipSuccessMessage = (
  exported: OriginZipExportResult,
): { message: string; type: "success" } => {
  if (exported.mode === "merged") {
    return {
      message: localize("da_origin_zip_export_success", "Exported a ZIP package with CSV data for {curves} curve(s) from {files} file(s).", {
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
        : localize("da_origin_zip_export_workbook_sheets_success", "Exported a ZIP package with CSV files for {count} thumbnails.", {
            count: exported.canvasCount,
          }),
      type: "success",
    };
  }

  return {
    message: localize("da_origin_zip_export_batch_success", "Exported a ZIP package with standalone CSV files for {count} thumbnail(s).", {
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
    : detail.message || localize("unknownError", "Unknown error");
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
      message: localize("da_open_in_origin_fallback_zip_success_with_reason_and_stats", "Auto open failed ({reason}). Exported a ZIP package with CSV data for {curves} curve(s) from {files} file(s).", {
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
        : localize("da_open_in_origin_fallback_zip_workbook_sheets_success_with_reason", "Auto open failed ({reason}). Exported a ZIP package with CSV files for {count} thumbnails.", {
            count: fallback.canvasCount,
            reason: fallbackReason,
          }),
      type: "warning",
    };
  }

  return {
    message: localize("da_open_in_origin_fallback_zip_batch_success_with_reason", "Auto open failed ({reason}). Exported a ZIP package with CSV files for {count} thumbnails.", {
      count: fallback.canvasCount,
      reason: fallbackReason,
    }),
    type: "warning",
  };
};

export const runOpenInOrigin = async ({
  buildCsvExportRequest,
  buildPayloads,
  exportOriginZipFallback,
  originAxisSettings,
  originBusyRef,
  originChartXRangeRef,
  originChartYRangeRef,
  originOpenPlotOptions,
  showToast,
}: OriginControllerOptions): Promise<void> => {
  if (originBusyRef.current) return;

  try {
    originBusyRef.current = true;
    if (!canRunOriginCsv()) {
      throw new Error(localize("da_origin_pick_exe_required", "Please select Origin executable path first."));
    }

    const result = buildPayloads({
      omitRustEligibleCsvText: true,
    });
    const shouldBatchOriginCsvJobs =
      result.mode === "workbookBooks" || result.mode === "workbookSheets";
    const originCsvJobs = buildOriginCsvJobs({
      axisSettings: originAxisSettings,
      chartXRange: originChartXRangeRef.current,
      chartYRange: originChartYRangeRef.current,
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
    showToast(success.message, success.type);
  } catch (err) {
    const detail = formatOriginBridgeError(err);
    const code = String(detail.code || "").trim().toUpperCase();

    if (detail.code === "ORIGIN_EXE_REQUIRED") {
      showToast(localize("da_origin_pick_exe_required", "Please select Origin executable path first."), "error");
    } else if (ORIGIN_CSV_AUTO_ZIP_FALLBACK_CODES.has(code)) {
      const fallbackReason = getFallbackReason(detail);
      try {
        const fallback = await exportOriginZipFallback();
        if (!fallback) return;

        const success = getFallbackZipSuccessMessage({
          fallback,
          fallbackReason,
        });
        showToast(success.message, success.type);
      } catch (fallbackErr) {
        const fallbackMessage =
          fallbackErr instanceof Error
            ? fallbackErr.message
            : String(fallbackErr ?? localize("unknownError", "Unknown error"));
        showToast(
          localize("da_open_in_origin_fallback_zip_failed", "Auto open failed, and ZIP fallback export failed: {error}", {
            error: fallbackMessage,
          }),
          "error",
        );
      }
    } else {
      showToast(
        localize("da_open_in_origin_failed", "Failed to open in Origin: {error}", { error: detail.messageText }),
        "error",
      );
    }
  } finally {
    originBusyRef.current = false;
  }
};

export const runExportOriginZip = async ({
  exportOriginZipFallback,
  showToast,
}: ExportOriginZipOptions): Promise<void> => {
  try {
    const exported = await exportOriginZipFallback();
    if (!exported) return;

    const success = getOriginZipSuccessMessage(exported);
    showToast(success.message, success.type);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err ?? localize("unknownError", "Unknown error"));
    showToast(localize("da_open_in_origin_fallback_zip_failed", "Auto open failed, and ZIP fallback export failed: {error}", { error: message }), "error");
  }
};
