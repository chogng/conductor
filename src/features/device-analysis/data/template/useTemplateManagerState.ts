import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { PreviewStatus as SessionPreviewStatus } from "../../session/device-analysis-session-context";
import type { PreviewFileLike } from "../../shared/lib/sharedTypes";
import type { LooseTranslateFn as TranslateFn } from "../../shared/lib/translateTypes";
import { apiService } from "../../analysis/services/apiService";
import { useDeviceAnalysisSession } from "../../session/useDeviceAnalysisSession";
import {
  cloneTemplateConfig,
  createEmptyTemplateConfig,
  normalizeXDataEndValue,
  normalizeTemplateConfigRecord,
  toTemplateNameKey,
  type TemplateConfig,
} from "./templateManagerUtils";
import { normalizeDeviceAnalysisYUnit } from "../../analysis/lib/deviceAnalysisUnits";
import { resolveXSegmentationMode } from "../../shared/lib/XSegmentation";
import { DEVICE_ANALYSIS_ONBOARDING_CREATE_TEMPLATE_EVENT } from "../../onboarding/onboardingEvents";
import {
  validateTemplateForApply,
  validateTemplateForSave,
} from "./templateValidation";
import { stableStringify } from "../../shared/lib/deviceAnalysisUtils";
import { normalizeFileNameFieldSeparators } from "../../shared/lib/fileNameFieldMatching";

type TemplateMode = "select" | "save";
type InputSource = "manual" | "picked";
type ToastType = "warning" | "success" | "error" | "idle" | string;

type TemplateRecord = Partial<TemplateConfig> &
  Partial<{
    id: string | null;
  }> & {
    [key: string]: unknown;
  };

type DeviceAnalysisSettings = Partial<{
  lastTemplateId: string | null;
  stopOnErrorDefault: boolean;
}> &
  Record<string, unknown>;

type PreviewStatus = Partial<SessionPreviewStatus>;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

const isTemplateRecord = (value: unknown): value is TemplateRecord =>
  isObjectRecord(value);

const normalizeTemplateId = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const normalizeTemplateXUnit = (value: unknown): string => {
  const unit = String(value ?? "").trim();
  return unit || "V";
};

const TEMPLATE_TRANSFER_FILE_VERSION = 1;

type TemplateTransferPayload = TemplateRecord & {
  source: string;
  version: number;
};

const toTemplateTransferRecord = (template: TemplateRecord): TemplateRecord => ({
  ...normalizeTemplateConfigRecord(template),
  xUnit: normalizeTemplateXUnit(template?.xUnit),
  yUnit: normalizeDeviceAnalysisYUnit(template?.yUnit, "A"),
});

const mergeTemplatesByIdentity = (
  existing: TemplateRecord[],
  incoming: TemplateRecord[],
): TemplateRecord[] => {
  if (!Array.isArray(incoming) || incoming.length === 0) return existing;

  const incomingByName = new Map<string, TemplateRecord>();
  for (const template of incoming) {
    const nameKey = toTemplateNameKey(template?.name);
    if (!nameKey) continue;
    incomingByName.set(nameKey, template);
  }

  const dedupedIncoming = [...incomingByName.values()];
  const incomingIds = new Set(
    dedupedIncoming
      .map((template) => normalizeTemplateId(template?.id))
      .filter((id): id is string => Boolean(id)),
  );
  const incomingNameKeys = new Set(
    dedupedIncoming
      .map((template) => toTemplateNameKey(template?.name))
      .filter(Boolean),
  );

  return [
    ...dedupedIncoming,
    ...existing.filter((template) => {
      const id = normalizeTemplateId(template?.id);
      if (id && incomingIds.has(id)) return false;
      const nameKey = toTemplateNameKey(template?.name);
      if (nameKey && incomingNameKeys.has(nameKey)) return false;
      return true;
    }),
  ];
};

const extractImportedTemplates = (payload: unknown): unknown[] => {
  if (!isObjectRecord(payload)) return [];

  const version = Number(payload?.version);
  if (!Number.isInteger(version) || version !== TEMPLATE_TRANSFER_FILE_VERSION) {
    return [];
  }
  const source = String(payload?.source ?? "").trim();
  if (!source) return [];

  return [payload];
};

