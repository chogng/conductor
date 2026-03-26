import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  Download,
  Upload,
} from "lucide-react";
import { useLanguage } from "../../../../hooks/useLanguage";
import type { TranslateFn, TranslationVars } from "../../../../context/language";
import Toast from "../../../../components/ui/Toast";
import Input from "../../../../components/ui/Input";
import Tabs from "../../../../components/ui/Tabs";
import Card from "../../../../components/ui/Card";
import Button from "../../../../components/ui/Button";
import Modal from "../../../../components/ui/Modal";
import DropdownMenu from "../../../../components/ui/DropdownMenu";
import ScrollArea from "../../../../components/ui/ScrollArea";
import {
  TemplateManagerPreviewEmptyState,
  TemplateManagerPreviewSurface,
} from "./TemplateManagerPreviewSurface";
import TemplateManagerPreviewWorkspace from "./TemplateManagerPreviewWorkspace";
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
    <TemplateManagerPreviewSurface
      previewFile={previewFile}
      previewStatus={previewStatus}
      t={t}
    >
      <TemplateManagerPreviewEmptyState
        id="device-analysis-template-preview-fallback"
        title={title}
        hint={hint}
      />
    </TemplateManagerPreviewSurface>
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

const X_AUTO_SUGGESTION_MAX_SCAN_ROWS = 5000;
const FILE_RULE_PREFIX_DELIMITER = ", ";

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
  const sanitizeFileNamePrefixInput = useCallback(
    (value: unknown) =>
      String(value ?? "")
        .split(/[,;\n]+/)
        .map((token) => token.trim())
        .filter(Boolean)
        .join(FILE_RULE_PREFIX_DELIMITER),
    [],
  );
  const dropdownRef = useRef(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [toast, setToast] = useState({
    isVisible: false,
    message: "",
    type: "success" as ToastType,
  });
  const [previewRowsVersionSnapshot, setPreviewRowsVersionSnapshot] = useState(0);

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
  const xSegmentationModeMenuRef = useRef<HTMLDivElement | null>(null);
  const xUnitMenuRef = useRef<HTMLDivElement | null>(null);
  const yUnitMenuRef = useRef<HTMLDivElement | null>(null);
  const transferRuleTemplateMenuRef = useRef<HTMLDivElement | null>(null);
  const outputRuleTemplateMenuRef = useRef<HTMLDivElement | null>(null);
  const [isXSegmentationModeMenuOpen, setIsXSegmentationModeMenuOpen] =
    useState(false);
  const [isXUnitMenuOpen, setIsXUnitMenuOpen] = useState(false);
  const [isYUnitMenuOpen, setIsYUnitMenuOpen] = useState(false);
  const [isTransferRuleTemplateMenuOpen, setIsTransferRuleTemplateMenuOpen] =
    useState(false);
  const [isOutputRuleTemplateMenuOpen, setIsOutputRuleTemplateMenuOpen] =
    useState(false);
  const yUnitOptions = useMemo(
    () =>
      DEVICE_ANALYSIS_Y_UNIT_VALUES.map((unit) => ({
        label: unit,
        value: unit,
      })),
    [],
  );
  const xUnitOptions = useMemo(
    () =>
      ["V", "mV"].map((unit) => ({
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
    applyConfigurationWithConfig,
    applyNewFilesConfigurationWithConfig,
    closeDiscardConfirm,
    closeTemplateDropdown,
    config,
    confirmDiscardAndSwitch,
    createTemplateExportBundle,
    ensureTemplatesLoaded,
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
  const availableTemplateNames = useMemo(
    () =>
      (Array.isArray(templates) ? templates : [])
        .map((entry) => String(entry?.name ?? "").trim())
        .filter(Boolean),
    [templates],
  );
  const availableTemplateOptions = useMemo(
    () => availableTemplateNames.map((name) => ({ label: name, value: name })),
    [availableTemplateNames],
  );
  const resolveTemplateByName = useCallback(
    (name: string) => {
      const target = String(name ?? "").trim();
      if (!target) return null;
      return (
        (Array.isArray(templates) ? templates : []).find(
          (entry) => String(entry?.name ?? "").trim() === target,
        ) || null
      );
    },
    [templates],
  );
  const cloneTemplateConfigFromRecord = useCallback(
    (template: Record<string, unknown>): TemplateConfig => {
      const selectedColumns = Array.isArray(template?.selectedColumns)
        ? template.selectedColumns
            .map((entry) => Number(entry))
            .filter((entry) => Number.isInteger(entry) && entry >= 0)
        : [];
      const xDataStart = String(template?.xDataStart ?? "");
      const xDataEndRaw = normalizeXDataEndValue(template?.xDataEnd);
      const xDataEnd = !xDataEndRaw ? (xDataStart.trim() ? "End" : "") : xDataEndRaw;

      return {
        name: String(template?.name ?? ""),
        xDataStart,
        xDataEnd,
        xSegmentationMode: resolveXSegmentationMode(template?.xSegmentationMode),
        xSegments: String(template?.xSegments ?? ""),
        xPoints: String(template?.xPoints ?? ""),
        xUnit: String(template?.xUnit ?? "V"),
        yDataStart: String(template?.yDataStart ?? ""),
        yDataEnd: String(template?.yDataEnd ?? ""),
        yPoints: String(template?.yPoints ?? ""),
        yCount: String(template?.yCount ?? ""),
        yStep: String(template?.yStep ?? ""),
        yUnit: String(template?.yUnit ?? "A"),
        stopOnError: Boolean(template?.stopOnError),
        bottomTitle: String(template?.bottomTitle ?? template?.vgKeyword ?? ""),
        leftTitle: String(template?.leftTitle ?? ""),
        legendPrefix: String(template?.legendPrefix ?? template?.vdKeyword ?? ""),
        fileNameVgKeywords: String(
          template?.fileNameVgKeywords ?? template?.vgFileKeywords ?? "",
        ),
        fileNameVdKeywords: String(
          template?.fileNameVdKeywords ?? template?.vdFileKeywords ?? "",
        ),
        selectedColumns,
      };
    },
    [],
  );

  const varPairValidation = validateVarPair(
    config?.bottomTitle,
    config?.legendPrefix,
    tLoose,
  );
  const [transferRuleTemplateName, setTransferRuleTemplateName] = useState("");
  const [outputRuleTemplateName, setOutputRuleTemplateName] = useState("");
  const transferRuleTemplate = resolveTemplateByName(transferRuleTemplateName);
  const outputRuleTemplate = resolveTemplateByName(outputRuleTemplateName);
  const buildRuleApplyConfig = useCallback(
    (prefixValue: string, templateName: string, ruleKey: "transfer" | "output") => {
      const templateRecord = resolveTemplateByName(templateName);
      if (!templateRecord) return null;
      const normalizedPrefix = sanitizeFileNamePrefixInput(prefixValue);
      const nextConfig = cloneTemplateConfigFromRecord(
        templateRecord as Record<string, unknown>,
      );
      if (ruleKey === "transfer") {
        nextConfig.fileNameVgKeywords = normalizedPrefix;
        nextConfig.fileNameVdKeywords = "";
      } else {
        nextConfig.fileNameVgKeywords = "";
        nextConfig.fileNameVdKeywords = normalizedPrefix;
      }
      return nextConfig;
    },
    [cloneTemplateConfigFromRecord, resolveTemplateByName, sanitizeFileNamePrefixInput],
  );
  const applyRuleTemplate = useCallback(
    (ruleKey: "transfer" | "output", incremental: boolean) => {
      const prefix =
        ruleKey === "transfer"
          ? String(config?.fileNameVgKeywords ?? "")
          : String(config?.fileNameVdKeywords ?? "");
      const templateName =
        ruleKey === "transfer" ? transferRuleTemplateName : outputRuleTemplateName;
      const nextConfig = buildRuleApplyConfig(prefix, templateName, ruleKey);
      if (!nextConfig) {
        showToast(t("da_template_name"), "warning");
        return;
      }
      if (incremental) {
        applyNewFilesConfigurationWithConfig(nextConfig);
      } else {
        applyConfigurationWithConfig(nextConfig);
      }
    },
    [
      applyConfigurationWithConfig,
      applyNewFilesConfigurationWithConfig,
      buildRuleApplyConfig,
      config?.fileNameVdKeywords,
      config?.fileNameVgKeywords,
      outputRuleTemplateName,
      showToast,
      t,
      transferRuleTemplateName,
    ],
  );
  useEffect(() => {
    if (templateMode === "select") {
      void ensureTemplatesLoaded().catch(() => {});
    }
  }, [ensureTemplatesLoaded, templateMode]);
  useEffect(() => {
    if (!availableTemplateNames.length) {
      setTransferRuleTemplateName("");
      setOutputRuleTemplateName("");
      return;
    }
    if (
      transferRuleTemplateName &&
      !availableTemplateNames.includes(transferRuleTemplateName)
    ) {
      setTransferRuleTemplateName("");
    }
    if (
      outputRuleTemplateName &&
      !availableTemplateNames.includes(outputRuleTemplateName)
    ) {
      setOutputRuleTemplateName("");
    }
  }, [availableTemplateNames, outputRuleTemplateName, transferRuleTemplateName]);
  useEffect(() => {
    if (templateMode !== "save") {
      setIsXSegmentationModeMenuOpen(false);
      setIsXUnitMenuOpen(false);
      setIsYUnitMenuOpen(false);
    }
    if (templateMode !== "select") {
      setIsTransferRuleTemplateMenuOpen(false);
      setIsOutputRuleTemplateMenuOpen(false);
    }
  }, [templateMode]);
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

  useEffect(() => {
    if (typeof subscribePreviewRowsVersion !== "function") return undefined;

    const syncPreviewRowsVersion = () => {
      if (typeof getPreviewRowsVersion === "function") {
        setPreviewRowsVersionSnapshot(getPreviewRowsVersion());
        return;
      }
      setPreviewRowsVersionSnapshot((prev) => prev + 1);
    };

    syncPreviewRowsVersion();
    const unsubscribe = subscribePreviewRowsVersion(syncPreviewRowsVersion);
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [getPreviewRowsVersion, subscribePreviewRowsVersion]);

  useEffect(() => {
    if (typeof ensurePreviewRows !== "function") return;
    const fileId = String(previewFile?.fileId ?? "").trim();
    if (!fileId || !xRangeForPreview) return;

    const startRow = Math.max(0, xRangeForPreview.startRow);
    const endRowExclusive = Math.min(
      xRangeForPreview.endRow + 1,
      startRow + X_AUTO_SUGGESTION_MAX_SCAN_ROWS,
    );
    if (endRowExclusive <= startRow) return;

    void ensurePreviewRows(fileId, startRow, endRowExclusive);
  }, [
    ensurePreviewRows,
    previewFile?.fileId,
    xRangeForPreview?.endRow,
    xRangeForPreview?.startRow,
  ]);

  const xAutoSuggestion = useMemo(
    () =>
      inferXSegmentationSuggestionFromPreview({
        xDataStart: config?.xDataStart,
        xDataEnd: config?.xDataEnd,
        previewRowCount: previewFile?.rowCount,
        getPreviewRow,
        maxScanRows: X_AUTO_SUGGESTION_MAX_SCAN_ROWS,
      }),
    [
      config?.xDataEnd,
      config?.xDataStart,
      getPreviewRow,
      previewFile?.rowCount,
      previewRowsVersionSnapshot,
    ],
  );
  const xAutoSuggestionText =
    xAutoSuggestion && xAutoSuggestion.groupSize > 0
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
            <div className="relative min-w-0" ref={xSegmentationModeMenuRef}>
              <div
                className="input_field input_field--md relative flex-1 min-w-0 pr-1"
                data-state={saveIsSelectMode ? "disable" : "enable"}
              >
                <button
                  id={
                    includeIds
                      ? "device-analysis-template-x-segmentation-mode"
                      : undefined
                  }
                  type="button"
                  disabled={saveIsSelectMode}
                  aria-haspopup="menu"
                  aria-expanded={isXSegmentationModeMenuOpen}
                  aria-controls={
                    includeIds
                      ? "device-analysis-template-x-segmentation-mode-menu"
                      : undefined
                  }
                  onClick={() => {
                    if (saveIsSelectMode) return;
                    setIsXSegmentationModeMenuOpen((prev) => !prev);
                  }}
                  onKeyDown={(e) => {
                    if (saveIsSelectMode) return;
                    if (e.key === "Escape") {
                      setIsXSegmentationModeMenuOpen(false);
                      return;
                    }
                    if (
                      e.key === "Enter" ||
                      e.key === " " ||
                      e.key === "ArrowDown"
                    ) {
                      e.preventDefault();
                      setIsXSegmentationModeMenuOpen(true);
                    }
                  }}
                  className="input_native no-focus-outline p-0 pr-8 text-left cursor-pointer select-none disabled:cursor-not-allowed"
                >
                  <span className="block truncate text-text-primary">
                    {xSegmentationModeOptions.find(
                      (entry) =>
                        String(entry.value) === String(xSegmentationMode),
                    )?.label || t("da_save_segmentation_mode")}
                  </span>
                </button>

                <span className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-secondary pointer-events-none">
                  <ChevronDown
                    size={16}
                    className={`transition-transform duration-200 ${
                      isXSegmentationModeMenuOpen ? "rotate-180" : ""
                    }`}
                  />
                </span>
              </div>
              <DropdownMenu
                isOpen={isXSegmentationModeMenuOpen}
                onClose={() => setIsXSegmentationModeMenuOpen(false)}
                anchorRef={xSegmentationModeMenuRef}
                id={
                  includeIds
                    ? "device-analysis-template-x-segmentation-mode-menu"
                    : undefined
                }
                role="menu"
              >
                {xSegmentationModeOptions.map((entry) => {
                  const isActive =
                    String(entry.value) === String(xSegmentationMode);
                  return (
                    <button
                      key={`${entry.value}`}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isActive}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-bg-page cursor-pointer transition-colors"
                      onClick={() => {
                        const nextMode = resolveXSegmentationMode(entry.value);
                        setConfigFromSave((prev) => ({
                          ...prev,
                          xSegmentationMode: nextMode,
                        }));
                        markFieldSource("xSegmentationMode", "manual");
                        setIsXSegmentationModeMenuOpen(false);
                      }}
                    >
                      <span className="text-sm text-text-primary truncate">
                        {entry.label}
                      </span>
                      {isActive ? (
                        <span className="text-accent">
                          <Check size={14} />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </DropdownMenu>
            </div>
            <div className="sm:col-span-2 relative min-w-0" ref={xUnitMenuRef}>
              <div
                className="input_field input_field--md relative flex-1 min-w-0 pr-1"
                data-state={saveIsSelectMode ? "disable" : "enable"}
              >
                <button
                  id={includeIds ? "device-analysis-template-x-unit" : undefined}
                  type="button"
                  disabled={saveIsSelectMode}
                  aria-haspopup="menu"
                  aria-expanded={isXUnitMenuOpen}
                  aria-controls={
                    includeIds ? "device-analysis-template-x-unit-menu" : undefined
                  }
                  onClick={() => {
                    if (saveIsSelectMode) return;
                    setIsXUnitMenuOpen((prev) => !prev);
                  }}
                  onKeyDown={(e) => {
                    if (saveIsSelectMode) return;
                    if (e.key === "Escape") {
                      setIsXUnitMenuOpen(false);
                      return;
                    }
                    if (
                      e.key === "Enter" ||
                      e.key === " " ||
                      e.key === "ArrowDown"
                    ) {
                      e.preventDefault();
                      setIsXUnitMenuOpen(true);
                    }
                  }}
                  className="input_native no-focus-outline p-0 pr-8 text-left cursor-pointer select-none disabled:cursor-not-allowed"
                >
                  <span className="block truncate text-text-primary">
                    {xUnitOptions.find(
                      (entry) =>
                        String(entry.value) === String(config.xUnit || "V"),
                    )?.label || t("da_save_x_unit")}
                  </span>
                </button>

                <span className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-secondary pointer-events-none">
                  <ChevronDown
                    size={16}
                    className={`transition-transform duration-200 ${
                      isXUnitMenuOpen ? "rotate-180" : ""
                    }`}
                  />
                </span>
              </div>
              <DropdownMenu
                isOpen={isXUnitMenuOpen}
                onClose={() => setIsXUnitMenuOpen(false)}
                anchorRef={xUnitMenuRef}
                id={
                  includeIds ? "device-analysis-template-x-unit-menu" : undefined
                }
                role="menu"
              >
                {xUnitOptions.map((entry) => {
                  const isActive =
                    String(entry.value) === String(config.xUnit || "V");
                  return (
                    <button
                      key={`${entry.value}`}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isActive}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-bg-page cursor-pointer transition-colors"
                      onClick={() => {
                        setConfigFromSave((prev) => ({
                          ...prev,
                          xUnit: String(entry.value || "V"),
                        }));
                        markFieldSource("xUnit", "manual");
                        setIsXUnitMenuOpen(false);
                      }}
                    >
                      <span className="text-sm text-text-primary truncate">
                        {entry.label}
                      </span>
                      {isActive ? (
                        <span className="text-accent">
                          <Check size={14} />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </DropdownMenu>
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
              <div className="min-w-0 relative" ref={yUnitMenuRef}>
                <div
                  className="input_field input_field--md relative flex-1 min-w-0 pr-1"
                  data-state={saveIsSelectMode ? "disable" : "enable"}
                >
                  <button
                    id={includeIds ? "device-analysis-template-y-unit" : undefined}
                    type="button"
                    disabled={saveIsSelectMode}
                    aria-haspopup="menu"
                    aria-expanded={isYUnitMenuOpen}
                    aria-controls={
                      includeIds ? "device-analysis-template-y-unit-menu" : undefined
                    }
                    onClick={() => {
                      if (saveIsSelectMode) return;
                      setIsYUnitMenuOpen((prev) => !prev);
                    }}
                    onKeyDown={(e) => {
                      if (saveIsSelectMode) return;
                      if (e.key === "Escape") {
                        setIsYUnitMenuOpen(false);
                        return;
                      }
                      if (
                        e.key === "Enter" ||
                        e.key === " " ||
                        e.key === "ArrowDown"
                      ) {
                        e.preventDefault();
                        setIsYUnitMenuOpen(true);
                      }
                    }}
                    className="input_native no-focus-outline p-0 pr-8 text-left cursor-pointer select-none disabled:cursor-not-allowed"
                  >
                    <span className="block truncate text-text-primary">
                      {yUnitOptions.find(
                        (entry) =>
                          String(entry.value) === String(config.yUnit || "A"),
                      )?.label || t("da_save_y_unit")}
                    </span>
                  </button>

                  <span className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-secondary pointer-events-none">
                    <ChevronDown
                      size={16}
                      className={`transition-transform duration-200 ${
                        isYUnitMenuOpen ? "rotate-180" : ""
                      }`}
                    />
                  </span>
                </div>
                <DropdownMenu
                  isOpen={isYUnitMenuOpen}
                  onClose={() => setIsYUnitMenuOpen(false)}
                  anchorRef={yUnitMenuRef}
                  id={
                    includeIds ? "device-analysis-template-y-unit-menu" : undefined
                  }
                  role="menu"
                >
                  {yUnitOptions.map((entry) => {
                    const isActive =
                      String(entry.value) === String(config.yUnit || "A");
                    return (
                      <button
                        key={`${entry.value}`}
                        type="button"
                        role="menuitemradio"
                        aria-checked={isActive}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-bg-page cursor-pointer transition-colors"
                        onClick={() => {
                          setConfigFromSave((prev) => ({
                            ...prev,
                            yUnit: String(entry.value || "A"),
                          }));
                          markFieldSource("yUnit", "manual");
                          setIsYUnitMenuOpen(false);
                        }}
                      >
                        <span className="text-sm text-text-primary truncate">
                          {entry.label}
                        </span>
                        {isActive ? (
                          <span className="text-accent">
                            <Check size={14} />
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </DropdownMenu>
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
            onChange={(next) => {
              setConfigFromSave((prev) => ({ ...prev, bottomTitle: next }));
              markFieldSource("bottomTitle", "manual");
            }}
            onBlur={toastVarPairIfInvalid}
            placeholder={t("da_save_var1")}
          />
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
    const setConfigFromSelect = (updater: SetStateAction<TemplateConfig>) => {
      markSaveDraftTouched();
      setConfig(updater);
    };
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

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            {t("da_match_by_file_name")}
          </label>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-4">
                <div className="min-w-0">
                  <Input
                    id={
                      includeIds
                        ? "device-analysis-template-file-name-vg-keywords"
                        : undefined
                    }
                    value={config.fileNameVgKeywords || ""}
                    name="fileNameVgKeywords"
                    disabled={measureOnly}
                    onChange={(next) => {
                      setConfigFromSelect((prev) => ({
                        ...prev,
                        fileNameVgKeywords: next,
                      }));
                      markFieldSource("fileNameVgKeywords", "manual");
                    }}
                    placeholder={t("da_save_transfer")}
                  />
                </div>
                <div
                  className="relative min-w-0"
                  ref={transferRuleTemplateMenuRef}
                >
                  <div
                    className="input_field input_field--md relative flex-1 min-w-0 pr-1"
                    data-state={
                      measureOnly || templatesLoading ? "disable" : "enable"
                    }
                  >
                    <button
                      id={
                        includeIds
                          ? "device-analysis-template-transfer-rule-template-select"
                          : undefined
                      }
                      type="button"
                      disabled={measureOnly || templatesLoading}
                      aria-haspopup="menu"
                      aria-expanded={isTransferRuleTemplateMenuOpen}
                      aria-controls={
                        includeIds
                          ? "device-analysis-template-transfer-rule-template-menu"
                          : undefined
                      }
                      onClick={() => {
                        if (measureOnly || templatesLoading) return;
                        setIsTransferRuleTemplateMenuOpen((prev) => !prev);
                      }}
                      onKeyDown={(e) => {
                        if (measureOnly || templatesLoading) return;
                        if (e.key === "Escape") {
                          setIsTransferRuleTemplateMenuOpen(false);
                          return;
                        }
                        if (
                          e.key === "Enter" ||
                          e.key === " " ||
                          e.key === "ArrowDown"
                        ) {
                          e.preventDefault();
                          setIsTransferRuleTemplateMenuOpen(true);
                        }
                      }}
                      className="input_native no-focus-outline p-0 pr-8 text-left cursor-pointer select-none disabled:cursor-not-allowed"
                    >
                      <span
                        className={`block truncate ${
                          transferRuleTemplateName
                            ? "text-text-primary"
                            : "text-text-tertiary"
                        }`}
                      >
                        {transferRuleTemplateName || t("da_template_name")}
                      </span>
                    </button>

                    <span className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-secondary pointer-events-none">
                      <ChevronDown
                        size={16}
                        className={`transition-transform duration-200 ${
                          isTransferRuleTemplateMenuOpen ? "rotate-180" : ""
                        }`}
                      />
                    </span>
                  </div>
                  <DropdownMenu
                    isOpen={isTransferRuleTemplateMenuOpen}
                    onClose={() => setIsTransferRuleTemplateMenuOpen(false)}
                    anchorRef={transferRuleTemplateMenuRef}
                    id={
                      includeIds
                        ? "device-analysis-template-transfer-rule-template-menu"
                        : undefined
                    }
                    role="menu"
                  >
                    {availableTemplateOptions.length > 0 ? (
                      availableTemplateOptions.map((entry) => {
                        const isActive =
                          String(entry.value) ===
                          String(transferRuleTemplateName || "");
                        return (
                          <button
                            key={`${entry.value}`}
                            type="button"
                            role="menuitemradio"
                            aria-checked={isActive}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-bg-page cursor-pointer transition-colors"
                            onClick={() => {
                              setTransferRuleTemplateName(
                                String(entry.value || ""),
                              );
                              setIsTransferRuleTemplateMenuOpen(false);
                            }}
                          >
                            <span className="text-sm text-text-primary truncate">
                              {entry.label}
                            </span>
                            {isActive ? (
                              <span className="text-accent">
                                <Check size={14} />
                              </span>
                            ) : null}
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-3 py-2 text-sm text-text-secondary italic text-center">
                        {t("da_template_name")}
                      </div>
                    )}
                  </DropdownMenu>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  id={
                    includeIds
                      ? "device-analysis-template-transfer-rule-apply-to-all"
                      : undefined
                  }
                  variant="primary"
                  size="md"
                  onClick={
                    measureOnly
                      ? undefined
                      : () => applyRuleTemplate("transfer", false)
                  }
                  disabled={measureOnly || !transferRuleTemplate}
                >
                  {t("da_apply_to_all_files")}
                </Button>
                <Button
                  id={
                    includeIds
                      ? "device-analysis-template-transfer-rule-apply-to-new"
                      : undefined
                  }
                  variant="secondary"
                  size="md"
                  onClick={
                    measureOnly
                      ? undefined
                      : () => applyRuleTemplate("transfer", true)
                  }
                  disabled={
                    measureOnly ||
                    !transferRuleTemplate ||
                    typeof onTemplateAppliedIncremental !== "function"
                  }
                >
                  {t("da_apply_to_new_files")}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-4">
                <div className="min-w-0">
                  <Input
                    id={
                      includeIds
                        ? "device-analysis-template-file-name-vd-keywords"
                        : undefined
                    }
                    value={config.fileNameVdKeywords || ""}
                    name="fileNameVdKeywords"
                    disabled={measureOnly}
                    onChange={(next) => {
                      setConfigFromSelect((prev) => ({
                        ...prev,
                        fileNameVdKeywords: next,
                      }));
                      markFieldSource("fileNameVdKeywords", "manual");
                    }}
                    placeholder={t("da_save_output")}
                  />
                </div>
                <div className="relative min-w-0" ref={outputRuleTemplateMenuRef}>
                  <div
                    className="input_field input_field--md relative flex-1 min-w-0 pr-1"
                    data-state={
                      measureOnly || templatesLoading ? "disable" : "enable"
                    }
                  >
                    <button
                      id={
                        includeIds
                          ? "device-analysis-template-output-rule-template-select"
                          : undefined
                      }
                      type="button"
                      disabled={measureOnly || templatesLoading}
                      aria-haspopup="menu"
                      aria-expanded={isOutputRuleTemplateMenuOpen}
                      aria-controls={
                        includeIds
                          ? "device-analysis-template-output-rule-template-menu"
                          : undefined
                      }
                      onClick={() => {
                        if (measureOnly || templatesLoading) return;
                        setIsOutputRuleTemplateMenuOpen((prev) => !prev);
                      }}
                      onKeyDown={(e) => {
                        if (measureOnly || templatesLoading) return;
                        if (e.key === "Escape") {
                          setIsOutputRuleTemplateMenuOpen(false);
                          return;
                        }
                        if (
                          e.key === "Enter" ||
                          e.key === " " ||
                          e.key === "ArrowDown"
                        ) {
                          e.preventDefault();
                          setIsOutputRuleTemplateMenuOpen(true);
                        }
                      }}
                      className="input_native no-focus-outline p-0 pr-8 text-left cursor-pointer select-none disabled:cursor-not-allowed"
                    >
                      <span
                        className={`block truncate ${
                          outputRuleTemplateName
                            ? "text-text-primary"
                            : "text-text-tertiary"
                        }`}
                      >
                        {outputRuleTemplateName || t("da_template_name")}
                      </span>
                    </button>

                    <span className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-secondary pointer-events-none">
                      <ChevronDown
                        size={16}
                        className={`transition-transform duration-200 ${
                          isOutputRuleTemplateMenuOpen ? "rotate-180" : ""
                        }`}
                      />
                    </span>
                  </div>
                  <DropdownMenu
                    isOpen={isOutputRuleTemplateMenuOpen}
                    onClose={() => setIsOutputRuleTemplateMenuOpen(false)}
                    anchorRef={outputRuleTemplateMenuRef}
                    id={
                      includeIds
                        ? "device-analysis-template-output-rule-template-menu"
                        : undefined
                    }
                    role="menu"
                  >
                    {availableTemplateOptions.length > 0 ? (
                      availableTemplateOptions.map((entry) => {
                        const isActive =
                          String(entry.value) === String(outputRuleTemplateName || "");
                        return (
                          <button
                            key={`${entry.value}`}
                            type="button"
                            role="menuitemradio"
                            aria-checked={isActive}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-bg-page cursor-pointer transition-colors"
                            onClick={() => {
                              setOutputRuleTemplateName(String(entry.value || ""));
                              setIsOutputRuleTemplateMenuOpen(false);
                            }}
                          >
                            <span className="text-sm text-text-primary truncate">
                              {entry.label}
                            </span>
                            {isActive ? (
                              <span className="text-accent">
                                <Check size={14} />
                              </span>
                            ) : null}
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-3 py-2 text-sm text-text-secondary italic text-center">
                        {t("da_template_name")}
                      </div>
                    )}
                  </DropdownMenu>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  id={
                    includeIds
                      ? "device-analysis-template-output-rule-apply-to-all"
                      : undefined
                  }
                  variant="primary"
                  size="md"
                  onClick={
                    measureOnly
                      ? undefined
                      : () => applyRuleTemplate("output", false)
                  }
                  disabled={measureOnly || !outputRuleTemplate}
                >
                  {t("da_apply_to_all_files")}
                </Button>
                <Button
                  id={
                    includeIds
                      ? "device-analysis-template-output-rule-apply-to-new"
                      : undefined
                  }
                  variant="secondary"
                  size="md"
                  onClick={
                    measureOnly
                      ? undefined
                      : () => applyRuleTemplate("output", true)
                  }
                  disabled={
                    measureOnly ||
                    !outputRuleTemplate ||
                    typeof onTemplateAppliedIncremental !== "function"
                  }
                >
                  {t("da_apply_to_new_files")}
                </Button>
              </div>
            </div>
          </div>
        </div>

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
            <TemplateManagerPreviewWorkspace
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




