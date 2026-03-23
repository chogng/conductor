import React, {
  useCallback,
  useEffect,
  lazy,
  useMemo,
  useRef,
  useState,
  Suspense,
  type CSSProperties,
  type SetStateAction,
} from "react";
import {
  Trash2,
  ArrowUp,
  ChevronDown,
  List,
  Save,
  Plus,
  Check,
  FileSpreadsheet,
  Download,
  Upload,
} from "lucide-react";
import { useLanguage } from "../../../../hooks/useLanguage";
import type { TranslateFn, TranslationVars } from "../../../../context/language";
import Toast from "../../../../components/ui/Toast";
import Input from "../../../../components/ui/Input";
import Select from "../../../../components/ui/Select";
import Tabs from "../../../../components/ui/Tabs";
import Card from "../../../../components/ui/Card";
import Button from "../../../../components/ui/Button";
import Modal from "../../../../components/ui/Modal";
import DropdownMenu from "../../../../components/ui/DropdownMenu";
import ScrollArea from "../../../../components/ui/ScrollArea";
import { validateVarPair } from "./templateValidation";
import { getExcelColumnLabel } from "./templateColumnLabel";
import { useTemplateManagerState } from "./useTemplateManagerState";
import {
  normalizeXDataEndValue,
  type TemplateConfig,
} from "./templateManagerUtils";
import { DEVICE_ANALYSIS_Y_UNIT_VALUES } from "../../analysis/lib/deviceAnalysisUnits";
import {
  inferXSegmentationSuggestionFromPreview,
  resolveXRangeForPreview,
  resolveXSegmentationMode,
} from "../../shared/lib/XSegmentation";
import type { PreviewStatus as SessionPreviewStatus } from "../../session/device-analysis-session-context";
import type { PreviewFileLike, ToastType } from "../../shared/lib/sharedTypes";

export type TemplateManagerProps = {
  previewFile?: PreviewFileLike | null;
  previewStatus?: Partial<SessionPreviewStatus> | null;
  getPreviewRow?: (rowIndex: number) => unknown;
  ensurePreviewRows?: (
    fileId: string,
    startRow: number,
    endRow: number,
  ) => Promise<unknown> | unknown;
  onTemplateApplied?: (config: TemplateConfig) => unknown;
  onTemplateAppliedIncremental?: (config: TemplateConfig) => unknown;
  subscribePreviewRowsVersion?: (onStoreChange: () => void) => () => void;
  getPreviewRowsVersion?: () => number;
  deviceAnalysisSettings?: Record<string, unknown> | null;
  onUpdateDeviceAnalysisSettings?: (
    updates: Record<string, unknown>,
  ) => Promise<unknown> | unknown;
};

const loadTemplateManagerPreviewWorkspace = () =>
  import("./TemplateManagerPreviewWorkspace");

const LazyTemplateManagerPreviewWorkspace = lazy(
  loadTemplateManagerPreviewWorkspace,
);

const TemplateManagerPreviewFallback = ({
  previewFile,
  previewStatus,
  t,
}: {
  previewFile?: PreviewFileLike | null;
  previewStatus?: Partial<SessionPreviewStatus> | null;
  t: TranslateFn;
}) => {
  const fileName = previewFile
    ? String(previewFile.fileName || "").replace(/\.csv$/i, "")
    : "";
  const title =
    previewStatus?.state === "loading"
      ? previewStatus.message || t("da_preview_loading")
      : previewStatus?.state === "error"
        ? previewStatus.message || t("da_preview_error")
        : t("da_data_extraction_template");
  const hint =
    previewStatus?.state === "loading"
      ? t("da_preview_loading_hint")
      : previewStatus?.state === "error"
        ? t("da_preview_error_hint")
        : t("da_preview_select_file_hint");

  return (
    <div className="lg:col-span-3 self-start min-[1200px]:self-stretch bg-bg-page rounded-lg p-4 overflow-hidden flex flex-col min-h-0 h-[var(--da-template-stack-panel-h)] min-[1200px]:h-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-text-secondary">
          {t("da_preview_filename_label")}: {fileName}
        </span>
        {previewStatus?.state === "loading" ? (
          <span className="text-xs text-text-secondary">
            {previewStatus.message || t("da_preview_loading")}
          </span>
        ) : previewStatus?.state === "error" ? (
          <span className="text-xs text-red-500">
            {previewStatus.message || t("da_preview_error")}
          </span>
        ) : null}
      </div>

      <div className="flex-1 min-h-0 border border-border rounded bg-bg-surface/60 px-6 py-8 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-full bg-accent/10 text-accent flex items-center justify-center mb-4">
          <FileSpreadsheet size={22} />
        </div>
        <div className="text-sm font-medium text-text-primary">{title}</div>
        <div className="mt-2 text-sm text-text-secondary max-w-md">{hint}</div>
      </div>
    </div>
  );
};