const extractTemplateNameFromFileName = (fileNameRaw: unknown): string =>
  String(fileNameRaw ?? "")
    .replace(/\.json$/i, "")
    .trim();

const createUniqueTemplateName = (
  baseName: string,
  occupiedNameKeys: Set<string>,
): string => {
  const normalizedBase = String(baseName || "").trim();
  if (!normalizedBase) return "template(1)";

  let suffix = 1;
  while (suffix < 10000) {
    const candidate = `${normalizedBase}(${suffix})`;
    if (!occupiedNameKeys.has(toTemplateNameKey(candidate))) {
      return candidate;
    }
    suffix += 1;
  }
  return `${normalizedBase}(${Date.now()})`;
};

type UseTemplateManagerStateOptions = {
  deviceAnalysisSettings?: DeviceAnalysisSettings | null;
  onTemplateApplied?: (config: Record<string, unknown>) => unknown;
  onTemplateAppliedIncremental?: (config: Record<string, unknown>) => unknown;
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
  const {
    selectedTemplateId,
    setSelectedTemplateId,
    templateConfig: config,
    setTemplateConfig: setConfig,
    templateMode,
    setTemplateMode,
  } = useDeviceAnalysisSession();

  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateTransferBusy, setTemplateTransferBusy] = useState(false);
  const templatesRequestRef = useRef<Promise<TemplateRecord[]> | null>(null);
  const [inputSources, setInputSources] = useState<Record<string, InputSource>>(
    {},
  );
  const didInitConfigFromSettingsRef = useRef(false);
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
          ? remote.filter(isTemplateRecord)
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
      const rest = normalizeTemplateConfigRecord({
        ...template,
        xSegmentationMode: resolveXSegmentationMode(template?.xSegmentationMode),
        xUnit: normalizeTemplateXUnit(template?.xUnit),
        yUnit: normalizeDeviceAnalysisYUnit(template?.yUnit, "A"),
      });

      const templateId = normalizeTemplateId(template?.id);

      setConfig((prev) => ({
        ...prev,
        ...rest,
        yColumns: Array.isArray(rest.yColumns) ? rest.yColumns : prev.yColumns,
      }));
      setSelectedTemplateId(templateId);
      setIsDropdownOpen(false);

      if (persist !== false && typeof onUpdateDeviceAnalysisSettings === "function") {
        void onUpdateDeviceAnalysisSettings({
          lastTemplateId: templateId,
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
      t,
    );
    if (!validation.ok || !validation.normalized) {
      showToast(validation.message || "Invalid configuration", "warning");
      return;
    }

    try {
      saveDraftTouchedRef.current = false;
      saveDraftBaseConfigRef.current = null;

      const persistedTemplate = {
        ...validation.normalized,
        name,
      };
      const savedRaw = await apiService.createDeviceAnalysisTemplate({
        ...persistedTemplate,
      });
      const saved: TemplateRecord =
        isTemplateRecord(savedRaw)
          ? savedRaw
          : persistedTemplate;

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
          setConfig((prev) => ({ ...prev, name: "" }));
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
      setConfig,
      setSelectedTemplateId,
      showToast,
    ],
  );

  const createTemplateExportBundle =
    useCallback(async (): Promise<TemplateTransferPayload | null> => {
      setTemplateTransferBusy(true);

      try {
        const loadedTemplates = await ensureTemplatesLoaded();
        const selectedById =
          typeof selectedTemplateId === "string" && selectedTemplateId.trim()
            ? loadedTemplates.find(
                (template) =>
                  normalizeTemplateId(template?.id) === selectedTemplateId,
              ) || null
            : null;
        const selectedNameKey = toTemplateNameKey(config?.name);
        const selectedByName = selectedNameKey
          ? loadedTemplates.find(
              (template) => toTemplateNameKey(template?.name) === selectedNameKey,
            ) || null
          : null;
        const selectedTemplate = selectedById || selectedByName;

        if (!selectedTemplate) {
          showToast(t("da_template_export_empty"), "warning");
          return null;
        }

        const templateForExport = toTemplateTransferRecord(selectedTemplate);
        if (!String(templateForExport?.name ?? "").trim()) {
          showToast(t("da_template_export_empty"), "warning");
          return null;
        }

        return {
          version: TEMPLATE_TRANSFER_FILE_VERSION,
          source: "conductor",
          ...templateForExport,
        };
      } catch (error) {
        showToast(
          t("da_template_export_failed", {
            error: error instanceof Error ? error.message : t("unknownError"),
          }),
          "warning",
        );
        return null;
      } finally {
        setTemplateTransferBusy(false);
      }
    }, [config?.name, ensureTemplatesLoaded, selectedTemplateId, showToast, t]);

  const importTemplatesFromPayload = useCallback(
    async (
      payload: unknown,
      options: Partial<{
        fileName: string;
      }> = {},
    ) => {
      const importedEntries = extractImportedTemplates(payload);
      if (importedEntries.length === 0) {
        showToast(t("da_template_import_invalid_format"), "warning");
        return;
      }

      setTemplateTransferBusy(true);

      try {
        const loadedTemplates = await ensureTemplatesLoaded();
        const occupiedNameKeys = new Set(
          loadedTemplates
            .map((template) => toTemplateNameKey(template?.name))
            .filter(Boolean),
        );
        const fileNameTemplateName = extractTemplateNameFromFileName(options?.fileName);
        const savedTemplates: TemplateRecord[] = [];
        let skippedCount = 0;

        for (const entry of importedEntries) {
          if (!isTemplateRecord(entry)) {
            skippedCount += 1;
            continue;
          }

          const draft = toTemplateTransferRecord(entry);
          const jsonName = String(draft?.name ?? "").trim();
          let resolvedName = jsonName;

          if (fileNameTemplateName && fileNameTemplateName !== jsonName) {
            resolvedName = fileNameTemplateName;
          }

          if (!resolvedName) {
            skippedCount += 1;
            continue;
          }

          const normalizedResolvedNameKey = toTemplateNameKey(resolvedName);
          if (occupiedNameKeys.has(normalizedResolvedNameKey)) {
            const nextName = createUniqueTemplateName(
              resolvedName,
              occupiedNameKeys,
            );
            const confirmMessage = [
              `模板“${resolvedName}”已存在。`,
              `确定：改名为“${nextName}”导入。`,
              "取消：覆盖已有模板。",
            ].join("\n");
            const shouldRename =
              typeof window !== "undefined" &&
              typeof window.confirm === "function"
                ? window.confirm(confirmMessage)
                : true;
            if (shouldRename) {
              resolvedName = nextName;
            }
          }

          const validation = validateTemplateForSave(
            {
              ...draft,
              name: resolvedName,
            },
            t,
          );
          if (!validation.ok || !validation.normalized) {
            skippedCount += 1;
            continue;
          }

          const persistedTemplate = {
            ...validation.normalized,
            name: resolvedName,
          };
          try {
            const savedRaw = await apiService.createDeviceAnalysisTemplate({
              ...persistedTemplate,
            });
            const saved: TemplateRecord = isTemplateRecord(savedRaw)
              ? savedRaw
              : persistedTemplate;
            savedTemplates.push(saved);
            occupiedNameKeys.add(toTemplateNameKey(resolvedName));
          } catch {
            skippedCount += 1;
          }
        }

        if (savedTemplates.length === 0) {
          showToast(t("da_template_import_none"), "warning");
          return;
        }

        setTemplates((prev) => mergeTemplatesByIdentity(prev, savedTemplates));
        setTemplatesLoaded(true);
        loadTemplate(savedTemplates[0]);

        showToast(
          t("da_template_import_result", {
            imported: savedTemplates.length,
            total: importedEntries.length,
            skipped: skippedCount,
          }),
          skippedCount > 0 ? "warning" : "success",
        );
      } finally {
        setTemplateTransferBusy(false);
      }
    },
    [ensureTemplatesLoaded, loadTemplate, showToast, t],
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
    (
      handler: ((nextConfig: Record<string, unknown>) => unknown) | undefined,
      sourceConfig: Record<string, unknown> = config,
      options: { syncConfig?: boolean } = {},
    ) => {
      if (typeof handler !== "function") return;
      const sourceConfigRecord = sourceConfig as Record<string, unknown>;
      const hasRuleList =
        Array.isArray(sourceConfigRecord?.fileNameTemplateRules) &&
        sourceConfigRecord.fileNameTemplateRules.length > 0;

      if (hasRuleList) {
        const result = handler(sourceConfigRecord);
        if (isObjectRecord(result)) {
          const ok =
            typeof result.ok === "boolean" ? result.ok : undefined;
          const message =
            typeof result.message === "string" ? result.message : undefined;
          const type =
            typeof result.type === "string" ? result.type : undefined;

          if (ok === false) {
            showToast(
              message || "Invalid configuration",
              type || "warning",
            );
            return;
          }
          if (
            ok === true &&
            message &&
            type &&
            type !== "success"
          ) {
            showToast(message, type || "success");
          }
        }
        return;
      }

      const normalizedSourceConfig = normalizeTemplateConfigRecord(
        sourceConfig as Record<string, unknown>,
      );
      const validation = validateTemplateForApply(normalizedSourceConfig, t);
      if (!validation.ok || !validation.normalized) {
        showToast(validation.message || "Invalid configuration", "warning");
        return;
      }

      const normalized = validation.normalized;
      const normalizedForApply = {
        ...normalized,
        fileNameFieldSeparators: normalizeFileNameFieldSeparators(
          deviceAnalysisSettings?.fileNameFieldSeparators,
        ),
      };
      const shouldSyncConfig = options.syncConfig !== false;

      if (
        shouldSyncConfig &&
        stableStringify(normalized) !== stableStringify(config)
      ) {
        setConfig(normalized);
      }

      const result = handler(normalizedForApply);
      if (isObjectRecord(result)) {
        const ok =
          typeof result.ok === "boolean" ? result.ok : undefined;
        const message =
          typeof result.message === "string" ? result.message : undefined;
        const type =
          typeof result.type === "string" ? result.type : undefined;

        if (ok === false) {
          showToast(
            message || "Invalid configuration",
            type || "warning",
          );
          return;
        }
        if (
          ok === true &&
          message &&
          type &&
          type !== "success"
        ) {
          showToast(message, type || "success");
        }
      }
    },
    [
      config,
      deviceAnalysisSettings?.fileNameFieldSeparators,
      setConfig,
      showToast,
      t,
    ],
  );

  const applyConfiguration = useCallback(() => {
    applyWithHandler(onTemplateApplied);
  }, [applyWithHandler, onTemplateApplied]);

  const applyNewFilesConfiguration = useCallback(() => {
    applyWithHandler(onTemplateAppliedIncremental);
  }, [applyWithHandler, onTemplateAppliedIncremental]);

  const applyConfigurationWithConfig = useCallback(
    (nextConfig: Record<string, unknown>) => {
      applyWithHandler(onTemplateApplied, nextConfig);
    },
    [applyWithHandler, onTemplateApplied],
  );

  const applyNewFilesConfigurationWithConfig = useCallback(
    (nextConfig: Record<string, unknown>) => {
      applyWithHandler(onTemplateAppliedIncremental, nextConfig);
    },
    [applyWithHandler, onTemplateAppliedIncremental],
  );

  const applyConfigurationWithExternalConfig = useCallback(
    (nextConfig: Record<string, unknown>) => {
      applyWithHandler(onTemplateApplied, nextConfig, { syncConfig: false });
    },
    [applyWithHandler, onTemplateApplied],
  );

  const applyNewFilesConfigurationWithExternalConfig = useCallback(
    (nextConfig: Record<string, unknown>) => {
      applyWithHandler(onTemplateAppliedIncremental, nextConfig, {
        syncConfig: false,
      });
    },
    [applyWithHandler, onTemplateAppliedIncremental],
  );

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

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleOnboardingCreateTemplate = () => {
      handleCreateNewTemplate();
    };

    window.addEventListener(
      DEVICE_ANALYSIS_ONBOARDING_CREATE_TEMPLATE_EVENT,
      handleOnboardingCreateTemplate,
    );

    return () => {
      window.removeEventListener(
        DEVICE_ANALYSIS_ONBOARDING_CREATE_TEMPLATE_EVENT,
        handleOnboardingCreateTemplate,
      );
    };
  }, [handleCreateNewTemplate]);

  return {
    applyConfiguration,
    applyConfigurationWithConfig,
    applyConfigurationWithExternalConfig,
    applyNewFilesConfiguration,
    applyNewFilesConfigurationWithConfig,
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
  };
};
