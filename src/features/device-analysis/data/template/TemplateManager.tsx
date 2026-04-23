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
  List,
  Save,
  Plus,
  Check,
  Download,
  Upload,
  X,
  AlertTriangle,
} from "lucide-react";
import { useLanguage } from "../../../../hooks/useLanguage";
import type { TranslateFn, TranslationVars } from "../../../../context/language";
import Toast from "../../../../components/ui/Toast";
import Input from "../../../../components/ui/Input";
import DropdownField from "../../../../components/ui/DropdownField";
import Dropdown from "../../../../components/ui/Dropdown";
import ContentView from "../../../../components/ui/ContentView";
import DropdownTrigger from "../../../../components/ui/DropdownTrigger";
import Menu from "../../../../components/ui/Menu";
import MenuItem from "../../../../components/ui/MenuItem";
import Tabs from "../../../../components/ui/Tabs";
import Card from "../../../../components/ui/Card";
import Button from "../../../../components/ui/Button";
import Modal from "../../../../components/ui/Modal";
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
  createEmptyTemplateConfig,
  normalizeXDataEndValue,
  normalizeTemplateConfigRecord,
  type TemplateConfig,
} from "./templateManagerUtils";
import { DEVICE_ANALYSIS_Y_UNIT_VALUES } from "../../analysis/lib/deviceAnalysisUnits";
import {
  buildDeviceAnalysisAutoTemplateConfig,
  inferDeviceAnalysisAutoExtraction,
  DEVICE_ANALYSIS_AUTO_TEMPLATE_ID,
  type DeviceAnalysisAutoExtractionResult,
} from "../../shared/lib/deviceAnalysisAutoExtraction";
import { stableStringify } from "../../shared/lib/deviceAnalysisUtils";
import {
  deriveFileNameFieldSuggestions,
  joinFileNameMatchInput,
  matchFileNameAgainstPhrase,
  matchFileNameAgainstPatternTokens,
  normalizeFileNameFieldSeparators,
  splitFileNameMatchInput,
} from "../../shared/lib/fileNameFieldMatching";
import {
  inferXSegmentationSuggestionFromPreview,
  resolveXRangeForPreview,
  resolveXSegmentationMode,
} from "../../shared/lib/XSegmentation";
import { shouldStackTemplateTransferButtons } from "../../deviceAnalysisLayout";
import type { PreviewStatus as SessionPreviewStatus } from "../../session/device-analysis-session-context";
import { useDeviceAnalysisSession } from "../../session/useDeviceAnalysisSession";
import type {
  PreviewFileLike,
  RawDataEntry,
  ToastType,
} from "../../shared/lib/sharedTypes";

