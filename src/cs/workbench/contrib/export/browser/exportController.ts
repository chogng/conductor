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

type TranslateFn = (key: string, params?: Record<string, unknown>) => string;
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
  t: TranslateFn;
  tLoose: TranslateFn;
};

export type OpenInOriginOptions = Omit<OriginControllerOptions, "originBusyRef">;
export type ExportOriginZipOptions = Pick<
  OriginControllerOptions,
  "exportOriginZipFallback" | "showToast" | "t"
>;

const getOriginOpenSuccessMessage = (
  result: OriginExportPlan,
  t: TranslateFn,
): { message: string; type: "success" } => {
  if (result.mode === "merged" && result.totalCanvasCount > 1) {
    return {
      message: t("da_open_in_origin_combined_success", {
        curves: result.totalCurveCount,
        files: result.totalCanvasCount,
      }),
      type: "success",
    };
  }

  if (result.mode === "workbookBooks" && result.totalCanvasCount > 1) {
    return {
      message: t("da_open_in_origin_workbook_books_success", {
        count: result.totalCanvasCount,
      }),
      type: "success",
    };
  }

  if (result.mode === "workbookSheets" && result.totalCanvasCount > 1) {
    return {
      message: result.mixedYScales
        ? "Mixed linear/log export was split into separate Origin worksheets."
        : t("da_open_in_origin_workbook_sheets_success", {
            count: result.totalCanvasCount,
          }),
      type: "success",
    };
  }

  if (result.mode === "separate" && result.totalCanvasCount > 1) {
    return {
      message: t("da_open_in_origin_batch_success", {
        count: result.totalCanvasCount,
      }),
      type: "success",
    };
  }

  return {
    message: t("da_open_in_origin_success"),
    type: "success",
  };
};

const getOriginZipSuccessMessage = (
  exported: OriginZipExportResult,
  t: TranslateFn,
): { message: string; type: "success" } => {
  if (exported.mode === "merged") {
    return {
      message: t("da_origin_zip_export_success", {
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
        : t("da_origin_zip_export_workbook_sheets_success", {
            count: exported.canvasCount,
          }),
      type: "success",
    };
  }

  return {
    message: t("da_origin_zip_export_batch_success", {
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
  t: TranslateFn,
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
    : detail.message || t("unknownError");
};

const getFallbackZipSuccessMessage = ({
  fallback,
  fallbackReason,
  t,
}: {
  fallback: OriginZipExportResult;
  fallbackReason: string;
  t: TranslateFn;
}): { message: string; type: "warning" } => {
  if (fallback.mode === "merged") {
    return {
      message: t("da_open_in_origin_fallback_zip_success_with_reason_and_stats", {
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
        : t("da_open_in_origin_fallback_zip_workbook_sheets_success_with_reason", {
            count: fallback.canvasCount,
            reason: fallbackReason,
          }),
      type: "warning",
    };
  }

  return {
    message: t("da_open_in_origin_fallback_zip_batch_success_with_reason", {
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
  t,
  tLoose,
}: OriginControllerOptions): Promise<void> => {
  if (originBusyRef.current) return;

  try {
    originBusyRef.current = true;
    if (!canRunOriginCsv()) {
      throw new Error(t("da_origin_pick_exe_required"));
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

    const success = getOriginOpenSuccessMessage(result, t);
    showToast(success.message, success.type);
  } catch (err) {
    const detail = formatOriginBridgeError(tLoose, err);
    const code = String(detail.code || "").trim().toUpperCase();

    if (detail.code === "ORIGIN_EXE_REQUIRED") {
      showToast(t("da_origin_pick_exe_required"), "error");
    } else if (ORIGIN_CSV_AUTO_ZIP_FALLBACK_CODES.has(code)) {
      const fallbackReason = getFallbackReason(detail, t);
      try {
        const fallback = await exportOriginZipFallback();
        if (!fallback) return;

        const success = getFallbackZipSuccessMessage({
          fallback,
          fallbackReason,
          t,
        });
        showToast(success.message, success.type);
      } catch (fallbackErr) {
        const fallbackMessage =
          fallbackErr instanceof Error
            ? fallbackErr.message
            : String(fallbackErr ?? t("unknownError"));
        showToast(
          t("da_open_in_origin_fallback_zip_failed", {
            error: fallbackMessage,
          }),
          "error",
        );
      }
    } else {
      showToast(
        t("da_open_in_origin_failed", { error: detail.messageText }),
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
  t,
}: ExportOriginZipOptions): Promise<void> => {
  try {
    const exported = await exportOriginZipFallback();
    if (!exported) return;

    const success = getOriginZipSuccessMessage(exported, t);
    showToast(success.message, success.type);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err ?? t("unknownError"));
    showToast(t("da_open_in_origin_fallback_zip_failed", { error: message }), "error");
  }
};
