import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { TranslateFn } from "../../../context/language-context";
import { apiService } from "../services/apiService";
import { useDeviceAnalysisSession } from "./useDeviceAnalysisSession";
import {
  cloneTemplateConfig,
  createEmptyTemplateConfig,
  normalizeXDataEndValue,
  toTemplateNameKey,
  type TemplateConfig,
} from "../lib/templateManagerUtils";
import {
  validateTemplateForApply,
  validateTemplateForSave,
} from "../lib/templateValidation";

type TemplateMode = "select" | "save";
type InputSource = "manual" | "picked";
type ToastType = "warning" | "success" | "error" | "idle" | string;

type TemplateRecord = Partial<TemplateConfig> &
  Partial<{
    id: string | null;
    vdFileKeywords: string;
    vdKeyword: string;
    vgFileKeywords: string;
    vgKeyword: string;
  }> & {
    [key: string]: unknown;
  };

type DeviceAnalysisSettings = Partial<{
  lastTemplateId: string | null;
  stopOnErrorDefault: boolean;
}> &
  Record<string, unknown>;

type PreviewFileLike = Partial<{
  fileId: string;
}> &
  Record<string, unknown>;

type PreviewStatus = Partial<{
  message: string;
  state: string;
}>;

type ApplyResult = Partial<{
  message: string;
  ok: boolean;
  type: ToastType;
}>;

type UseTemplateManagerStateOptions = {
  deviceAnalysisSettings?: DeviceAnalysisSettings | null;
  onTemplateApplied?: (config: TemplateConfig) => unknown;
  onTemplateAppliedIncremental?: (config: TemplateConfig) => unknown;
  onUpdateDeviceAnalysisSettings?: (
    updates: Record<string, unknown>,
  ) => Promise<unknown> | unknown;
  previewFile?: PreviewFileLike | null;
  previewStatus?: PreviewStatus;
  showToast: (message: string, type?: ToastType) => void;
  t: TranslateFn;
};

