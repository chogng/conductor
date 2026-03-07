import { useCallback, useEffect, useRef, useState } from "react";
import { apiService } from "../services/apiService";
import { useDeviceAnalysisSession } from "./useDeviceAnalysisSession";
import {
  cloneTemplateConfig,
  createEmptyTemplateConfig,
  normalizeXDataEndValue,
  toTemplateNameKey,
} from "../lib/templateManagerUtils";
import {
  validateTemplateForApply,
  validateTemplateForSave,
} from "../lib/templateValidation";

export const useTemplateManagerState = ({
  deviceAnalysisSettings,
  onTemplateApplied,
  onTemplateAppliedIncremental,
  onUpdateDeviceAnalysisSettings,
  previewFile,
  previewStatus,
  showToast,
  t,
}) => {
  const deviceSession = useDeviceAnalysisSession();

  const [templates, setTemplates] = useState([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const templatesRequestRef = useRef(null);
  const [inputSources, setInputSources] = useState({});
  const didInitConfigFromSettingsRef = useRef(false);

  const [localSelectedTemplateId, setLocalSelectedTemplateId] = useState(null);
  const selectedTemplateId =
    deviceSession?.selectedTemplateId ?? localSelectedTemplateId;
  const setSelectedTemplateId =
    deviceSession?.setSelectedTemplateId ?? setLocalSelectedTemplateId;

  const [localConfig, setLocalConfig] = useState(() => createEmptyTemplateConfig());
  const config = deviceSession?.templateConfig ?? localConfig;
  const setConfig = deviceSession?.setTemplateConfig ?? setLocalConfig;

  const [localTemplateMode, setLocalTemplateMode] = useState("select");
  const templateMode = deviceSession?.templateMode ?? localTemplateMode;
  const setTemplateMode =
    deviceSession?.setTemplateMode ?? setLocalTemplateMode;
  const saveDraftTouchedRef = useRef(false);
  const saveDraftBaseConfigRef = useRef(null);
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);
  const [pendingTemplateMode, setPendingTemplateMode] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const isSelectMode = templateMode === "select";

  useEffect(() => {
    if (didInitConfigFromSettingsRef.current) return;
    if (!deviceAnalysisSettings) return;

    didInitConfigFromSettingsRef.current = true;
    const nextStopOnError = Boolean(deviceAnalysisSettings?.stopOnErrorDefault);
    setConfig((prev) => ({ ...prev, stopOnError: nextStopOnError }));
  }, [deviceAnalysisSettings, setConfig]);

  const markFieldSource = useCallback((field, source) => {
    if (!field || (source !== "manual" && source !== "picked")) return;
    setInputSources((prev) => ({ ...(prev || {}), [field]: source }));
  }, []);

  const markSaveDraftTouched = useCallback(() => {
    saveDraftTouchedRef.current = true;
  }, []);

  const writeFieldFromPreview = useCallback(
    (field, value) => {
      setConfig((prev) => ({ ...prev, [field]: value }));
      markFieldSource(field, "picked");
    },
    [markFieldSource, setConfig],
  );

  const ensureTemplatesLoaded = useCallback(async () => {
    if (templatesLoaded) return templates;
    if (templatesRequestRef.current) {
      return templatesRequestRef.current;
    }

    const request = (async () => {
      setTemplatesLoading(true);

      try {
        const remote = await apiService.getDeviceAnalysisTemplates();
        const remoteTemplates = Array.isArray(remote) ? remote : [];
        setTemplates(remoteTemplates);
        setTemplatesLoaded(true);
        return remoteTemplates;
      } catch (error) {
        showToast(
          t("da_loadTemplatesFailed", {
            error: error?.message || t("unknownError"),
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
    (template, { persist } = {}) => {
      setInputSources({});

      const rest = {
        name: template?.name ?? "",
        xDataStart: template?.xDataStart ?? "",
        xDataEnd: template?.xDataEnd ?? "",
        xPoints: template?.xPoints ?? "",
        yDataStart: template?.yDataStart ?? "",
        yDataEnd: template?.yDataEnd ?? "",
        yPoints: template?.yPoints ?? "",
        yCount: template?.yCount ?? "",
        yStep: template?.yStep ?? "",
        stopOnError: Boolean(template?.stopOnError),
        bottomTitle: template?.bottomTitle ?? template?.vgKeyword ?? "",
        leftTitle: template?.leftTitle ?? "",
        legendPrefix: template?.legendPrefix ?? template?.vdKeyword ?? "",
        fileNameVgKeywords:
          template?.fileNameVgKeywords ?? template?.vgFileKeywords ?? "",
        fileNameVdKeywords:
          template?.fileNameVdKeywords ?? template?.vdFileKeywords ?? "",
        selectedColumns: Array.isArray(template?.selectedColumns)
          ? template.selectedColumns
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
      setSelectedTemplateId(template?.id ?? null);
      setIsDropdownOpen(false);

      if (
        persist !== false &&
        typeof onUpdateDeviceAnalysisSettings === "function"
      ) {
        void onUpdateDeviceAnalysisSettings({
          lastTemplateId: template?.id ?? null,
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

    const validation = validateTemplateForSave(config, t);
    if (!validation.ok) {
      showToast(validation.message || "Invalid configuration", "warning");
      return;
    }

    try {
      saveDraftTouchedRef.current = false;
      saveDraftBaseConfigRef.current = null;

      const saved = await apiService.createDeviceAnalysisTemplate({
        ...validation.normalized,
        name,
      });

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
      showToast(error.message || "Failed to save template", "warning");
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
    async (id) => {
      try {
        await apiService.deleteDeviceAnalysisTemplate(id);
        setTemplates((prev) => prev.filter((template) => template.id !== id));
        setTemplatesLoaded(true);

        if (selectedTemplateId === id) {
          setSelectedTemplateId(null);
          if (typeof onUpdateDeviceAnalysisSettings === "function") {
            void onUpdateDeviceAnalysisSettings({ lastTemplateId: null });
          }
        }
      } catch (error) {
        showToast(error.message || "Failed to delete template", "warning");
      }
    },
    [onUpdateDeviceAnalysisSettings, selectedTemplateId, setSelectedTemplateId, showToast],
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
    const scheduleMicrotask =
      typeof queueMicrotask === "function"
        ? queueMicrotask
        : (callback) => Promise.resolve().then(callback);

    scheduleMicrotask(() => {
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
    (handler) => {
      if (typeof handler !== "function") return;

      const validation = validateTemplateForApply(config, t);
      if (!validation.ok) {
        showToast(validation.message || "Invalid configuration", "warning");
        return;
      }

      if (
        validation.normalized.bottomTitle !== config.bottomTitle ||
        validation.normalized.legendPrefix !== config.legendPrefix ||
        validation.normalized.fileNameVgKeywords !== config.fileNameVgKeywords ||
        validation.normalized.fileNameVdKeywords !== config.fileNameVdKeywords
      ) {
        setConfig(validation.normalized);
      }

      const result = handler(validation.normalized);
      if (result && typeof result === "object") {
        if (result.ok === false) {
          showToast(result.message || "Invalid configuration", result.type);
          return;
        }
        if (result.ok === true && result.message) {
          showToast(result.message, result.type || "success");
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
    (nextMode) => {
      if (
        nextMode !== "select" &&
        nextMode !== "save"
      ) {
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