export type TemplateManagerProps = {
  previewFile?: PreviewFileLike | null;
  previewStatus?: Partial<SessionPreviewStatus> | null;
  sidebarWidth?: number;
  rawData?: RawDataEntry[];
  getPreviewRow?: (rowIndex: number) => unknown;
  ensurePreviewRows?: (
    fileId: string,
    startRow: number,
    endRow: number,
  ) => Promise<unknown> | unknown;
  onTemplateApplied?: (config: Record<string, unknown>) => unknown;
  onTemplateAppliedIncremental?: (config: Record<string, unknown>) => unknown;
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
  const title =
    previewStatus?.state === "loading"
      ? previewStatus.message || t("da_preview_loading")
      : previewStatus?.state === "error"
        ? previewStatus.message || t("da_preview_error")
        : undefined;
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
const AUTO_EXTRACTION_PREVIEW_MAX_ROWS = 512;
const FILE_NAME_TEMPLATE_RULE_PREFIX = "rule";

type FileNameTemplateRuleDraft = {
  id: string;
  matchMode: "field" | "phrase";
  pattern: string;
  templateName: string;
};

type FileNameTemplateRuleRuntimeConfig = {
  id: string;
  matchMode: "field" | "phrase";
  pattern: string;
  templateName: string;
  templateConfig: TemplateConfig;
};

type FileNameTemplateRulePayload = {
  matchMode: "field" | "phrase";
  pattern: string;
  templateName: string;
  templateConfig: TemplateConfig;
  caseSensitive: boolean;
};

const TemplateManager = ({
  previewFile,
  previewStatus,
  sidebarWidth,
  rawData = [],
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
  const {
    processedData,
    selectedTemplateId,
    setSelectedTemplateId,
    selectedPreviewFileId,
    setSelectedPreviewFileId,
  } = useDeviceAnalysisSession();
  const tLoose = useCallback(
    (key: string, params?: Record<string, unknown>) =>
      t(key, params as TranslationVars | undefined),
    [t],
  );
  const sanitizeFileNamePrefixInput = useCallback(
    (value: unknown) =>
      joinFileNameMatchInput(splitFileNameMatchInput(value, true)),
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
  const shouldStackTransferButtons =
    shouldStackTemplateTransferButtons(sidebarWidth);
  const transferButtonsContainerClassName = shouldStackTransferButtons
    ? "flex flex-col gap-3"
    : "flex items-center gap-3";
  const transferButtonClassName = shouldStackTransferButtons
    ? "w-full min-w-0"
    : "flex-1 min-w-0";
  const applyButtonsContainerClassName = shouldStackTransferButtons
    ? "grid grid-cols-1 gap-3 mt-3"
    : "grid grid-cols-2 gap-3 mt-3";
  const containerRef = useRef<HTMLElement | null>(null);
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
  const legendMappingOptions = useMemo(
    () => [
      { label: t("da_save_legend_mapping_auto"), value: "auto" },
      { label: t("da_save_legend_mapping_y_column"), value: "yColumn" },
      { label: t("da_save_legend_mapping_x_group"), value: "group" },
    ],
    [t],
  );
  const fileNameRuleModeOptions = useMemo(
    () => [
      { label: t("da_match_mode_field"), value: "field" },
      { label: t("da_match_mode_phrase"), value: "phrase" },
    ],
    [t],
  );

  const {
    applyConfigurationWithExternalConfig,
    applyNewFilesConfigurationWithExternalConfig,
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
    selectAutoTemplate,
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
  const resolvedFileNameFieldSeparators = useMemo(
    () =>
      normalizeFileNameFieldSeparators(
        deviceAnalysisSettings?.fileNameFieldSeparators,
      ),
    [deviceAnalysisSettings?.fileNameFieldSeparators],
  );
  const fileNameFieldSuggestions = useMemo(
    () =>
      deriveFileNameFieldSuggestions(
        (Array.isArray(rawData) ? rawData : []).map((entry) => entry?.fileName),
        {
          caseSensitive: Boolean(config?.fileNameMatchCaseSensitive),
          separators: resolvedFileNameFieldSeparators,
        },
      ),
    [
      config?.fileNameMatchCaseSensitive,
      rawData,
      resolvedFileNameFieldSeparators,
    ],
  );
  const lowConfidenceReviewFiles = useMemo(() => {
    const processedById = new Map(
      (Array.isArray(processedData) ? processedData : [])
        .filter((entry) => typeof entry?.fileId === "string" && entry.fileId)
        .map((entry) => [String(entry.fileId), entry]),
    );

    const reviewFiles: RawDataEntry[] = [];

    for (const entry of Array.isArray(processedData) ? processedData : []) {
      if (!entry?.fileId) continue;
      if (
        entry.curveTypeNeedsTemplate === true ||
        entry.curveTypeConfidence === "low"
      ) {
        reviewFiles.push(entry);
      }
    }

    for (const entry of Array.isArray(rawData) ? rawData : []) {
      const fileId = String(entry?.fileId ?? "").trim();
      if (!fileId || processedById.has(fileId)) continue;
      if (
        entry.curveTypeNeedsTemplate === true ||
        entry.curveTypeConfidence === "low"
      ) {
        reviewFiles.push(entry);
      }
    }

    return reviewFiles;
  }, [processedData, rawData]);
  const activeLowConfidenceFile = useMemo(() => {
    if (!lowConfidenceReviewFiles.length) return null;
    return (
      lowConfidenceReviewFiles.find(
        (entry) => entry?.fileId === selectedPreviewFileId,
      ) || lowConfidenceReviewFiles[0]
    );
  }, [lowConfidenceReviewFiles, selectedPreviewFileId]);
  const activeLowConfidenceReasons = useMemo(
    () =>
      Array.isArray(activeLowConfidenceFile?.curveTypeReasons)
        ? activeLowConfidenceFile.curveTypeReasons
            .map((entry) => String(entry ?? "").trim())
            .filter(Boolean)
            .slice(0, 3)
        : [],
    [activeLowConfidenceFile],
  );
  const translateLowConfidenceReason = useCallback(
    (reason: string) => {
      const normalized = String(reason ?? "").trim();
      if (!normalized) return normalized;

      switch (normalized) {
        case "Shape only exposes generic CH1/CH2 sweep columns, so the gate/drain meaning is not reliable without a template.":
          return t("da_low_confidence_reason_shape_generic_channels");
        case "No reliable transfer/output metadata was found.":
          return t("da_low_confidence_reason_no_reliable_metadata");
        case "Metadata signals disagree on whether VAR1/X belongs to Vg or Vd.":
          return t("da_low_confidence_reason_metadata_conflict");
        default:
          return normalized;
      }
    },
    [t],
  );
  const translateLowConfidenceCurveType = useCallback(
    (value: unknown) => {
      const normalized = String(value ?? "").trim().toLowerCase();
      if (normalized.startsWith("transfer")) {
        return t("da_low_confidence_type_transfer");
      }
      if (normalized.startsWith("output")) {
        return t("da_low_confidence_type_output");
      }
      switch (normalized) {
        case "transfer":
          return t("da_low_confidence_type_transfer");
        case "output":
          return t("da_low_confidence_type_output");
        case "unknown":
        default:
          return t("da_low_confidence_type_unknown");
      }
    },
    [t],
  );
  const translateLowConfidenceConfidence = useCallback(
    (value: unknown) => {
      const normalized = String(value ?? "").trim().toLowerCase();
      switch (normalized) {
        case "high":
          return t("da_low_confidence_confidence_high");
        case "medium":
          return t("da_low_confidence_confidence_medium");
        case "low":
        default:
          return t("da_low_confidence_confidence_low");
      }
    },
    [t],
  );
  const isAutoTemplateSelected =
    selectedTemplateId === DEVICE_ANALYSIS_AUTO_TEMPLATE_ID;
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
      return normalizeTemplateConfigRecord({
        ...template,
        xSegmentationMode: resolveXSegmentationMode(template?.xSegmentationMode),
        xDataEnd: normalizeXDataEndValue(template?.xDataEnd),
      });
    },
    [],
  );
  const focusLowConfidenceFile = useCallback(
    (fileId: unknown) => {
      const nextFileId = String(fileId ?? "").trim();
      if (!nextFileId) return;
      setSelectedPreviewFileId(nextFileId);
    },
    [setSelectedPreviewFileId],
  );
  const handleReviewLowConfidenceFile = useCallback(() => {
    const targetFileId = String(activeLowConfidenceFile?.fileId ?? "").trim();
    if (targetFileId) {
      focusLowConfidenceFile(targetFileId);
    }
    handleTemplateModeChange("save");
  }, [
    activeLowConfidenceFile?.fileId,
    focusLowConfidenceFile,
    handleTemplateModeChange,
  ]);
  const handleFocusNextLowConfidenceFile = useCallback(() => {
    if (!lowConfidenceReviewFiles.length) return;
    const currentIndex = lowConfidenceReviewFiles.findIndex(
      (entry) => entry?.fileId === activeLowConfidenceFile?.fileId,
    );
    const nextIndex =
      currentIndex >= 0
        ? (currentIndex + 1) % lowConfidenceReviewFiles.length
        : 0;
    const nextFile = lowConfidenceReviewFiles[nextIndex];
    if (!nextFile?.fileId) return;
    focusLowConfidenceFile(nextFile.fileId);
  }, [
    activeLowConfidenceFile?.fileId,
    focusLowConfidenceFile,
    lowConfidenceReviewFiles,
  ]);

  const varPairValidation = validateVarPair(
    config?.bottomTitle,
    config?.legendPrefix,
    tLoose,
  );
  const [fileNameTemplateRules, setFileNameTemplateRules] = useState<
    FileNameTemplateRuleDraft[]
  >([]);
  const [
    fileNameTemplateRuleIdSeed,
    setFileNameTemplateRuleIdSeed,
  ] = useState(1);
  const addFileNameTemplateRule = useCallback(() => {
    setFileNameTemplateRules((prev) => [
      ...prev,
      {
        id: `${FILE_NAME_TEMPLATE_RULE_PREFIX}-${fileNameTemplateRuleIdSeed}`,
        matchMode: "field",
        pattern: "",
        templateName: "",
      },
    ]);
    setFileNameTemplateRuleIdSeed((prev) => prev + 1);
  }, [fileNameTemplateRuleIdSeed]);
  const removeFileNameTemplateRule = useCallback((id: string) => {
    setFileNameTemplateRules((prev) => prev.filter((rule) => rule.id !== id));
  }, []);
  const updateFileNameTemplateRule = useCallback(
    (id: string, updates: Partial<FileNameTemplateRuleDraft>) => {
      setFileNameTemplateRules((prev) =>
        prev.map((rule) => {
          const nextMatchMode =
            updates.matchMode === "phrase" || updates.matchMode === "field"
              ? updates.matchMode
              : rule.matchMode;

          return rule.id === id
            ? {
                ...rule,
                ...(nextMatchMode !== rule.matchMode
                  ? {
                      matchMode: nextMatchMode,
                      pattern:
                        nextMatchMode === "field"
                          ? sanitizeFileNamePrefixInput(rule.pattern)
                          : String(rule.pattern ?? "").trim(),
                    }
                  : {}),
                ...(typeof updates.pattern === "string"
                  ? {
                      pattern:
                        nextMatchMode === "field"
                          ? sanitizeFileNamePrefixInput(updates.pattern)
                          : String(updates.pattern).trim(),
                    }
                  : {}),
                ...(typeof updates.templateName === "string"
                  ? { templateName: String(updates.templateName) }
                  : {}),
              }
            : rule;
        }),
      );
    },
    [sanitizeFileNamePrefixInput],
  );
  const getRulePatternTokens = useCallback(
    (pattern: string) => splitFileNameMatchInput(pattern, true),
    [],
  );
  const addPatternTokenToRule = useCallback(
    (id: string, token: string) => {
      const normalizedToken = String(token ?? "").trim();
      if (!normalizedToken) return;

      setFileNameTemplateRules((prev) =>
        prev.map((rule) => {
          if (rule.id !== id) return rule;

          const existingTokens = getRulePatternTokens(rule.pattern);
          const comparisonToken = Boolean(config?.fileNameMatchCaseSensitive)
            ? normalizedToken
            : normalizedToken.toLowerCase();
          const hasToken = existingTokens.some((entry) =>
            (Boolean(config?.fileNameMatchCaseSensitive)
              ? entry
              : entry.toLowerCase()) === comparisonToken,
          );
          if (hasToken) return rule;

          return {
            ...rule,
            pattern: joinFileNameMatchInput([...existingTokens, normalizedToken]),
          };
        }),
      );
    },
    [config?.fileNameMatchCaseSensitive, getRulePatternTokens],
  );
  const removePatternTokenFromRule = useCallback(
    (id: string, token: string) => {
      const normalizedToken = String(token ?? "").trim();
      if (!normalizedToken) return;

      setFileNameTemplateRules((prev) =>
        prev.map((rule) => {
          if (rule.id !== id) return rule;

          const nextTokens = getRulePatternTokens(rule.pattern).filter((entry) => {
            const left = Boolean(config?.fileNameMatchCaseSensitive)
              ? entry
              : entry.toLowerCase();
            const right = Boolean(config?.fileNameMatchCaseSensitive)
              ? normalizedToken
              : normalizedToken.toLowerCase();
            return left !== right;
          });

          return {
            ...rule,
            pattern: joinFileNameMatchInput(nextTokens),
          };
        }),
      );
    },
    [config?.fileNameMatchCaseSensitive, getRulePatternTokens],
  );
  const normalizedRuleRuntimeConfigs = useMemo(
    () =>
      fileNameTemplateRules
        .map((rule) => {
          const pattern = sanitizeFileNamePrefixInput(rule.pattern);
          const phrasePattern = String(rule.pattern ?? "").trim();
          const templateName = String(rule.templateName ?? "").trim();
          if (!templateName) return null;
          if (rule.matchMode === "field" && !pattern) return null;
          if (rule.matchMode === "phrase" && !phrasePattern) return null;
          const templateRecord = resolveTemplateByName(templateName);
          if (!templateRecord) return null;
          return {
            id: rule.id,
            matchMode: rule.matchMode,
            pattern: rule.matchMode === "phrase" ? phrasePattern : pattern,
            templateName,
            templateConfig: cloneTemplateConfigFromRecord(
              templateRecord as Record<string, unknown>,
            ),
          } as FileNameTemplateRuleRuntimeConfig;
        })
        .filter(Boolean) as FileNameTemplateRuleRuntimeConfig[],
    [
      cloneTemplateConfigFromRecord,
      fileNameTemplateRules,
      resolveTemplateByName,
      sanitizeFileNamePrefixInput,
    ],
  );
  const getRuleMatchCount = useCallback(
    (rule: FileNameTemplateRuleDraft) => {
      if (rule.matchMode === "phrase") {
        const phrase = String(rule.pattern ?? "").trim();
        if (!phrase) return 0;

        return (Array.isArray(rawData) ? rawData : []).reduce((count, entry) => {
          return count +
            (matchFileNameAgainstPhrase(entry?.fileName, phrase, {
              caseSensitive: Boolean(config?.fileNameMatchCaseSensitive),
            })
              ? 1
              : 0);
        }, 0);
      }

      const patternTokens = splitFileNameMatchInput(
        rule.pattern,
        Boolean(config?.fileNameMatchCaseSensitive),
      );
      if (!patternTokens.length) return 0;

      return (Array.isArray(rawData) ? rawData : []).reduce((count, entry) => {
        return count +
          (matchFileNameAgainstPatternTokens(entry?.fileName, patternTokens, {
            caseSensitive: Boolean(config?.fileNameMatchCaseSensitive),
            separators: resolvedFileNameFieldSeparators,
          })
            ? 1
            : 0);
      }, 0);
    },
    [
      config?.fileNameMatchCaseSensitive,
      rawData,
      resolvedFileNameFieldSeparators,
    ],
  );
  const buildRuleSuggestionOptions = useCallback(
    (rule: FileNameTemplateRuleDraft) => {
      if (rule.matchMode !== "field") return [];

      const caseSensitive = Boolean(config?.fileNameMatchCaseSensitive);
      const minimumPinnedSuggestionCount = 5;
      const defaultSuggestionLimit = 10;
      const normalizedPatternTokens = new Set(
        splitFileNameMatchInput(rule.pattern, caseSensitive),
      );

      const rankedSuggestions = fileNameFieldSuggestions.reduce<
        Array<{
          count: number;
          label: React.ReactElement;
          score: number;
          value: string;
        }>
      >((entries, suggestion) => {
          const comparisonValue = caseSensitive
            ? suggestion.value
            : suggestion.normalizedValue;
          if (normalizedPatternTokens.has(comparisonValue)) return entries;

          entries.push({
            count: suggestion.count,
            label: (
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-text-primary">
                  {suggestion.value}
                </span>
                <span className="truncate text-xs text-text-secondary">
                  {t("da_match_field_suggestion_matches", {
                    count: suggestion.count,
                  })}
                </span>
              </div>
            ),
            score: suggestion.score,
            value: suggestion.value,
          });
          return entries;
        }, []);

      return rankedSuggestions
        .sort((left, right) => right.score - left.score)
        .filter(
          (entry, index) =>
            index < defaultSuggestionLimit ||
            entry.count >= minimumPinnedSuggestionCount,
        )
        .map((entry) => ({
          label: entry.label,
          value: entry.value,
        }));
    },
    [
      config?.fileNameMatchCaseSensitive,
      fileNameFieldSuggestions,
      t,
    ],
  );
  const applyFileNameTemplateRules = useCallback(
    (incremental: boolean) => {
      const applyHandler = incremental
        ? applyNewFilesConfigurationWithExternalConfig
        : applyConfigurationWithExternalConfig;
      if (!normalizedRuleRuntimeConfigs.length) {
        applyHandler(config as unknown as Record<string, unknown>);
        return;
      }
      const rulePayload = normalizedRuleRuntimeConfigs.map((rule) => ({
        matchMode: rule.matchMode,
        pattern: rule.pattern,
        templateName: rule.templateName,
        caseSensitive: Boolean(config?.fileNameMatchCaseSensitive),
        templateConfig: {
          ...rule.templateConfig,
          fileNameVgKeywords: "",
          fileNameVdKeywords: "",
        },
      })) as FileNameTemplateRulePayload[];
      const ruleConfig: Record<string, unknown> = {
        fileNameFieldSeparators: resolvedFileNameFieldSeparators,
        fileNameTemplateRules: rulePayload,
        fallbackTemplateConfig: { ...config },
        stopOnError: Boolean(config?.stopOnError),
      };
      applyHandler(ruleConfig);
    },
    [
      applyConfigurationWithExternalConfig,
      applyNewFilesConfigurationWithExternalConfig,
      config,
      resolvedFileNameFieldSeparators,
      normalizedRuleRuntimeConfigs,
    ],
  );
  useEffect(() => {
    if (templateMode === "select") {
      void ensureTemplatesLoaded().catch(() => {});
    }
  }, [ensureTemplatesLoaded, templateMode]);
  useEffect(() => {
    if (!availableTemplateNames.length) {
      setFileNameTemplateRules((prev) =>
        prev.map((rule) => ({ ...rule, templateName: "" })),
      );
      return;
    }
    setFileNameTemplateRules((prev) =>
      prev.map((rule) => {
        const templateName = String(rule.templateName ?? "").trim();
        if (!templateName) return rule;
        if (availableTemplateNames.includes(templateName)) return rule;
        return { ...rule, templateName: "" };
      }),
    );
  }, [availableTemplateNames]);
  useEffect(() => {
    if (templateMode !== "save") {
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
    if (!isAutoTemplateSelected) return;
    if (typeof ensurePreviewRows !== "function") return;

    const fileId = String(previewFile?.fileId ?? "").trim();
    if (!fileId) return;

    const targetRows = Math.min(
      Math.max(0, Number(previewFile?.rowCount) || 0),
      AUTO_EXTRACTION_PREVIEW_MAX_ROWS,
    );
    if (targetRows <= 0) return;

    void ensurePreviewRows(fileId, 0, targetRows);
  }, [
    ensurePreviewRows,
    isAutoTemplateSelected,
    previewFile?.fileId,
    previewFile?.rowCount,
  ]);

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

  const autoPreviewRows = useMemo(() => {
    if (!isAutoTemplateSelected) return [];
    if (typeof getPreviewRow !== "function") return [];

    const targetRows = Math.min(
      Math.max(0, Number(previewFile?.rowCount) || 0),
      AUTO_EXTRACTION_PREVIEW_MAX_ROWS,
    );
    if (targetRows <= 0) return [];

    const rows: Array<Array<unknown> | null | undefined> = [];
    for (let rowIndex = 0; rowIndex < targetRows; rowIndex += 1) {
      const row = getPreviewRow(rowIndex);
      if (!Array.isArray(row)) break;
      rows.push(row);
    }
    return rows;
  }, [
    getPreviewRow,
    isAutoTemplateSelected,
    previewFile?.rowCount,
    previewRowsVersionSnapshot,
  ]);

  const autoExtractionPreviewResult = useMemo<DeviceAnalysisAutoExtractionResult | null>(
    () => {
      if (!isAutoTemplateSelected) return null;
      if (!autoPreviewRows.length) return null;

      return inferDeviceAnalysisAutoExtraction({
        fileName: previewFile?.fileName || previewFile?.fileId || "preview",
        rows: autoPreviewRows,
        totalRowCount: previewFile?.rowCount,
      });
    },
    [
      autoPreviewRows,
      isAutoTemplateSelected,
      previewFile?.fileId,
      previewFile?.fileName,
      previewFile?.rowCount,
    ],
  );

  const autoTemplateConfig = useMemo(() => {
    if (!isAutoTemplateSelected) return null;

    const baseConfig = createEmptyTemplateConfig({
      fileNameMatchCaseSensitive: Boolean(config?.fileNameMatchCaseSensitive),
      stopOnError: Boolean(config?.stopOnError),
    });

    if (!autoExtractionPreviewResult?.ok) {
      return baseConfig;
    }

    return normalizeTemplateConfigRecord({
      ...baseConfig,
      ...buildDeviceAnalysisAutoTemplateConfig(autoExtractionPreviewResult.plan),
    });
  }, [
    autoExtractionPreviewResult,
    config?.fileNameMatchCaseSensitive,
    config?.stopOnError,
    isAutoTemplateSelected,
  ]);

  useEffect(() => {
    if (!isAutoTemplateSelected || !autoTemplateConfig) return;

    setConfig((prev) => {
      const next = {
        ...prev,
        ...autoTemplateConfig,
        name: "",
      };
      return stableStringify(next) === stableStringify(prev) ? prev : next;
    });
  }, [autoTemplateConfig, isAutoTemplateSelected, setConfig]);

  const autoPreviewHeaders = useMemo(() => {
    if (!autoExtractionPreviewResult?.ok) return [];
    const headerRowIndex = Math.max(
      0,
      autoExtractionPreviewResult.plan.dataStartRowIndex - 1,
    );
    const headerRow = autoPreviewRows[headerRowIndex];
    return Array.isArray(headerRow)
      ? headerRow.map((value) => String(value ?? "").trim())
      : [];
  }, [autoExtractionPreviewResult, autoPreviewRows]);

  const autoGroupingSummary = useMemo(() => {
    if (!autoExtractionPreviewResult?.ok) {
      return t("da_auto_template_summary_none");
    }

    const explicitPoints = Number(autoExtractionPreviewResult.plan.xPointsPerGroup);
    const points =
      Number.isInteger(explicitPoints) && explicitPoints > 0
        ? explicitPoints
        : Number.isInteger(Number(previewFile?.rowCount)) &&
            Number(previewFile?.rowCount) > autoExtractionPreviewResult.plan.dataStartRowIndex
          ? Number(previewFile?.rowCount) - autoExtractionPreviewResult.plan.dataStartRowIndex
          : null;
    const explicitGroups = Number(autoExtractionPreviewResult.plan.groups);
    const groups =
      Number.isInteger(explicitGroups) && explicitGroups > 0
        ? explicitGroups
        : points !== null
          ? 1
          : null;

    if (points === null) {
      return t("da_auto_template_summary_none");
    }

    return groups !== null
      ? t("da_auto_template_summary_points_groups", {
          groups,
          points,
        })
      : t("da_auto_template_summary_points_only", {
          points,
        });
  }, [autoExtractionPreviewResult, previewFile?.rowCount, t]);

  const resolveAutoColumnLabel = useCallback(
    (colIndex: number | null) => {
      if (!Number.isInteger(colIndex) || Number(colIndex) < 0) {
        return t("da_auto_template_summary_none");
      }

      const header = String(autoPreviewHeaders[Number(colIndex)] ?? "").trim();
      return header || getExcelColumnLabel(Number(colIndex));
    },
    [autoPreviewHeaders, t],
  );

  const formatAutoSummaryNumber = useCallback((value: number | null | undefined) => {
    if (!Number.isFinite(value)) return "";
    return `${Number(Number(value).toPrecision(12))}`;
  }, []);

  const formatAutoLegendValue = useCallback(
    (value: unknown) => {
      const text = String(value ?? "").trim();
      if (!text) return "";
      const numeric = Number(text);
      return Number.isFinite(numeric) ? formatAutoSummaryNumber(numeric) : text;
    },
    [formatAutoSummaryNumber],
  );

  const resolveAutoLegendSummary = useCallback(
    (result: DeviceAnalysisAutoExtractionResult | null) => {
      if (!result?.ok) {
        return t("da_auto_template_summary_none");
      }

      const { plan } = result;
      const prefix =
        String(plan.legendPrefix ?? "").trim() ||
        t("da_auto_template_summary_legend");
      if (Number(plan.legendCount) === 1) {
        if (
          Number.isInteger(plan.legendStartRowIndex) &&
          Number(plan.legendStartRowIndex) >= 0 &&
          Number.isInteger(plan.legendStartColIndex) &&
          Number(plan.legendStartColIndex) >= 0
        ) {
          const rawValue =
            autoPreviewRows[Number(plan.legendStartRowIndex)]?.[
              Number(plan.legendStartColIndex)
            ];
          const value = formatAutoLegendValue(rawValue);
          if (value) {
            return t("da_auto_template_summary_legend_fixed", {
              prefix,
              value,
            });
          }
        }

        const value = formatAutoLegendValue(plan.legendStartValue);
        if (value) {
          return t("da_auto_template_summary_legend_fixed", {
            prefix,
            value,
          });
        }
      }

      if (
        Number.isInteger(plan.legendStartColIndex) &&
        Number(plan.legendStartColIndex) >= 0
      ) {
        return resolveAutoColumnLabel(plan.legendStartColIndex);
      }

      const start = String(plan.legendStartValue ?? "").trim();
      const count = Number(plan.legendCount);
      const step = Number(plan.legendStep);
      if (start && Number.isInteger(count) && count > 0) {
        if (Number.isFinite(step) && step > 0) {
          return t("da_auto_template_summary_legend_generated", {
            count,
            prefix,
            start,
            step: formatAutoSummaryNumber(step),
          });
        }

        return t("da_auto_template_summary_legend_generated_no_step", {
          count,
          prefix,
          start,
        });
      }

      return t("da_auto_template_summary_none");
    },
    [autoPreviewRows, formatAutoLegendValue, formatAutoSummaryNumber, resolveAutoColumnLabel, t],
  );

  const autoApplyConfig = useMemo(
    () => ({
      autoExtractionMode: true,
      stopOnError: Boolean(config?.stopOnError),
    }),
    [config?.stopOnError],
  );

  const applyAutoTemplate = useCallback(
    (incremental: boolean) => {
      const applyHandler = incremental
        ? applyNewFilesConfigurationWithExternalConfig
        : applyConfigurationWithExternalConfig;
      applyHandler(autoApplyConfig);
    },
    [
      applyConfigurationWithExternalConfig,
      applyNewFilesConfigurationWithExternalConfig,
      autoApplyConfig,
    ],
  );

  const handleSelectAutoTemplate = useCallback(() => {
    selectAutoTemplate();
    setSelectedTemplateId(DEVICE_ANALYSIS_AUTO_TEMPLATE_ID);
  }, [selectAutoTemplate, setSelectedTemplateId]);

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
    const xSegmentationInputValue = isXAutoMode
      ? ""
      : isXSegmentsMode
        ? String(config.xSegmentCount ?? "")
        : String(config.xPointsPerGroup ?? "");
    const xSegmentationInputPlaceholder = isXAutoMode
      ? t("da_save_segmentation_mode_auto")
      : isXSegmentsMode
        ? t("da_save_segments")
        : t("da_save_points");
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
                name={isXSegmentsMode ? "xSegmentCount" : "xPointsPerGroup"}
                value={xSegmentationInputValue}
                disabled={saveIsSelectMode || isXAutoMode}
                onChange={(next) => {
                  if (isXAutoMode) return;
                  if (isXSegmentsMode) {
                    setConfigFromSave((prev) => ({ ...prev, xSegmentCount: next }));
                    markFieldSource("xSegmentCount", "manual");
                    return;
                  }
                  setConfigFromSave((prev) => ({ ...prev, xPointsPerGroup: next }));
                  markFieldSource("xPointsPerGroup", "manual");
                }}
                placeholder={xSegmentationInputPlaceholder}
                inputClassName="no-spinner"
              />
            </div>
            <div className="relative min-w-0">
              <DropdownField
                id={
                  includeIds
                    ? "device-analysis-template-x-segmentation-mode"
                    : undefined
                }
                menuId={
                  includeIds
                    ? "device-analysis-template-x-segmentation-mode-menu"
                    : undefined
                }
                size="md"
                className="w-full"
                value={xSegmentationMode}
                options={xSegmentationModeOptions}
                onChange={(value) => {
                  const nextMode = resolveXSegmentationMode(value);
                  setConfigFromSave((prev) => ({
                    ...prev,
                    xSegmentationMode: nextMode,
                  }));
                  markFieldSource("xSegmentationMode", "manual");
                }}
                placeholder={t("da_save_segmentation_mode")}
                disabled={saveIsSelectMode}
                stableWidth={false}
              />
            </div>
            <div className="sm:col-span-2 relative min-w-0">
              <DropdownField
                id={includeIds ? "device-analysis-template-x-unit" : undefined}
                menuId={
                  includeIds ? "device-analysis-template-x-unit-menu" : undefined
                }
                size="md"
                className="w-full"
                value={String(config.xUnit || "V")}
                options={xUnitOptions}
                onChange={(value) => {
                  setConfigFromSave((prev) => ({
                    ...prev,
                    xUnit: String(value || "V"),
                  }));
                  markFieldSource("xUnit", "manual");
                }}
                placeholder={t("da_save_x_unit")}
                disabled={saveIsSelectMode}
                stableWidth={false}
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
            <div className="grid grid-cols-1 gap-4">
              <div className="min-w-0">
                <Input
                  id={
                    includeIds
                      ? "device-analysis-template-y-columns"
                      : undefined
                  }
                  value={
                    config.yColumns.length > 0
                      ? config.yColumns
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
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t("da_save_curve_legend_label")}
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="min-w-0">
                <Input
                  id={
                    includeIds
                      ? "device-analysis-template-legend-start"
                      : undefined
                  }
                  value={config.yLegendStart}
                  name="yLegendStart"
                  disabled={saveIsSelectMode}
                  onChange={(next) => {
                    setConfigFromSave((prev) => ({
                      ...prev,
                      yLegendStart: next,
                    }));
                    markFieldSource("yLegendStart", "manual");
                  }}
                  placeholder={t("da_save_start")}
                />
              </div>
              <div className="min-w-0">
                <Input
                  id={
                    includeIds ? "device-analysis-template-legend-count" : undefined
                  }
                  value={config.yLegendCount}
                  name="yLegendCount"
                  disabled={saveIsSelectMode}
                  onChange={(next) => {
                    setConfigFromSave((prev) => ({ ...prev, yLegendCount: next }));
                    markFieldSource("yLegendCount", "manual");
                  }}
                  placeholder={t("da_save_count")}
                  inputClassName="no-spinner"
                />
              </div>
              <div className="min-w-0">
                <Input
                  id={
                    includeIds ? "device-analysis-template-legend-step" : undefined
                  }
                  value={config.yLegendStep}
                  name="yLegendStep"
                  disabled={saveIsSelectMode}
                  onChange={(next) => {
                    setConfigFromSave((prev) => ({ ...prev, yLegendStep: next }));
                    markFieldSource("yLegendStep", "manual");
                  }}
                  placeholder={t("da_save_step")}
                  inputClassName="no-spinner"
                />
              </div>
              <div className="min-w-0 relative">
                <DropdownField
                  id={
                    includeIds
                      ? "device-analysis-template-legend-mapping"
                      : undefined
                  }
                  menuId={
                    includeIds
                      ? "device-analysis-template-legend-mapping-menu"
                      : undefined
                  }
                  size="md"
                  className="w-full"
                  value={config.yLegendTarget}
                  options={legendMappingOptions}
                  onChange={(value) => {
                    const next =
                      value === "yColumn" || value === "group" || value === "auto"
                        ? value
                        : "auto";
                    setConfigFromSave((prev) => ({
                      ...prev,
                      yLegendTarget: next,
                    }));
                    markFieldSource("yLegendTarget", "manual");
                  }}
                  placeholder={t("da_save_legend_mapping")}
                  disabled={saveIsSelectMode}
                  stableWidth={false}
                />
              </div>
              <div className="min-w-0">
                <Input
                  id={
                    includeIds
                      ? "device-analysis-template-legend-prefix"
                      : undefined
                  }
                  value={config.legendPrefix || ""}
                  name="legendPrefix"
                  disabled={saveIsSelectMode}
                  onChange={(next) => {
                    setConfigFromSave((prev) => ({ ...prev, legendPrefix: next }));
                    markFieldSource("legendPrefix", "manual");
                  }}
                  onBlur={toastVarPairIfInvalid}
                  placeholder={t("da_save_legend")}
                />
              </div>
              <div className="min-w-0 relative">
                <DropdownField
                  id={includeIds ? "device-analysis-template-y-unit" : undefined}
                  menuId={
                    includeIds ? "device-analysis-template-y-unit-menu" : undefined
                  }
                  size="md"
                  className="w-full"
                  value={String(config.yUnit || "A")}
                  options={yUnitOptions}
                  onChange={(value) => {
                    setConfigFromSave((prev) => ({
                      ...prev,
                      yUnit: String(value || "A"),
                    }));
                    markFieldSource("yUnit", "manual");
                  }}
                  placeholder={t("da_save_y_unit")}
                  disabled={saveIsSelectMode}
                  stableWidth={false}
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
            onChange={(next) => {
              setConfigFromSave((prev) => ({ ...prev, bottomTitle: next }));
              markFieldSource("bottomTitle", "manual");
            }}
            onBlur={toastVarPairIfInvalid}
            placeholder={t("da_save_var1")}
          />
        </div>

        {/* 5. Var3 */}
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
    const displayName = isAutoTemplateSelected
      ? t("da_auto_template")
      : String(config.name ?? "").trim();
    const hasDisplayName = Boolean(displayName);
    const lowConfidenceReviewCard = activeLowConfidenceFile ? (
      <div
        role="status"
        aria-live="polite"
        className="rounded-xl border border-border-200 px-3 py-3 text-sm"
      >
        <div className="flex items-start gap-2">
          <AlertTriangle
            size={16}
            className="mt-0.5 shrink-0 text-amber-500"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-text-tertiary">
              {lowConfidenceReviewFiles.length > 1
                ? t("da_low_confidence_review_title_count", {
                    count: lowConfidenceReviewFiles.length,
                  })
                : t("da_low_confidence_review_title")}
            </div>
            <div className="mt-1 text-sm text-text-primary break-words">
              {String(activeLowConfidenceFile.fileName ?? "").trim() ||
                t("da_low_confidence_unnamed_file")}
            </div>
            <div className="mt-1 text-sm text-text-primary">
              {t("da_low_confidence_auto_result", {
                type: translateLowConfidenceCurveType(
                  activeLowConfidenceFile.curveType,
                ),
                confidence: translateLowConfidenceConfidence(
                  activeLowConfidenceFile.curveTypeConfidence,
                ),
              })}
            </div>
            {activeLowConfidenceReasons.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-text-primary">
                {activeLowConfidenceReasons.map((reason, index) => (
                  <li
                    key={`${String(activeLowConfidenceFile.fileId ?? "file")}-${index}`}
                  >
                    {translateLowConfidenceReason(reason)}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleReviewLowConfidenceFile}
                cta="Device Analysis"
                ctaPosition="template-low-confidence"
                ctaCopy="review file"
              >
                {t("da_low_confidence_review_in_save_mode")}
              </Button>
              {lowConfidenceReviewFiles.length > 1 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleFocusNextLowConfidenceFile}
                  cta="Device Analysis"
                  ctaPosition="template-low-confidence"
                  ctaCopy="next flagged file"
                >
                  {t("da_low_confidence_next_flagged")}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    ) : null;
    const autoSummaryCard = isAutoTemplateSelected ? (
      <div className="rounded-xl border border-border-primary/40 px-3 py-3 space-y-3">
        <div className="space-y-1">
          <div className="text-xs font-medium text-text-tertiary">
            {t("da_auto_template_summary_title")}
          </div>
        </div>
        {!previewFile?.fileId ? (
          <p className="text-sm text-text-secondary">
            {t("da_preview_select_file_hint")}
          </p>
        ) : !autoExtractionPreviewResult ? (
          <p className="text-sm text-text-secondary">
            {t("da_auto_template_summary_pending")}
          </p>
        ) : autoExtractionPreviewResult.ok ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 text-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="text-text-secondary">
                  {t("da_auto_template_summary_curve")}
                </span>
                <span className="text-right text-text-primary">
                  {`${String(
                    autoExtractionPreviewResult.plan.curveTypeLabel ??
                      autoExtractionPreviewResult.plan.curveType ??
                      "",
                  ).trim()} (${translateLowConfidenceConfidence(
                    autoExtractionPreviewResult.plan.confidence,
                  )})`}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-text-secondary">
                  {t("da_auto_template_summary_x")}
                </span>
                <span className="text-right text-text-primary">
                  {resolveAutoColumnLabel(autoExtractionPreviewResult.plan.xCol)}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-text-secondary">
                  {t("da_auto_template_summary_y")}
                </span>
                <span className="text-right text-text-primary">
                  {autoExtractionPreviewResult.plan.yCols.length
                    ? autoExtractionPreviewResult.plan.yCols
                        .map((colIndex) => resolveAutoColumnLabel(colIndex))
                        .join(", ")
                    : t("da_auto_template_summary_none")}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-text-secondary">
                  {t("da_auto_template_summary_grouping")}
                </span>
                <span className="text-right text-text-primary">{autoGroupingSummary}</span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-text-secondary">
                  {t("da_auto_template_summary_legend")}
                </span>
                <span className="text-right text-text-primary">
                  {resolveAutoLegendSummary(autoExtractionPreviewResult)}
                </span>
              </div>
            </div>
            {autoExtractionPreviewResult.plan.reasons.length ? (
              <ul className="list-disc space-y-1 pl-4 text-sm text-text-primary">
                {autoExtractionPreviewResult.plan.reasons.slice(0, 3).map((reason, index) => (
                  <li key={`auto-reason-${index}`}>
                    {translateLowConfidenceReason(reason)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-text-primary">
              {t("da_auto_template_summary_failed")}
            </p>
            <p className="text-sm text-text-secondary break-words">
              {autoExtractionPreviewResult.message}
            </p>
            {autoExtractionPreviewResult.reasons.length ? (
              <ul className="list-disc space-y-1 pl-4 text-sm text-text-primary">
                {autoExtractionPreviewResult.reasons.slice(0, 3).map((reason, index) => (
                  <li key={`auto-reason-${index}`}>
                    {translateLowConfidenceReason(reason)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </div>
    ) : null;

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
            <DropdownTrigger
              id={resolvedInputId}
              isOpen={includeIds ? isDropdownOpen : false}
              menuId={
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
              onClick={measureOnly ? undefined : toggleTemplateDropdown}
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
              fieldClassName="input_field input_field--xl relative flex-1 min-w-0 pr-1"
              indicatorClassName="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-secondary pointer-events-none"
              {...(includeIds
                ? {
                    "data-cta": "Device Analysis",
                    "data-cta-position": "template-dropdown",
                    "data-cta-copy": "template name",
                  }
                : {})}
            >
              <span
                className={`block truncate ${
                  hasDisplayName ? "text-text-primary" : "text-text-tertiary"
                }`}
              >
                {hasDisplayName ? displayName : t("da_template_name")}
              </span>
            </DropdownTrigger>

            {shouldRenderDropdownMenu && (
              <Dropdown
                isOpen={templateMode === "select" && isDropdownOpen}
                onOpenChange={(nextOpen) => {
                  if (!nextOpen) closeTemplateDropdown();
                }}
                anchorRef={dropdownRef}
              >
                {({ anchorRef: resolvedAnchorRef, setContentRef }) => (
                  <ContentView
                    isOpen={templateMode === "select" && isDropdownOpen}
                    anchorRef={resolvedAnchorRef}
                    contentRef={setContentRef}
                    menuId="device-analysis-template-dropdown-menu"
                    triggerId={resolvedInputId}
                    zIndex={50}
                    matchAnchorWidth
                  >
                    {() => (
                      <Menu role="menu">
                        <MenuItem
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors mb-1 ${
                            isAutoTemplateSelected
                              ? "bg-bg-page text-accent"
                              : "hover:bg-bg-page text-text-primary"
                          }`}
                          onClick={handleSelectAutoTemplate}
                          left={
                            <span className="min-w-0 flex-1 text-left text-sm font-medium">
                              {t("da_auto_template")}
                            </span>
                          }
                          right={
                            <span className="p-1">
                              {isAutoTemplateSelected ? (
                                <Check size={14} />
                              ) : (
                                <span className="block h-3.5 w-3.5 rounded-full border border-border-primary/60" />
                              )}
                            </span>
                          }
                        />
                        <MenuItem
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-bg-page cursor-pointer group transition-colors mb-1 text-accent"
                          onClick={handleCreateNewTemplate}
                          left={
                            <span className="flex-1 text-sm font-medium">
                              {t("da_new_template")}
                            </span>
                          }
                          right={
                            <span className="p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Plus size={14} />
                            </span>
                          }
                        />
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
                              <MenuItem
                                onClick={() => loadTemplate(template)}
                                className="w-full flex items-center justify-between px-3 py-2 pr-9 rounded-lg transition-colors text-left hover:bg-bg-page group-hover:bg-bg-page"
                                left={
                                  <span className="flex-1 text-sm text-text-primary font-medium truncate">
                                    {template.name}
                                  </span>
                                }
                              />
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
                      </Menu>
                    )}
                  </ContentView>
                )}
              </Dropdown>
            )}
          </div>
        </div>

        <div className={transferButtonsContainerClassName}>
          <Button
            id={
              includeIds ? "device-analysis-template-export-config" : undefined
            }
            variant="secondary"
            size="md"
            className={transferButtonClassName}
            contentClassName="w-full min-w-0 justify-between"
            onClick={measureOnly ? undefined : handleExportTemplates}
            disabled={templateTransferBusy}
            title={t("da_template_export_btn")}
          >
            <span className="block min-w-0 flex-1 truncate text-left">
              {t("da_template_export_btn")}
            </span>
            <Upload size={14} className="shrink-0" />
          </Button>
          <Button
            id={
              includeIds ? "device-analysis-template-import-config" : undefined
            }
            variant="secondary"
            size="md"
            className={transferButtonClassName}
            contentClassName="w-full min-w-0 justify-between"
            onClick={measureOnly ? undefined : handleImportTemplatesClick}
            disabled={templateTransferBusy}
            title={t("da_template_import_btn")}
          >
            <span className="block min-w-0 flex-1 truncate text-left">
              {t("da_template_import_btn")}
            </span>
            <Download size={14} className="shrink-0" />
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

        {isAutoTemplateSelected ? (
          <div className="space-y-3">
            <div className={applyButtonsContainerClassName}>
              <Button
                id={
                  includeIds
                    ? "device-analysis-template-output-rule-apply-to-all"
                    : undefined
                }
                variant="primary"
                size="md"
                className="w-full min-w-0"
                contentClassName="w-full min-w-0 justify-center"
                onClick={measureOnly ? undefined : () => applyAutoTemplate(false)}
                disabled={measureOnly}
                title={t("da_apply_to_all_files")}
              >
                <span className="block min-w-0 truncate">
                  {t("da_apply_to_all_files")}
                </span>
              </Button>
              <Button
                id={
                  includeIds
                    ? "device-analysis-template-output-rule-apply-to-new"
                    : undefined
                }
                variant="secondary"
                size="md"
                className="w-full min-w-0"
                contentClassName="w-full min-w-0 justify-center"
                onClick={measureOnly ? undefined : () => applyAutoTemplate(true)}
                disabled={
                  measureOnly ||
                  typeof onTemplateAppliedIncremental !== "function"
                }
                title={t("da_apply_to_new_files")}
              >
                <span className="block min-w-0 truncate">
                  {t("da_apply_to_new_files")}
                </span>
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <label className="block text-sm font-medium text-text-secondary">
                {t("da_match_by_file_name")}
              </label>
              <Button
                id={includeIds ? "device-analysis-template-add-rule" : undefined}
                variant="secondary"
                size="md"
                className="min-w-0 max-w-full"
                contentClassName="w-full min-w-0 justify-between"
                onClick={measureOnly ? undefined : addFileNameTemplateRule}
                disabled={measureOnly || templatesLoading}
                title={t("da_add_rule")}
              >
                <span className="block min-w-0 flex-1 truncate text-left">
                  {t("da_add_rule")}
                </span>
                <Plus size={14} className="shrink-0" />
              </Button>
            </div>
            <div className="mt-3 space-y-3">
              {fileNameTemplateRules.map((rule, index) => {
                const suggestionOptions = buildRuleSuggestionOptions(rule);
                const matchedFilesCount = getRuleMatchCount(rule);
                const selectedPatternTokens = getRulePatternTokens(rule.pattern);
                const isPhraseMode = rule.matchMode === "phrase";
                const hasMatchCondition = isPhraseMode
                  ? Boolean(String(rule.pattern ?? "").trim())
                  : selectedPatternTokens.length > 0;

                return (
                  <div
                    key={rule.id}
                    className="group border border-border-primary/40 rounded-xl p-3 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-text-secondary">
                        {t("da_rule_item_index", { index: index + 1 })}
                      </span>
                      <Button
                        id={
                          includeIds
                            ? `device-analysis-template-remove-rule-${index + 1}`
                            : undefined
                        }
                        variant="icon"
                        size="icon"
                        aria-label={t("da_remove_rule")}
                        title={t("da_remove_rule")}
                        onClick={
                          measureOnly
                            ? undefined
                            : () => removeFileNameTemplateRule(rule.id)
                        }
                        disabled={measureOnly}
                        className="hover:text-red-500 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus:opacity-100 focus:pointer-events-auto"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                    <DropdownField
                      id={
                        includeIds
                          ? `device-analysis-template-rule-mode-${index + 1}`
                          : undefined
                      }
                      size="md"
                      value={rule.matchMode}
                      options={fileNameRuleModeOptions}
                      onChange={(value) => {
                        updateFileNameTemplateRule(rule.id, {
                          matchMode:
                            value === "phrase" ? "phrase" : "field",
                        });
                      }}
                      placeholder={t("da_match_mode_label")}
                      disabled={measureOnly}
                      stableWidth={false}
                      popupClassName="min-w-full !bg-bg-surface !backdrop-blur-none"
                    />
                    <div className="space-y-2">
                      {isPhraseMode ? (
                        <>
                          <Input
                            id={
                              includeIds
                                ? `device-analysis-template-rule-phrase-${index + 1}`
                                : undefined
                            }
                            value={rule.pattern}
                            name={`fileNameTemplateRulePhrase-${rule.id}`}
                            disabled={measureOnly}
                            onChange={(next) => {
                              updateFileNameTemplateRule(rule.id, { pattern: next });
                            }}
                            placeholder={t("da_match_phrase_placeholder")}
                          />
                          <p className="text-xs text-text-secondary">
                            {t("da_match_phrase_hint")}
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="flex flex-wrap gap-2 min-h-[2rem]">
                            {selectedPatternTokens.length ? (
                              selectedPatternTokens.map((token) => (
                                <span
                                  key={`${rule.id}-${token}`}
                                  className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-page px-2.5 py-1 text-xs text-text-primary"
                                >
                                  <span>{token}</span>
                                  <button
                                    type="button"
                                    className="rounded-full p-0.5 text-text-secondary transition-colors hover:text-text-primary"
                                    onClick={
                                      measureOnly
                                        ? undefined
                                        : () =>
                                            removePatternTokenFromRule(rule.id, token)
                                    }
                                    disabled={measureOnly}
                                    aria-label={t("da_remove_rule")}
                                    title={t("da_remove_rule")}
                                  >
                                    <X size={12} />
                                  </button>
                                </span>
                              ))
                            ) : (
                              <p className="text-xs text-text-secondary">
                                {t("da_match_field_selected_none")}
                              </p>
                            )}
                          </div>
                          <DropdownField
                            id={
                              includeIds
                                ? `device-analysis-template-rule-suggestions-${index + 1}`
                                : undefined
                            }
                            size="md"
                            value={undefined}
                            options={suggestionOptions}
                            onChange={(value) => {
                              addPatternTokenToRule(rule.id, String(value ?? ""));
                            }}
                            placeholder={
                              suggestionOptions.length
                                ? t("da_match_field_suggestions")
                                : t("da_match_field_suggestion_none")
                            }
                            disabled={measureOnly || suggestionOptions.length === 0}
                            stableWidth={false}
                            popupClassName="min-w-full !bg-bg-surface !backdrop-blur-none"
                          />
                        </>
                      )}
                    </div>
                    {hasMatchCondition ? (
                      <p className="text-xs text-text-secondary">
                        {t("da_match_field_rule_matches", {
                          count: matchedFilesCount,
                        })}
                      </p>
                    ) : null}
                    <DropdownField
                      id={
                        includeIds
                          ? `device-analysis-template-rule-template-${index + 1}`
                          : undefined
                      }
                      size="md"
                      value={rule.templateName}
                      options={availableTemplateOptions}
                      onChange={(value) => {
                        updateFileNameTemplateRule(rule.id, {
                          templateName: String(value ?? ""),
                        });
                      }}
                      placeholder={t("da_template_name")}
                      disabled={measureOnly || templatesLoading}
                      stableWidth={false}
                      popupClassName="min-w-full !bg-bg-surface !backdrop-blur-none"
                    />
                  </div>
                );
              })}
            </div>

            <div className={applyButtonsContainerClassName}>
              <Button
                id={
                  includeIds
                    ? "device-analysis-template-output-rule-apply-to-all"
                    : undefined
                }
                variant="primary"
                size="md"
                className="w-full min-w-0"
                contentClassName="w-full min-w-0 justify-center"
                onClick={
                  measureOnly
                    ? undefined
                    : () => applyFileNameTemplateRules(false)
                }
                disabled={measureOnly}
                title={t("da_apply_to_all_files")}
              >
                <span className="block min-w-0 truncate">
                  {t("da_apply_to_all_files")}
                </span>
              </Button>
              <Button
                id={
                  includeIds
                    ? "device-analysis-template-output-rule-apply-to-new"
                    : undefined
                }
                variant="secondary"
                size="md"
                className="w-full min-w-0"
                contentClassName="w-full min-w-0 justify-center"
                onClick={
                  measureOnly
                    ? undefined
                    : () => applyFileNameTemplateRules(true)
                }
                disabled={
                  measureOnly ||
                  typeof onTemplateAppliedIncremental !== "function"
                }
                title={t("da_apply_to_new_files")}
              >
                <span className="block min-w-0 truncate">
                  {t("da_apply_to_new_files")}
                </span>
              </Button>
            </div>
          </div>
        )}

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
        <div
          id={
            includeIds
              ? "device-analysis-rule-case-sensitive-toggle"
              : undefined
          }
          onClick={
            measureOnly
              ? undefined
              : () =>
                  setConfig((prev) => ({
                    ...prev,
                    fileNameMatchCaseSensitive: !prev.fileNameMatchCaseSensitive,
                  }))
          }
          className="flex items-center gap-2 text-sm text-text-secondary select-none cursor-pointer group w-fit"
        >
          {config.fileNameMatchCaseSensitive ? (
            <div className="clickable-ckb" data-state="checked">
              <Check size={14} className="text-white" strokeWidth={3} />
            </div>
          ) : (
            <div className="clickable-ckb" data-state="unchecked" />
          )}
          <span>{t("da_match_field_case_sensitive")}</span>
        </div>
        {autoSummaryCard ? (
          <div className="pt-1">
            {autoSummaryCard}
          </div>
        ) : null}
        {lowConfidenceReviewCard}
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
              interactive={!isAutoTemplateSelected}
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