const formatTemplateExportFileName = (templateNameRaw?: string) => {
  const safeTemplateName = String(templateNameRaw ?? "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/^-+|-+$/g, "");
  const baseName = safeTemplateName || "template";
  return `${baseName}.json`;
};

const TemplateManager = ({
  previewFile,
  previewStatus,
  getPreviewRow,
  ensurePreviewRows,
  onTemplateApplied,
  onTemplateAppliedIncremental,
  subscribePreviewRowsVersion,
  getPreviewRowsVersion,
  deviceAnalysisSettings,
  onUpdateDeviceAnalysisSettings,
}: TemplateManagerProps) => {
  const { t } = useLanguage();
  const tLoose = useCallback(
    (key: string, params?: Record<string, unknown>) =>
      t(key, params as TranslationVars | undefined),
    [t],
  );
  const dropdownRef = useRef(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [toast, setToast] = useState({
    isVisible: false,
    message: "",
    type: "success" as ToastType,
  });

  const showToast = useCallback((message: string, type = "warning") => {
    const safeType: ToastType =
      type === "success" || type === "error" || type === "warning" || type === "info"
        ? type
        : "warning";
    setToast({ isVisible: true, message, type: safeType });
  }, []);

  const closeToast = useCallback(() => {
    setToast((prev) => ({ ...prev, isVisible: false }));
  }, []);
  const containerRef = useRef<HTMLElement | null>(null);
  const yUnitOptions = useMemo(
    () =>
      DEVICE_ANALYSIS_Y_UNIT_VALUES.map((unit) => ({
        label: unit,
        value: unit,
      })),
    [],
  );
  const xSegmentationModeOptions = useMemo(
    () => [
      { label: t("da_save_segmentation_mode_auto"), value: "auto" },
      { label: t("da_save_segmentation_mode_points"), value: "points" },
      { label: t("da_save_segmentation_mode_segments"), value: "segments" },
    ],
    [t],
  );

  const {
    applyConfiguration,
    applyNewFilesConfiguration,
    closeDiscardConfirm,
    closeTemplateDropdown,
    config,
    confirmDiscardAndSwitch,
    createTemplateExportBundle,
    handleCreateNewTemplate,
    handleDeleteTemplate,
    importTemplatesFromPayload,
    handleSaveTemplate,
    handleTemplateModeChange,
    isDiscardConfirmOpen,
    isDropdownOpen,
    isSelectMode,
    loadTemplate,
    markFieldSource,
    markSaveDraftTouched,
    openTemplateDropdown,
    setConfig,
    templateTransferBusy,
    templateMode,
    templates,
    templatesLoading,
    toggleTemplateDropdown,
    writeFieldFromPreview,
  } = useTemplateManagerState({
    deviceAnalysisSettings,
    onTemplateApplied,
    onTemplateAppliedIncremental,
    onUpdateDeviceAnalysisSettings,
    previewFile,
    previewStatus: previewStatus ?? undefined,
    showToast,
    t: tLoose,
  });
  const previewWorkspaceFallback = (
    <TemplateManagerPreviewFallback
      previewFile={previewFile}
      previewStatus={previewStatus}
      t={t}
    />
  );
  const shouldRenderPreviewWorkspace =
    Boolean(previewFile?.fileId) && previewStatus?.state === "ready";

  useEffect(() => {
    const shouldPreloadPreviewWorkspace =
      Boolean(previewFile?.fileId) || previewStatus?.state === "loading";
    if (!shouldPreloadPreviewWorkspace) return;

    void loadTemplateManagerPreviewWorkspace();
  }, [previewFile?.fileId, previewStatus?.state]);

  const varPairValidation = validateVarPair(
    config?.bottomTitle,
    config?.legendPrefix,
    tLoose,
  );
  const hasVarInputs =
    Boolean(String(config?.bottomTitle ?? "").trim()) ||
    Boolean(String(config?.legendPrefix ?? "").trim());
  const hasFileNameInputs =
    Boolean(String(config?.fileNameVgKeywords ?? "").trim()) ||
    Boolean(String(config?.fileNameVdKeywords ?? "").trim());
  const curveTaggingConflict = hasVarInputs && hasFileNameInputs;
  const disableVarInputs = hasFileNameInputs && !hasVarInputs;
  const disableFileNameInputs = hasVarInputs && !hasFileNameInputs;
  const lastVarPairToastRef = useRef("");
  const xSegmentationMode = resolveXSegmentationMode(
    config?.xSegmentationMode,
  );
  const xRangeForPreview = useMemo(
    () =>
      resolveXRangeForPreview({
        xDataStart: config?.xDataStart,
        xDataEnd: config?.xDataEnd,
        previewRowCount: previewFile?.rowCount,
      }),
    [config?.xDataEnd, config?.xDataStart, previewFile?.rowCount],
  );
  const xAutoSuggestion = useMemo(
    () =>
      inferXSegmentationSuggestionFromPreview({
        xDataStart: config?.xDataStart,
        xDataEnd: config?.xDataEnd,
        previewRowCount: previewFile?.rowCount,
        getPreviewRow,
      }),
    [config?.xDataEnd, config?.xDataStart, getPreviewRow, previewFile?.rowCount],
  );
  const xAutoSuggestionText =
    xAutoSuggestion && xAutoSuggestion.groups > 1
      ? t("da_save_x_auto_suggestion", {
          groups: xAutoSuggestion.groups,
          points: xAutoSuggestion.groupSize,
        })
      : t("da_save_x_auto_suggestion_none");

  const toastVarPairIfInvalid = useCallback(() => {
    if (varPairValidation.ok) {
      lastVarPairToastRef.current = "";
      return;
    }

    const message = varPairValidation.message || t("da_invalidVarPair");
    if (lastVarPairToastRef.current === message) return;
    lastVarPairToastRef.current = message;
    showToast(message, "warning");
  }, [showToast, t, varPairValidation.ok, varPairValidation.message]);

  const handleExportTemplates = useCallback(async () => {
    const bundle = await createTemplateExportBundle();
    if (!bundle) return;

    try {
      const exportedTemplateName = String(bundle?.name ?? "").trim();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json",
      });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = formatTemplateExportFileName(exportedTemplateName);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 0);
      showToast(
        t("da_template_export_success", {
          count: 1,
        }),
        "success",
      );
    } catch (error) {
      showToast(
        t("da_template_export_failed", {
          error: error instanceof Error ? error.message : t("unknownError"),
        }),
        "warning",
      );
    }
  }, [createTemplateExportBundle, showToast, t]);

  const handleImportTemplatesClick = useCallback(() => {
    importFileInputRef.current?.click();
  }, []);

  const handleImportTemplatesFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      if (!file) return;

      try {
        const raw = await file.text();
        const payload = JSON.parse(raw) as unknown;
        await importTemplatesFromPayload(payload, { fileName: file.name });
      } catch (error) {
        showToast(
          t("da_template_import_read_failed", {
            error: error instanceof Error ? error.message : t("unknownError"),
          }),
          "warning",
        );
      } finally {
        input.value = "";
      }
    },
    [importTemplatesFromPayload, showToast, t],
  );

  const renderSavePanel = ({
    includeIds = true,
    selectModeForDisabled = false,
  } = {}) => {
    const saveIsSelectMode = Boolean(selectModeForDisabled);
    const setConfigFromSave = (updater: SetStateAction<TemplateConfig>) => {
      markSaveDraftTouched();
      setConfig(updater);
    };
    const isXAutoMode = xSegmentationMode === "auto";
    const isXSegmentsMode = xSegmentationMode === "segments";
    const xSegmentationInputValue = isXSegmentsMode
      ? String(config.xSegments ?? "")
      : String(config.xPoints ?? "");
    const xSegmentationInputPlaceholder = isXAutoMode
      ? t("da_save_segmentation_mode_auto")
      : isXSegmentsMode
        ? t("da_save_segments")
        : t("da_save_points");
    const xPointsForY = (() => {
      if (xSegmentationMode === "points") {
        return String(config.xPoints ?? "").trim();
      }
      if (xSegmentationMode === "segments") {
        const segments = Number(String(config.xSegments ?? "").trim());
        const total = Number(xRangeForPreview?.total ?? NaN);
        if (
          Number.isInteger(segments) &&
          segments > 0 &&
          Number.isInteger(total) &&
          total > 0 &&
          total % segments === 0
        ) {
          return String(total / segments);
        }
        return "";
      }
      if (
        xAutoSuggestion &&
        Number.isInteger(xAutoSuggestion.groupSize) &&
        xAutoSuggestion.groupSize > 0
      ) {
        return String(xAutoSuggestion.groupSize);
      }
      return "";
    })();

    return (
      <div className="space-y-4">
        {/* 1. X Data */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="block text-sm font-medium text-text-secondary">
              {t("da_save_x_data_label")}
            </label>
            <span className="text-xs text-text-secondary text-right">
              {xAutoSuggestionText}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Input
                id={
                  includeIds
                    ? "device-analysis-template-x-data-start"
                    : undefined
                }
                name="xDataStart"
                value={config.xDataStart}
                disabled={saveIsSelectMode}
                onChange={(next) => {
                  setConfigFromSave((prev) => ({ ...prev, xDataStart: next }));
                  markFieldSource("xDataStart", "manual");
                }}
                placeholder={t("da_save_start")}
              />
            </div>
            <div>
              <Input
                id={
                  includeIds ? "device-analysis-template-x-data-end" : undefined
                }
                name="xDataEnd"
                value={config.xDataEnd}
                disabled={saveIsSelectMode}
                onChange={(next) => {
                  setConfigFromSave((prev) => ({ ...prev, xDataEnd: next }));
                  markFieldSource("xDataEnd", "manual");
                }}
                onBlur={(e) => {
                  const value = String(e?.target?.value ?? "").trim();
                  const normalizedEnd = normalizeXDataEndValue(value);
                  if (!value) {
                    const startCell = String(config.xDataStart ?? "").trim();
                    setConfigFromSave((prev) => ({
                      ...prev,
                      xDataEnd: startCell ? "End" : "",
                    }));
                    return;
                  }
                  if (normalizedEnd === "End" && value !== "End") {
                    setConfigFromSave((prev) => ({ ...prev, xDataEnd: "End" }));
                  }
                }}
                placeholder={t("da_save_end")}
              />
            </div>
            <div>
              <Input
                id={
                  includeIds ? "device-analysis-template-x-points" : undefined
                }
                name={isXSegmentsMode ? "xSegments" : "xPoints"}
                value={xSegmentationInputValue}
                disabled={saveIsSelectMode || isXAutoMode}
                onChange={(next) => {
                  if (isXAutoMode) return;
                  if (isXSegmentsMode) {
                    setConfigFromSave((prev) => ({ ...prev, xSegments: next }));
                    markFieldSource("xSegments", "manual");
                    return;
                  }
                  setConfigFromSave((prev) => ({ ...prev, xPoints: next }));
                  markFieldSource("xPoints", "manual");
                }}
                placeholder={xSegmentationInputPlaceholder}
                inputClassName="no-spinner"
              />
            </div>
            <div>
              <Select
                id={
                  includeIds
                    ? "device-analysis-template-x-segmentation-mode"
                    : undefined
                }
                value={xSegmentationMode}
                disabled={saveIsSelectMode}
                onChange={(next) => {
                  const nextMode = resolveXSegmentationMode(next);
                  setConfigFromSave((prev) => ({
                    ...prev,
                    xSegmentationMode: nextMode,
                  }));
                  markFieldSource("xSegmentationMode", "manual");
                }}
                options={xSegmentationModeOptions}
                placeholder={t("da_save_segmentation_mode")}
                className="w-full"
              />
            </div>
            <div className="sm:col-span-2">
              <Input
                id={
                  includeIds ? "device-analysis-template-x-unit" : undefined
                }
                name="xUnit"
                value={config.xUnit}
                disabled={saveIsSelectMode}
                onChange={(next) => {
                  setConfigFromSave((prev) => ({ ...prev, xUnit: next }));
                  markFieldSource("xUnit", "manual");
                }}
                placeholder={t("da_save_x_unit")}
              />
            </div>
          </div>
        </div>

        {/* 2. Y Data */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            {t("da_save_y_data_label")}
          </label>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="min-w-0">
                <Input
                  id={
                    includeIds
                      ? "device-analysis-template-selected-columns"
                      : undefined
                  }
                  value={
                    config.selectedColumns.length > 0
                      ? config.selectedColumns
                          .slice()
                          .sort((a, b) => a - b)
                          .map((col) => getExcelColumnLabel(col))
                          .join(", ")
                      : ""
                  }
                  placeholder={t("da_save_check_columns")}
                  disabled
                  readOnly
                />
              </div>
              <div className="min-w-0">
                <Input
                  id={
                    includeIds ? "device-analysis-template-y-points" : undefined
                  }
                  value={xPointsForY || config.yPoints}
                  name="yPoints"
                  disabled={saveIsSelectMode || !!xPointsForY}
                  onChange={(next) => {
                    setConfigFromSave((prev) => ({
                      ...prev,
                      yPoints: next,
                    }));
                    markFieldSource("yPoints", "manual");
                  }}
                  placeholder={t("da_save_points")}
                  inputClassName="no-spinner"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="min-w-0">
                <Input
                  id={
                    includeIds
                      ? "device-analysis-template-y-data-start"
                      : undefined
                  }
                  value={config.yDataStart}
                  name="yDataStart"
                  disabled={saveIsSelectMode}
                  onChange={(next) => {
                    setConfigFromSave((prev) => ({
                      ...prev,
                      yDataStart: next,
                    }));
                    markFieldSource("yDataStart", "manual");
                  }}
                  placeholder={t("da_save_start")}
                />
              </div>
              <div className="min-w-0">
                <Input
                  id={
                    includeIds ? "device-analysis-template-y-count" : undefined
                  }
                  value={config.yCount}
                  name="yCount"
                  disabled={saveIsSelectMode}
                  onChange={(next) => {
                    setConfigFromSave((prev) => ({ ...prev, yCount: next }));
                    markFieldSource("yCount", "manual");
                  }}
                  placeholder={t("da_save_count")}
                  inputClassName="no-spinner"
                />
              </div>
              <div className="min-w-0">
                <Input
                  id={
                    includeIds ? "device-analysis-template-y-step" : undefined
                  }
                  value={config.yStep}
                  name="yStep"
                  disabled={saveIsSelectMode}
                  onChange={(next) => {
                    setConfigFromSave((prev) => ({ ...prev, yStep: next }));
                    markFieldSource("yStep", "manual");
                  }}
                  placeholder={t("da_save_step")}
                  inputClassName="no-spinner"
                />
              </div>
              <div className="min-w-0">
                <Select
                  id={
                    includeIds ? "device-analysis-template-y-unit" : undefined
                  }
                  value={config.yUnit || undefined}
                  disabled={saveIsSelectMode}
                  onChange={(next) => {
                    setConfigFromSave((prev) => ({
                      ...prev,
                      yUnit: String(next ?? ""),
                    }));
                    markFieldSource("yUnit", "manual");
                  }}
                  options={yUnitOptions}
                  placeholder={t("da_save_y_unit")}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 3. Var1 */}
        <div>
          <Input
            id={
              includeIds
                ? "device-analysis-template-var1-bottom-title"
                : undefined
            }
            label={t("da_save_curve_type")}
            value={config.bottomTitle || ""}
            name="bottomTitle"
            disabled={disableVarInputs}
            onChange={(next) => {
              setConfigFromSave((prev) => ({ ...prev, bottomTitle: next }));
              markFieldSource("bottomTitle", "manual");
            }}
            onBlur={toastVarPairIfInvalid}
            placeholder={t("da_save_var1")}
          />
        </div>

        {/* 4. Match by File Name */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            {t("da_match_by_file_name")}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="min-w-0">
              <Input
                id={
                  includeIds
                    ? "device-analysis-template-file-name-vg-keywords"
                    : undefined
                }
                value={config.fileNameVgKeywords || ""}
                name="fileNameVgKeywords"
                disabled={disableFileNameInputs}
                onChange={(next) => {
                  setConfigFromSave((prev) => ({
                    ...prev,
                    fileNameVgKeywords: next,
                  }));
                  markFieldSource("fileNameVgKeywords", "manual");
                }}
                placeholder={t("da_save_transfer")}
              />
            </div>
            <div className="min-w-0">
              <Input
                id={
                  includeIds
                    ? "device-analysis-template-file-name-vd-keywords"
                    : undefined
                }
                value={config.fileNameVdKeywords || ""}
                name="fileNameVdKeywords"
                disabled={disableFileNameInputs}
                onChange={(next) => {
                  setConfigFromSave((prev) => ({
                    ...prev,
                    fileNameVdKeywords: next,
                  }));
                  markFieldSource("fileNameVdKeywords", "manual");
                }}
                placeholder={t("da_save_output")}
              />
            </div>
          </div>
          {curveTaggingConflict && (
            <p className="text-xs text-red-600 mt-1">
              {t("da_save_curve_tagging_conflict")}
            </p>
          )}
        </div>

        {/* 5-6. Var2 / Var3 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="min-w-0">
            <Input
              id={
                includeIds
                  ? "device-analysis-template-var2-legend-prefix"
                  : undefined
              }
              label={t("da_save_legend")}
              value={config.legendPrefix || ""}
              name="legendPrefix"
              disabled={disableVarInputs}
              onChange={(next) => {
                setConfigFromSave((prev) => ({ ...prev, legendPrefix: next }));
                markFieldSource("legendPrefix", "manual");
              }}
              onBlur={toastVarPairIfInvalid}
              placeholder={t("da_save_var2")}
            />
          </div>
          <div className="min-w-0">
            <Input
              id={
                includeIds
                  ? "device-analysis-template-var3-left-title"
                  : undefined
              }
              label={t("da_save_left_title")}
              value={config.leftTitle || ""}
              name="leftTitle"
              onChange={(next) => {
                setConfigFromSave((prev) => ({ ...prev, leftTitle: next }));
                markFieldSource("leftTitle", "manual");
              }}
              placeholder={t("da_save_var3")}
            />
          </div>
        </div>
      </div>
    );
  };

  const renderSavePane = ({
    includeIds = true,
    selectModeForDisabled = false,
  } = {}) => (
    <div className="space-y-4 px-1">
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          {t("da_general_template")}
        </label>
        <div
          id={includeIds ? "device-analysis-template-name-row" : undefined}
          className="relative flex-1 min-w-0"
        >
          <div
            className="input_field input_field--xl relative flex-1 min-w-0 pr-1"
            data-state="enable"
          >
            <div className="relative flex items-center w-full h-full">
              <input
                id={includeIds ? "device-analysis-template-name" : undefined}
                type="text"
                name="templateName"
                autoComplete="off"
                spellCheck={false}
                value={config.name}
                onChange={(e) => {
                  const next = e.target.value;
                  markSaveDraftTouched();
                  setConfig((prev) => ({ ...prev, name: next }));
                  markFieldSource("name", "manual");
                }}
                placeholder={t("da_template_name")}
                className="input_native no-focus-outline"
              />
              <Button
                id={
                  includeIds ? "device-analysis-template-save-btn" : undefined
                }
                type="button"
                onClick={handleSaveTemplate}
                disabled={!config.name.trim()}
                variant="primary"
                size="md"
                title={t("da_save_template")}
              >
                {t("da_template_mode_save")}
                <ArrowUp size={16} />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {renderSavePanel({ includeIds, selectModeForDisabled })}
    </div>
  );

  const renderSelectPane = ({
    includeIds = true,
    measureOnly = false,
  } = {}) => {
    const shouldAttachDropdownRef = includeIds && !measureOnly;
    const shouldRenderDropdownMenu = includeIds && !measureOnly;
    const resolvedInputId = includeIds
      ? "device-analysis-template-dropdown-btn"
      : undefined;
    const displayName = String(config.name ?? "").trim();
    const hasDisplayName = Boolean(displayName);

    return (
      <div className="space-y-4 px-1">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            {t("da_general_template")}
          </label>
          <div
            className="relative flex-1 min-w-0"
            ref={shouldAttachDropdownRef ? dropdownRef : null}
          >
            <div
              id={
                includeIds ? "device-analysis-template-input-field" : undefined
              }
              className="input_field input_field--xl relative flex-1 min-w-0 pr-1"
              data-state="enable"
              {...(includeIds
                ? {
                    "data-cta": "Device Analysis",
                    "data-cta-position": "template-dropdown",
                    "data-cta-copy": "template name",
                  }
                : {})}
            >
              <button
                id={resolvedInputId}
                type="button"
                aria-haspopup={includeIds ? "menu" : undefined}
                aria-expanded={includeIds ? isDropdownOpen : undefined}
                aria-controls={
                  includeIds
                    ? "device-analysis-template-dropdown-menu"
                    : undefined
                }
                aria-label={includeIds ? t("da_template_name") : undefined}
                onMouseDown={
                  measureOnly
                    ? undefined
                    : (e) => {
                        if (e.detail > 1) e.preventDefault();
                      }
                }
                onDoubleClick={
                  measureOnly ? undefined : (e) => e.preventDefault()
                }
                onClick={
                  measureOnly
                    ? undefined
                    : toggleTemplateDropdown
                }
                onKeyDown={
                  measureOnly
                    ? undefined
                    : (e) => {
                        if (e.key === "Escape") {
                          closeTemplateDropdown();
                          return;
                        }

                        if (
                          e.key === "Enter" ||
                          e.key === " " ||
                          e.key === "ArrowDown"
                        ) {
                          e.preventDefault();
                          openTemplateDropdown();
                        }
                      }
                }
                className="input_native no-focus-outline p-0 pr-8 text-left cursor-pointer select-none"
              >
                <span
                  className={`block truncate ${
                    hasDisplayName ? "text-text-primary" : "text-text-tertiary"
                  }`}
                >
                  {hasDisplayName ? displayName : t("da_template_name")}
                </span>
              </button>

              <span className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-secondary pointer-events-none">
                <ChevronDown
                  size={16}
                  className={`transition-transform duration-200 ${
                    isDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </span>
            </div>

            {shouldRenderDropdownMenu && (
              <DropdownMenu
                isOpen={templateMode === "select" && isDropdownOpen}
                onClose={closeTemplateDropdown}
                anchorRef={dropdownRef}
                id="device-analysis-template-dropdown-menu"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-bg-page cursor-pointer group transition-colors mb-1 text-accent"
                  onClick={handleCreateNewTemplate}
                >
                  <span className="flex-1 text-sm font-medium">
                    {t("da_new_template")}
                  </span>
                  <span className="p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Plus size={14} />
                  </span>
                </button>
                {templatesLoading ? (
                  <div className="px-3 py-2 text-sm text-text-secondary italic text-center">
                    {t("da_settings_storage_loading")}
                  </div>
                ) : templates.length > 0 ? (
                  templates.map((template) => (
                    <div
                      key={template.id}
                      data-template-id={template.id}
                      className="relative group mb-0.5 last:mb-0"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => loadTemplate(template)}
                        className="w-full flex items-center justify-between px-3 py-2 pr-9 rounded-lg transition-colors text-left hover:bg-bg-page group-hover:bg-bg-page"
                      >
                        <span className="flex-1 text-sm text-text-primary font-medium truncate">
                          {template.name}
                        </span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        aria-label={t("da_delete_template")}
                        data-template-id={template.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (typeof template.id === "string") {
                            handleDeleteTemplate(template.id);
                          }
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-primary hover:text-red-500 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity"
                        title={t("da_delete_template")}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-text-secondary italic text-center">
                    {t("da_no_saved_templates")}
                  </div>
                )}
              </DropdownMenu>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            id={
              includeIds ? "device-analysis-template-apply-to-all" : undefined
            }
            variant="primary"
            size="md"
            className="flex-1"
            onClick={measureOnly ? undefined : applyConfiguration}
          >
            {t("da_apply_to_all_files")}
          </Button>
          <Button
            id={
              includeIds ? "device-analysis-template-apply-to-new" : undefined
            }
            variant="secondary"
            size="md"
            className="flex-1"
            onClick={measureOnly ? undefined : applyNewFilesConfiguration}
            disabled={typeof onTemplateAppliedIncremental !== "function"}
          >
            {t("da_apply_to_new_files")}
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <Button
            id={
              includeIds ? "device-analysis-template-export-config" : undefined
            }
            variant="secondary"
            size="md"
            className="flex-1"
            onClick={measureOnly ? undefined : handleExportTemplates}
            disabled={templateTransferBusy}
          >
            {t("da_template_export_btn")}
            <Download size={14} />
          </Button>
          <Button
            id={
              includeIds ? "device-analysis-template-import-config" : undefined
            }
            variant="secondary"
            size="md"
            className="flex-1"
            onClick={measureOnly ? undefined : handleImportTemplatesClick}
            disabled={templateTransferBusy}
          >
            {t("da_template_import_btn")}
            <Upload size={14} />
          </Button>
        </div>
        {includeIds && !measureOnly ? (
          <input
            id="device-analysis-template-import-file-input"
            ref={importFileInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={handleImportTemplatesFileChange}
          />
        ) : null}

        <div
          id={
            includeIds
              ? "device-analysis-stop-on-first-invalid-toggle"
              : undefined
          }
          onClick={
            measureOnly
              ? undefined
              : () =>
                  setConfig((prev) => {
                    const nextStopOnError = !prev.stopOnError;
                    if (typeof onUpdateDeviceAnalysisSettings === "function") {
                      void onUpdateDeviceAnalysisSettings({
                        stopOnErrorDefault: nextStopOnError,
                      });
                    }
                    return {
                      ...prev,
                      stopOnError: nextStopOnError,
                    };
                  })
          }
          className="flex items-center gap-2 text-sm text-text-secondary select-none cursor-pointer group w-fit"
        >
          {config.stopOnError ? (
            <div className="clickable-ckb" data-state="checked">
              <Check size={14} className="text-white" strokeWidth={3} />
            </div>
          ) : (
            <div className="clickable-ckb" data-state="unchecked" />
          )}
          <span>{t("da_stop_on_first_invalid_file")}</span>
        </div>
      </div>
    );
  };

  return (
    <section
      aria-label={t("da_data_extraction_template")}
      className="flex flex-col flex-1 w-full h-full min-h-0"
    >
      <Card
        ref={containerRef}
        id="device-analysis-template-manager"
        className="pt-4 pr-4 pb-4 pl-0 flex flex-col flex-1 min-h-0 min-[1200px]:h-full"
        style={
          {
            "--da-template-stack-panel-h": "clamp(24rem, 52dvh, 40rem)",
          } as CSSProperties
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 flex-1 min-h-0 items-start min-[1200px]:items-stretch">
          {/* Configuration Panel */}
          <div
            className="lg:col-span-1 self-start min-[1200px]:self-stretch flex flex-col min-h-0 h-[var(--da-template-stack-panel-h)] min-[1200px]:h-full overflow-hidden"
          >
            <div
              className="flex flex-col gap-4 flex-1 min-h-0 pl-4"
              id="device-analysis-template-config-panel-content"
            >
              <div className="pb-2 shrink-0">
                <div className="flex items-center justify-start gap-3">
                  <Tabs
                    value={templateMode}
                    onChange={handleTemplateModeChange}
                    controlsPanels
                    idBase="device-analysis-template-mode"
                    groupLabel={t("da_template_mode")}
                    options={[
                      {
                        value: "select",
                        label: t("da_template_mode_select"),
                        icon: List,
                        cta: "Device Analysis",
                        ctaPosition: "template-mode",
                        ctaCopy: "select",
                      },
                      {
                        value: "save",
                        label: t("da_template_mode_save"),
                        icon: Save,
                        cta: "Device Analysis",
                        ctaPosition: "template-mode",
                        ctaCopy: "save",
                      },
                    ]}
                  />
                </div>
              </div>

              <div
                id="device-analysis-template-mode-panel-select"
                role="tabpanel"
                aria-labelledby="device-analysis-template-mode-tab-select"
                hidden={templateMode !== "select"}
                className="flex-1 min-h-0"
              >
                {templateMode === "select" ? (
                  <ScrollArea
                    className="h-full min-h-0"
                    axis="y"
                    viewportClassName="pr-1"
                  >
                    {renderSelectPane({ includeIds: true, measureOnly: false })}
                  </ScrollArea>
                ) : null}
              </div>

              <div
                id="device-analysis-template-mode-panel-save"
                role="tabpanel"
                aria-labelledby="device-analysis-template-mode-tab-save"
                hidden={templateMode !== "save"}
                className="flex-1 min-h-0"
              >
                {templateMode === "save" ? (
                  <ScrollArea
                    className="h-full min-h-0"
                    axis="y"
                    viewportClassName="pr-1"
                  >
                    {renderSavePane({
                      includeIds: true,
                      selectModeForDisabled: isSelectMode,
                    })}
                  </ScrollArea>
                ) : null}
              </div>
            </div>
          </div>

          {/* Preview Panel */}
          {shouldRenderPreviewWorkspace ? (
            <Suspense fallback={previewWorkspaceFallback}>
              <LazyTemplateManagerPreviewWorkspace
                containerRef={containerRef}
                config={config}
                ensurePreviewRows={ensurePreviewRows}
                getPreviewRow={getPreviewRow}
                getPreviewRowsVersion={getPreviewRowsVersion}
                previewFile={previewFile}
                previewStatus={previewStatus}
                setConfig={setConfig}
                subscribePreviewRowsVersion={subscribePreviewRowsVersion}
                t={t}
                writeFieldFromPreview={writeFieldFromPreview}
              />
            </Suspense>
          ) : (
            previewWorkspaceFallback
          )}

        </div>

        <Toast
          message={toast.message}
          isVisible={toast.isVisible}
          onClose={closeToast}
          type={toast.type}
          containerRef={containerRef}
          position="absolute"
        />

        <Modal
          isOpen={isDiscardConfirmOpen}
          onClose={closeDiscardConfirm}
          idBase="device-analysis-template-discard-confirm"
          title={t("da_template_discard_changes_title")}
          footer={
            <>
              <Button
                id="device-analysis-template-discard-confirm-keep-editing"
                variant="ghost"
                onClick={closeDiscardConfirm}
              >
                {t("da_template_discard_changes_keep_editing")}
              </Button>
              <Button
                id="device-analysis-template-discard-confirm-discard"
                variant="primary"
                onClick={confirmDiscardAndSwitch}
              >
                {t("da_template_discard_changes_discard")}
              </Button>
            </>
          }
          size="sm"
        >
          <p className="text-sm text-text-secondary">
            {t("da_template_discard_changes_desc")}
          </p>
        </Modal>
      </Card>
    </section>
  );
};

export default React.memo(TemplateManager);