export const useTemplateManagerState = ({
  deviceAnalysisSettings,
  onTemplateApplied,
  onTemplateAppliedIncremental,
  onUpdateDeviceAnalysisSettings,
  previewFile,
  previewStatus,
  showToast,
  t,
}: UseTemplateManagerStateOptions) => {
  const deviceSession = useDeviceAnalysisSession();

  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const templatesRequestRef = useRef<Promise<TemplateRecord[]> | null>(null);
  const [inputSources, setInputSources] = useState<Record<string, InputSource>>(
    {},
  );
  const didInitConfigFromSettingsRef = useRef(false);

  const [localSelectedTemplateId, setLocalSelectedTemplateId] = useState<
    string | null
  >(null);
  const selectedTemplateId =
    (deviceSession?.selectedTemplateId as string | null | undefined) ??
    localSelectedTemplateId;
  const setSelectedTemplateId =
    (deviceSession?.setSelectedTemplateId as
      | Dispatch<SetStateAction<string | null>>
      | undefined) ?? setLocalSelectedTemplateId;

  const [localConfig, setLocalConfig] = useState<TemplateConfig>(() =>
    createEmptyTemplateConfig(),
  );
  const config =
    (deviceSession?.templateConfig as TemplateConfig | undefined) ?? localConfig;
  const setConfig =
    (deviceSession?.setTemplateConfig as
      | Dispatch<SetStateAction<TemplateConfig>>
      | undefined) ?? setLocalConfig;

  const [localTemplateMode, setLocalTemplateMode] =
    useState<TemplateMode>("select");
  const templateMode =
    (deviceSession?.templateMode as TemplateMode | undefined) ?? localTemplateMode;
  const setTemplateMode =
    (deviceSession?.setTemplateMode as
      | Dispatch<SetStateAction<TemplateMode>>
      | undefined) ?? setLocalTemplateMode;
  const saveDraftTouchedRef = useRef(false);
  const saveDraftBaseConfigRef = useRef<TemplateConfig | null>(null);
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);
  const [pendingTemplateMode, setPendingTemplateMode] =
    useState<TemplateMode | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const isSelectMode = templateMode === "select";

  useEffect(() => {
    if (didInitConfigFromSettingsRef.current) return;
    if (!deviceAnalysisSettings) return;

    didInitConfigFromSettingsRef.current = true;
    const nextStopOnError = Boolean(deviceAnalysisSettings?.stopOnErrorDefault);
    setConfig((prev) => ({ ...prev, stopOnError: nextStopOnError }));
  }, [deviceAnalysisSettings, setConfig]);

  const markFieldSource = useCallback((field: unknown, source: unknown) => {
    if (typeof field !== "string" || !field.trim()) return;
    if (source !== "manual" && source !== "picked") return;
    setInputSources((prev) => ({
      ...(prev || {}),
      [field]: source,
    }));
  }, []);

  const markSaveDraftTouched = useCallback(() => {
    saveDraftTouchedRef.current = true;
  }, []);

  const writeFieldFromPreview = useCallback(
    (field: string, value: string) => {
      setConfig((prev) => ({ ...prev, [field]: value } as TemplateConfig));
      markFieldSource(field, "picked");
    },
    [markFieldSource, setConfig],
  );

  const ensureTemplatesLoaded = useCallback(async (): Promise<TemplateRecord[]> => {
    if (templatesLoaded) return templates;
    if (templatesRequestRef.current) {
      return templatesRequestRef.current;
    }

    const request = (async (): Promise<TemplateRecord[]> => {
      setTemplatesLoading(true);

      try {
        const remote = await apiService.getDeviceAnalysisTemplates();
        const remoteTemplates = Array.isArray(remote)
          ? (remote as TemplateRecord[])
          : [];
        setTemplates(remoteTemplates);
        setTemplatesLoaded(true);
        return remoteTemplates;
      } catch (error) {
        showToast(
          t("da_loadTemplatesFailed", {
            error: error instanceof Error ? error.message : t("unknownError"),
          }),
        );
        throw error;
      } finally {
        templatesRequestRef.current = null;
        setTemplatesLoading(false);
      }
    })();

    templatesRequestRef.current = request;
    return request;
  }, [showToast, t, templates, templatesLoaded]);

  useEffect(() => {
    if (!isSelectMode) return;
    if (!deviceAnalysisSettings?.lastTemplateId) return;
    if (templatesLoaded) return;

    void ensureTemplatesLoaded().catch(() => {});
  }, [
    deviceAnalysisSettings?.lastTemplateId,
    ensureTemplatesLoaded,
    isSelectMode,
    templatesLoaded,
  ]);

  const closeTemplateDropdown = useCallback(() => {
    setIsDropdownOpen(false);
  }, []);

  const openTemplateDropdown = useCallback(() => {
    if (!isDropdownOpen) {
      void ensureTemplatesLoaded().catch(() => {});
    }
    setIsDropdownOpen(true);
  }, [ensureTemplatesLoaded, isDropdownOpen]);

  const toggleTemplateDropdown = useCallback(() => {
    if (isDropdownOpen) {
      setIsDropdownOpen(false);
      return;
    }

    void ensureTemplatesLoaded().catch(() => {});
    setIsDropdownOpen(true);
  }, [ensureTemplatesLoaded, isDropdownOpen]);

  const loadTemplate = useCallback(
    (template: TemplateRecord, options: { persist?: boolean } = {}) => {
      const { persist } = options;
      setInputSources({});

      const rest: Omit<TemplateConfig, "selectedColumns"> & {
        selectedColumns: number[] | null;
      } = {
        name: String(template?.name ?? ""),
        xDataStart: String(template?.xDataStart ?? ""),
        xDataEnd: String(template?.xDataEnd ?? ""),
        xPoints: String(template?.xPoints ?? ""),
        xUnit: String(template?.xUnit ?? ""),
        yDataStart: String(template?.yDataStart ?? ""),
        yDataEnd: String(template?.yDataEnd ?? ""),
        yPoints: String(template?.yPoints ?? ""),
        yCount: String(template?.yCount ?? ""),
        yStep: String(template?.yStep ?? ""),
        yUnit: String(template?.yUnit ?? ""),
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
        selectedColumns: Array.isArray(template?.selectedColumns)
          ? (template.selectedColumns as number[])
          : null,
      };

      const startCell = String(rest.xDataStart ?? "").trim();
      const xDataEndRaw = normalizeXDataEndValue(rest.xDataEnd);
      const xDataEnd = !xDataEndRaw ? (startCell ? "End" : "") : xDataEndRaw;

      setConfig((prev) => ({
        ...prev,
        ...rest,
        xDataEnd,
        selectedColumns: Array.isArray(rest.selectedColumns)
          ? rest.selectedColumns
          : prev.selectedColumns,
      }));
      setSelectedTemplateId((template?.id as string | null | undefined) ?? null);
      setIsDropdownOpen(false);

      if (persist !== false && typeof onUpdateDeviceAnalysisSettings === "function") {
        void onUpdateDeviceAnalysisSettings({
          lastTemplateId: (template?.id as string | null | undefined) ?? null,
          stopOnErrorDefault: Boolean(template?.stopOnError),
        });
      }
    },
    [onUpdateDeviceAnalysisSettings, setConfig, setSelectedTemplateId],
  );

  const handleSaveTemplate = useCallback(async () => {
    const name = config.name.trim();
    if (!name) return;

    const previewReady =
      previewStatus?.state === "ready" && Boolean(previewFile?.fileId);
    if (!previewReady) {
      showToast("Please load a file first.", "warning");
      return;
    }

    const validation = validateTemplateForSave(
      config,
      t as (key: string, params?: Record<string, unknown>) => string,
    );
    if (!validation.ok || !validation.normalized) {
      showToast(validation.message || "Invalid configuration", "warning");
      return;
    }

    try {
      saveDraftTouchedRef.current = false;
      saveDraftBaseConfigRef.current = null;

      const savedRaw = await apiService.createDeviceAnalysisTemplate({
        ...validation.normalized,
        name,
      });
      const saved: TemplateRecord =
        savedRaw && typeof savedRaw === "object"
          ? (savedRaw as TemplateRecord)
          : { ...validation.normalized, name };

      setTemplates((prev) => {
        const savedNameKey = toTemplateNameKey(saved?.name);
        return [
          saved,
          ...prev.filter(
            (template) =>
              template?.id !== saved?.id &&
              toTemplateNameKey(template?.name) !== savedNameKey,
          ),
        ];
      });
      setTemplatesLoaded(true);
      loadTemplate(saved);
      showToast(t("da_template_saved"), "success");
      setTemplateMode("select");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to save template",
        "warning",
      );
    }
  }, [
    config,
    loadTemplate,
    previewFile?.fileId,
    previewStatus?.state,
    setTemplateMode,
    showToast,
    t,
  ]);

  const handleDeleteTemplate = useCallback(
    async (id: string) => {
      try {
        await apiService.deleteDeviceAnalysisTemplate(id);
        setTemplates((prev) => prev.filter((template) => template?.id !== id));
        setTemplatesLoaded(true);

        if (selectedTemplateId === id) {
          setSelectedTemplateId(null);
          if (typeof onUpdateDeviceAnalysisSettings === "function") {
            void onUpdateDeviceAnalysisSettings({ lastTemplateId: null });
          }
        }
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : "Failed to delete template",
          "warning",
        );
      }
    },
    [
      onUpdateDeviceAnalysisSettings,
      selectedTemplateId,
      setSelectedTemplateId,
      showToast,
    ],
  );

  useEffect(() => {
    const startCell = String(config.xDataStart ?? "").trim();
    const endValue = normalizeXDataEndValue(config.xDataEnd);
    const endSource = inputSources?.xDataEnd;

    if (startCell) {
      if (!endValue && endSource !== "picked") {
        setConfig((prev) => ({ ...prev, xDataEnd: "End" }));
      }
      return;
    }

    if (endValue === "End" && endSource !== "picked") {
      setConfig((prev) => ({ ...prev, xDataEnd: "" }));
    }
  }, [config.xDataEnd, config.xDataStart, inputSources?.xDataEnd, setConfig]);

  const discardUnsavedSaveEdits = useCallback(() => {
    if (!saveDraftTouchedRef.current) return;
    saveDraftTouchedRef.current = false;

    const base = saveDraftBaseConfigRef.current;
    if (base) {
      setConfig(cloneTemplateConfig(base));
      return;
    }

    if (!selectedTemplateId) return;
    const found = Array.isArray(templates)
      ? templates.find((template) => template?.id === selectedTemplateId)
      : null;
    if (!found) return;

    loadTemplate(found, { persist: false });
  }, [loadTemplate, selectedTemplateId, setConfig, templates]);

  const closeDiscardConfirm = useCallback(() => {
    setIsDiscardConfirmOpen(false);
    setPendingTemplateMode(null);
  }, []);

  const confirmDiscardAndSwitch = useCallback(() => {
    discardUnsavedSaveEdits();
    saveDraftBaseConfigRef.current = null;
    setIsDiscardConfirmOpen(false);
    setTemplateMode(pendingTemplateMode || "select");
    setPendingTemplateMode(null);
  }, [discardUnsavedSaveEdits, pendingTemplateMode, setTemplateMode]);

  useEffect(() => {
    if (!isSelectMode) return;

    const lastId = deviceAnalysisSettings?.lastTemplateId;
    if (!lastId) return;
    if (!Array.isArray(templates) || templates.length === 0) return;
    if (selectedTemplateId) return;

    const found = templates.find((template) => template?.id === lastId);
    if (!found) return;

    let cancelled = false;
    const scheduleMicrotaskFn: (callback: () => void) => void =
      typeof queueMicrotask === "function"
        ? queueMicrotask
        : (callback) => {
            void Promise.resolve().then(callback);
          };

    scheduleMicrotaskFn(() => {
      if (cancelled) return;
      loadTemplate(found, { persist: false });
    });

    return () => {
      cancelled = true;
    };
  }, [
    deviceAnalysisSettings?.lastTemplateId,
    isSelectMode,
    loadTemplate,
    selectedTemplateId,
    templates,
  ]);

  const applyWithHandler = useCallback(
    (handler: ((nextConfig: TemplateConfig) => unknown) | undefined) => {
      if (typeof handler !== "function") return;

      const validation = validateTemplateForApply(
        config,
        t as (key: string, params?: Record<string, unknown>) => string,
      );
      if (!validation.ok || !validation.normalized) {
        showToast(validation.message || "Invalid configuration", "warning");
        return;
      }

      const normalized = validation.normalized as TemplateConfig;

      if (
        normalized.bottomTitle !== config.bottomTitle ||
        normalized.legendPrefix !== config.legendPrefix ||
        normalized.xUnit !== config.xUnit ||
        normalized.yUnit !== config.yUnit ||
        normalized.fileNameVgKeywords !== config.fileNameVgKeywords ||
        normalized.fileNameVdKeywords !== config.fileNameVdKeywords
      ) {
        setConfig(normalized);
      }

      const result = handler(normalized);
      if (result && typeof result === "object") {
        const safeResult = result as ApplyResult;
        if (safeResult.ok === false) {
          showToast(
            safeResult.message || "Invalid configuration",
            safeResult.type || "warning",
          );
          return;
        }
        if (
          safeResult.ok === true &&
          safeResult.message &&
          safeResult.type &&
          safeResult.type !== "success"
        ) {
          showToast(safeResult.message, safeResult.type || "success");
        }
      }
    },
    [config, setConfig, showToast, t],
  );

  const applyConfiguration = useCallback(() => {
    applyWithHandler(onTemplateApplied);
  }, [applyWithHandler, onTemplateApplied]);

  const applyNewFilesConfiguration = useCallback(() => {
    applyWithHandler(onTemplateAppliedIncremental);
  }, [applyWithHandler, onTemplateAppliedIncremental]);

  const handleTemplateModeChange = useCallback(
    (nextMode: unknown) => {
      if (nextMode !== "select" && nextMode !== "save") {
        return;
      }

      if (nextMode === templateMode) return;

      if (templateMode === "save" && nextMode === "select") {
        if (saveDraftTouchedRef.current) {
          setPendingTemplateMode(nextMode);
          setIsDiscardConfirmOpen(true);
          return;
        }

        saveDraftBaseConfigRef.current = null;
        setTemplateMode(nextMode);
        return;
      }

      if (nextMode === "save") {
        saveDraftTouchedRef.current = false;
        saveDraftBaseConfigRef.current = cloneTemplateConfig(config);
        setIsDropdownOpen(false);
      }

      setTemplateMode(nextMode);
    },
    [config, setTemplateMode, templateMode],
  );

  const handleCreateNewTemplate = useCallback(() => {
    const nextConfig = createEmptyTemplateConfig({
      stopOnError: Boolean(deviceAnalysisSettings?.stopOnErrorDefault),
    });

    saveDraftTouchedRef.current = false;
    saveDraftBaseConfigRef.current = cloneTemplateConfig(nextConfig);
    setTemplateMode("save");
    setIsDropdownOpen(false);
    setSelectedTemplateId(null);

    if (typeof onUpdateDeviceAnalysisSettings === "function") {
      void onUpdateDeviceAnalysisSettings({
        lastTemplateId: null,
      });
    }

    setInputSources({});
    setConfig(nextConfig);
  }, [
    deviceAnalysisSettings?.stopOnErrorDefault,
    onUpdateDeviceAnalysisSettings,
    setConfig,
    setSelectedTemplateId,
    setTemplateMode,
  ]);

  return {
    applyConfiguration,
    applyNewFilesConfiguration,
    closeDiscardConfirm,
    closeTemplateDropdown,
    config,
    confirmDiscardAndSwitch,
    handleCreateNewTemplate,
    handleDeleteTemplate,
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
    templateMode,
    templates,
    templatesLoading,
    toggleTemplateDropdown,
    writeFieldFromPreview,
  };
};
