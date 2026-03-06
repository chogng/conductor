import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Trash2,
  ArrowUp,
  ChevronDown,
  List,
  Save,
  Plus,
  Copy,
  FileSpreadsheet,
  Square,
  Check,
} from "lucide-react";
import { apiService } from "../../../services/apiService";
import { useLanguage } from "../../../hooks/useLanguage";
import { useDeviceAnalysisSession } from "../../../hooks/useDeviceAnalysisSession";
import Toast from "../../../components/ui/Toast";
import Input from "../../../components/ui/Input";
import Tabs from "../../../components/ui/Tabs";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import Avatar from "../../../components/ui/Avatar";
import Modal from "../../../components/ui/Modal";
import DropdownMenu from "../../../components/ui/DropdownMenu";
import { formatNumber } from "./analysisMath";
import {
  validateTemplateForApply,
  validateTemplateForSave,
  validateVarPair,
} from "./templateValidation";
import {
  createEmptyLiveColumnLayout,
  getExcelColumnLabel,
  usePreviewColumnLayout,
  usePreviewPickHandler,
  usePreviewRowWindow,
  usePreviewSelectionInteractions,
  usePreviewSelectionOverlay,
  usePreviewViewportSync,
} from "./templateManagerPreview";

const cloneTemplateConfig = (cfg) => ({
  ...cfg,
  selectedColumns: Array.isArray(cfg?.selectedColumns)
    ? [...cfg.selectedColumns]
    : [],
});

const formatPreviewCell = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return formatNumber(value, { digits: 4 });
  if (typeof value !== "string") return String(value);

  if (!value) return value;
  if (!value.includes("e") && !value.includes("E")) return value;

  const trimmed = value.trim();
  if (!trimmed) return value;

  const num = Number(trimmed);
  if (!Number.isFinite(num)) return value;
  return formatNumber(num, { digits: 4 });
};

const lowerBound = (arr, value) => {
  let lo = 0;
  let hi = Array.isArray(arr) ? arr.length : 0;
  const target = Number(value);
  if (!Number.isFinite(target) || hi === 0) return 0;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (Number(arr[mid]) < target) lo = mid + 1;
    else hi = mid;
  }

  return lo;
};

const noopSubscribe = () => () => {};
const getZero = () => 0;
const EMPTY_ARRAY = [];
const normalizeXDataEndValue = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.toLowerCase() === "end" || raw === "结束") return "End";
  return raw;
};
const toTemplateNameKey = (name) =>
  String(name ?? "")
    .trim()
    .toLowerCase();

const PreviewRow = React.memo(
  ({
    rowIndex,
    rowCellsRaw,
    columnGeometry,
    selectedColumnsSet,
    handleCellMouseDown,
  }) => {
    const rowLabel = rowIndex + 1;
    const rowCells = Array.isArray(rowCellsRaw) ? rowCellsRaw : EMPTY_ARRAY;
    const isRowLoaded = Array.isArray(rowCellsRaw);
    const visibleColumnIndices =
      columnGeometry?.visibleColumnIndices ?? EMPTY_ARRAY;
    const hasLeftColSpacer = Boolean(columnGeometry?.hasLeftSpacer);
    const hasRightColSpacer = Boolean(columnGeometry?.hasRightSpacer);

    return (
      <tr>
        <td className="p-1 h-7 border-b border-r border-border font-mono text-xs text-center select-none bg-bg-surface text-text-secondary w-12 align-middle sticky left-0 z-10">
          {rowLabel}
        </td>
        {hasLeftColSpacer && (
          <td
            aria-hidden="true"
            className="p-0 h-7 border-b border-r border-border bg-transparent"
          />
        )}
        {visibleColumnIndices.map((idx) => {
          const cell = rowCells[idx] ?? "";
          const raw = isRowLoaded ? String(cell) : "";
          const display = isRowLoaded ? formatPreviewCell(cell) : "";
          return (
            <td
              key={idx}
              data-row={rowIndex}
              data-col={idx}
              className={`
                            px-2 py-1 h-7 border-b border-r border-border last:border-r-0 whitespace-nowrap text-xs transition-colors cursor-default overflow-hidden text-ellipsis
                            ${
                              selectedColumnsSet.has(idx)
                                ? "bg-accent/5 border-accent/20 text-text-primary"
                                : "text-text-secondary"
                            }

                          `}
              onMouseDown={handleCellMouseDown}
              title={raw}
            >
              {display}
            </td>
          );
        })}
        {hasRightColSpacer && (
          <td
            aria-hidden="true"
            className="p-0 h-7 border-b border-border bg-transparent"
          />
        )}
      </tr>
    );
  }
);

PreviewRow.displayName = "PreviewRow";

const PreviewTbody = React.memo(
  ({
    subscribePreviewRowsVersion,
    getPreviewRowsVersion,
    previewWindow,
    columnGeometry,
    selectedColumnsSet,
    getPreviewRow,
    handleCellMouseDown,
  }) => {
    const previewRowsSubscribe =
      typeof subscribePreviewRowsVersion === "function"
        ? subscribePreviewRowsVersion
        : noopSubscribe;
    const previewRowsGetSnapshot =
      typeof getPreviewRowsVersion === "function"
        ? getPreviewRowsVersion
        : getZero;
    const previewRenderColCount = columnGeometry?.renderColCount ?? 1;

    useSyncExternalStore(
      previewRowsSubscribe,
      previewRowsGetSnapshot,
      previewRowsGetSnapshot
    );

    const rows = [];
    for (
      let rowIndex = previewWindow.startRow;
      rowIndex < previewWindow.endRow;
      rowIndex++
    ) {
      const rowCellsRaw =
        typeof getPreviewRow === "function" ? getPreviewRow(rowIndex) : null;
      rows.push(
        <PreviewRow
          key={rowIndex}
          rowIndex={rowIndex}
          rowCellsRaw={rowCellsRaw}
          columnGeometry={columnGeometry}
          selectedColumnsSet={selectedColumnsSet}
          handleCellMouseDown={handleCellMouseDown}
        />
      );
    }

    return (
      <tbody>
        {previewWindow.topSpacerHeight > 0 && (
          <tr aria-hidden="true">
            <td
              colSpan={previewRenderColCount}
              className="p-0 border-0"
              style={{ height: previewWindow.topSpacerHeight }}
            />
          </tr>
        )}
        {rows}
        {previewWindow.bottomSpacerHeight > 0 && (
          <tr aria-hidden="true">
            <td
              colSpan={previewRenderColCount}
              className="p-0 border-0"
              style={{ height: previewWindow.bottomSpacerHeight }}
            />
          </tr>
        )}
      </tbody>
    );
  }
);

PreviewTbody.displayName = "PreviewTbody";

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
}) => {
  const { t } = useLanguage();
  const deviceSession = useDeviceAnalysisSession();
  const [templates, setTemplates] = useState([]);
  const [inputSources, setInputSources] = useState({}); // { [fieldName]: 'manual' | 'picked' }
  const didInitConfigFromSettingsRef = useRef(false);

  const [localSelectedTemplateId, setLocalSelectedTemplateId] = useState(null);
  const selectedTemplateId =
    deviceSession?.selectedTemplateId ?? localSelectedTemplateId;
  const setSelectedTemplateId =
    deviceSession?.setSelectedTemplateId ?? setLocalSelectedTemplateId;

  const [localConfig, setLocalConfig] = useState({
    name: "",
    xDataStart: "",
    xDataEnd: "",
    xPoints: "",
    yDataStart: "",
    yDataEnd: "",
    yPoints: "",
    yCount: "",
    yStep: "",
    stopOnError: false,
    bottomTitle: "",
    leftTitle: "",
    legendPrefix: "",
    fileNameVgKeywords: "",
    fileNameVdKeywords: "",
    selectedColumns: [], // Array of indices
  });
  const config = deviceSession?.templateConfig ?? localConfig;
  const setConfig = deviceSession?.setTemplateConfig ?? setLocalConfig;

  const [toast, setToast] = useState({
    isVisible: false,
    message: "",
    type: "success",
  });

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [localTemplateMode, setLocalTemplateMode] = useState("select"); // "select" | "save"
  const templateMode = deviceSession?.templateMode ?? localTemplateMode;
  const setTemplateMode =
    deviceSession?.setTemplateMode ?? setLocalTemplateMode;
  const saveDraftTouchedRef = useRef(false);
  const saveDraftBaseConfigRef = useRef(null);
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);
  const [pendingTemplateMode, setPendingTemplateMode] = useState(null);
  const dropdownRef = useRef(null);
  const isSelectMode = templateMode === "select";
  const leftPanelRef = useRef(null);
  const basePanelRef = useRef(null);
  const selectPanelMeasureRef = useRef(null);
  const savePanelMeasureRef = useRef(null);
  const [panelMinHeightPx, setPanelMinHeightPx] = useState(null);
  const minHeightRafRef = useRef(0);
  const basePanelMaxHeightRef = useRef(0);
  const lastPanelWidthRef = useRef(0);

  useLayoutEffect(() => {
    const panelEl = leftPanelRef.current;
    const baseEl = basePanelRef.current;
    const selectEl = selectPanelMeasureRef.current;
    const saveEl = savePanelMeasureRef.current;
    if (!panelEl || !baseEl || !selectEl || !saveEl) return;

    const SAVE_PANEL_GAP_PX = 16; // matches `space-y-4`

    const measureNow = () => {
      const panelWidth = panelEl.getBoundingClientRect().width;
      if (Math.abs(panelWidth - lastPanelWidthRef.current) > 1) {
        lastPanelWidthRef.current = panelWidth;
        basePanelMaxHeightRef.current = 0;
      }

      const panelStyles = window.getComputedStyle(panelEl);
      const panelPaddingY =
        (Number.parseFloat(panelStyles.paddingTop) || 0) +
        (Number.parseFloat(panelStyles.paddingBottom) || 0);
      const baseHeightRaw = baseEl.getBoundingClientRect().height;
      const baseHeight = Math.max(basePanelMaxHeightRef.current, baseHeightRaw);
      basePanelMaxHeightRef.current = baseHeight;
      const selectHeight = selectEl.getBoundingClientRect().height;
      const saveHeight = saveEl.getBoundingClientRect().height;
      const paneHeight = Math.max(selectHeight, saveHeight);
      const next = Math.ceil(
        panelPaddingY + baseHeight + SAVE_PANEL_GAP_PX + paneHeight
      );
      setPanelMinHeightPx((prev) => (prev === next ? prev : next));
    };

    const scheduleMeasure = () => {
      if (minHeightRafRef.current) return;
      minHeightRafRef.current = window.requestAnimationFrame(() => {
        minHeightRafRef.current = 0;
        measureNow();
      });
    };

    scheduleMeasure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", scheduleMeasure);
      return () => {
        window.removeEventListener("resize", scheduleMeasure);
        if (minHeightRafRef.current) {
          window.cancelAnimationFrame(minHeightRafRef.current);
          minHeightRafRef.current = 0;
        }
      };
    }

    const ro = new ResizeObserver(() => scheduleMeasure());
    ro.observe(panelEl);
    ro.observe(baseEl);
    ro.observe(selectEl);
    ro.observe(saveEl);
    return () => {
      ro.disconnect();
      if (minHeightRafRef.current) {
        window.cancelAnimationFrame(minHeightRafRef.current);
        minHeightRafRef.current = 0;
      }
    };
  }, []);

  useEffect(() => {
    if (didInitConfigFromSettingsRef.current) return;
    if (!deviceAnalysisSettings) return;
    didInitConfigFromSettingsRef.current = true;

    const nextStopOnError = Boolean(deviceAnalysisSettings?.stopOnErrorDefault);
    setConfig((prev) => ({ ...prev, stopOnError: nextStopOnError }));
  }, [deviceAnalysisSettings, setConfig]);

  const showToast = useCallback((message, type = "warning") => {
    setToast({ isVisible: true, message, type });
  }, []);

  const closeToast = useCallback(() => {
    setToast((prev) => ({ ...prev, isVisible: false }));
  }, []);

  const varPairValidation = validateVarPair(
    config?.bottomTitle,
    config?.legendPrefix,
    t
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

  const markFieldSource = useCallback((field, source) => {
    if (!field || (source !== "manual" && source !== "picked")) return;
    setInputSources((prev) => ({ ...(prev || {}), [field]: source }));
  }, []);

  const writeFieldFromPreview = useCallback(
    (field, value) => {
      setConfig((prev) => ({ ...prev, [field]: value }));
      markFieldSource(field, "picked");
    },
    [markFieldSource, setConfig]
  );

  useEffect(() => {
    let cancelled = false;

    const loadTemplates = async () => {
      try {
        const remote = await apiService.getDeviceAnalysisTemplates();
        if (cancelled) return;

        const remoteTemplates = Array.isArray(remote) ? remote : [];
        setTemplates(remoteTemplates);
      } catch (err) {
        if (!cancelled) {
          showToast(
            t("da_loadTemplatesFailed", {
              error: err?.message || t("unknownError"),
            })
          );
        }
      }
    };

    loadTemplates();
    return () => {
      cancelled = true;
    };
  }, [showToast, t]);

  const [selections, setSelections] = useState([]);
  const gridRef = useRef(null);
  const previewScrollRef = useRef(null);
  const previewTableRef = useRef(null);
  const dragOverlayRef = useRef(null);
  const containerRef = useRef(null);
  // Intentionally no persistent "last template" storage; session is memory-only.

  const PREVIEW_ROW_HEIGHT_PX = 28; // tailwind h-7 ~= 28px
  const PREVIEW_OVERSCAN_ROWS = 12;
  const PREVIEW_ROW_INDEX_COL_PX = 48;
  const PREVIEW_COL_MIN_PX = 120;
  const PREVIEW_COL_MAX_PX = 420;
  const PREVIEW_COL_CHAR_PX = 7;
  const PREVIEW_COL_PADDING_PX = 44;
  const PREVIEW_COL_RESIZE_MIN_PX = 80;
  const PREVIEW_COL_RESIZE_MAX_PX = 800;
  const PREVIEW_COL_OVERSCAN_PX = 240;

  const [isColumnResizing, setIsColumnResizing] = useState(false);

  const [columnWidthOverridesByFile, setColumnWidthOverridesByFile] = useState(
    {}
  );
  const columnResizeRafRef = useRef(0);
  const pendingColumnResizeRef = useRef(null);
  const liveColumnLayoutRef = useRef(createEmptyLiveColumnLayout());

  const {
    handlePreviewScroll,
    previewScrollLeft,
    previewScrollTop,
    previewViewportHeight,
    previewViewportWidth,
  } = usePreviewViewportSync({
    previewFileColumnCount: previewFile?.columnCount,
    previewFileId: previewFile?.fileId,
    previewFileRowCount: previewFile?.rowCount,
    previewScrollRef,
    previewStatusState: previewStatus?.state,
  });

  const handlePreviewPick = usePreviewPickHandler({
    containerRef,
    writeFieldFromPreview,
  });

  useEffect(() => {
    return () => {
      if (columnResizeRafRef.current) {
        cancelAnimationFrame(columnResizeRafRef.current);
      }
    };
  }, []);

  const handleSaveTemplate = async () => {
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
            (t) =>
              t?.id !== saved?.id && toTemplateNameKey(t?.name) !== savedNameKey
          ),
        ];
      });
      loadTemplate(saved);
      showToast(t("da_template_saved"), "success");
      setTemplateMode("select");
    } catch (err) {
      showToast(err.message || "Failed to save template", "warning");
    }
  };

  const handleDeleteTemplate = async (id) => {
    try {
      await apiService.deleteDeviceAnalysisTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (selectedTemplateId === id) {
        setSelectedTemplateId(null);
        if (typeof onUpdateDeviceAnalysisSettings === "function") {
          void onUpdateDeviceAnalysisSettings({ lastTemplateId: null });
        }
      }
    } catch (err) {
      showToast(err.message || "Failed to delete template", "warning");
    }
  };

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
    [onUpdateDeviceAnalysisSettings, setConfig, setSelectedTemplateId]
  );

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
      ? templates.find((t) => t?.id === selectedTemplateId)
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

  // No auto-load from browser storage.

  useEffect(() => {
    if (!isSelectMode) return;
    const lastId = deviceAnalysisSettings?.lastTemplateId;
    if (!lastId) return;
    if (!Array.isArray(templates) || templates.length === 0) return;
    if (selectedTemplateId) return;

    const found = templates.find((t) => t?.id === lastId);
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

  const applyWithHandler = (handler) => {
    if (typeof handler !== "function") return;

    const validation = validateTemplateForApply(config, t);
    if (!validation.ok) {
      showToast(validation.message || "Invalid configuration", "warning");
      return;
    }

    // Keep UI state in sync (e.g. when user types "a1" we store "A1").
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
  };

  const applyConfiguration = () => applyWithHandler(onTemplateApplied);
  const applyNewFilesConfiguration = () =>
    applyWithHandler(onTemplateAppliedIncremental);

  const columnCount = useMemo(() => {
    if (Number.isFinite(previewFile?.columnCount))
      return previewFile.columnCount;

    const maxLens = Array.isArray(previewFile?.maxCellLengths)
      ? previewFile.maxCellLengths
      : [];
    if (maxLens.length) return maxLens.length;

    return 0;
  }, [previewFile]);

  const selectedColumnsSet = useMemo(
    () => new Set(config.selectedColumns),
    [config.selectedColumns]
  );

  const clampNumber = (value, min, max) => {
    return Math.min(max, Math.max(min, value));
  };

  const autoColumnWidthsPx = useMemo(() => {
    const maxLens = Array.isArray(previewFile?.maxCellLengths)
      ? previewFile.maxCellLengths
      : [];

    const count = Number.isFinite(previewFile?.columnCount)
      ? previewFile.columnCount
      : maxLens.length;

    const widths = new Array(count);
    for (let i = 0; i < count; i++) {
      const maxLen = Number(maxLens[i]) || 0;
      const estimated = maxLen * PREVIEW_COL_CHAR_PX + PREVIEW_COL_PADDING_PX;
      const base = maxLen > 0 ? estimated : 160;
      widths[i] = clampNumber(base, PREVIEW_COL_MIN_PX, PREVIEW_COL_MAX_PX);
    }
    return widths;
  }, [previewFile]);

  const {
    previewColumnGeometry,
    getColumnWidthPx,
    initLiveColumnLayout,
    applyColumnWidthToDom,
  } = usePreviewColumnLayout({
    autoColumnWidthsPx,
    columnCount,
    columnWidthOverridesByFile,
    liveColumnLayoutRef,
    minColumnWidthPx: PREVIEW_COL_MIN_PX,
    overscanPx: PREVIEW_COL_OVERSCAN_PX,
    previewFileId: previewFile?.fileId,
    previewScrollLeft,
    previewTableRef,
    previewViewportWidth,
    resizeMaxWidthPx: PREVIEW_COL_RESIZE_MAX_PX,
    resizeMinWidthPx: PREVIEW_COL_RESIZE_MIN_PX,
    rowIndexWidthPx: PREVIEW_ROW_INDEX_COL_PX,
  });

  const flushPendingColumnResize = () => {
    const pending = pendingColumnResizeRef.current;
    pendingColumnResizeRef.current = null;
    if (!pending) return null;
    applyColumnWidthToDom(pending.fileId, pending.colIndex, pending.width);
    return pending;
  };

  const scheduleColumnResizeDomUpdate = (fileId, colIndex, width) => {
    pendingColumnResizeRef.current = { fileId, colIndex, width };
    if (columnResizeRafRef.current) return;

    columnResizeRafRef.current = requestAnimationFrame(() => {
      columnResizeRafRef.current = 0;
      flushPendingColumnResize();
    });
  };

  const resetColumnWidth = (fileId, colIndex) => {
    const auto = autoColumnWidthsPx[colIndex] ?? PREVIEW_COL_MIN_PX;
    applyColumnWidthToDom(fileId, colIndex, auto);

    setColumnWidthOverridesByFile((prev) => {
      const existing = prev[fileId];
      if (!existing || !(colIndex in existing)) return prev;

      const nextForFile = { ...existing };
      delete nextForFile[colIndex];
      return { ...prev, [fileId]: nextForFile };
    });
  };

  const handleColumnResizeStart = (event, colIndex) => {
    const fileId = previewFile?.fileId;
    if (!fileId) return;

    event.preventDefault();
    event.stopPropagation();

    const resizerEl = event.currentTarget;
    const pointerId = event.pointerId;

    if (resizerEl?.setPointerCapture && Number.isFinite(pointerId)) {
      try {
        resizerEl.setPointerCapture(pointerId);
      } catch {
        // ignore
      }
    }

    setIsColumnResizing(true);

    initLiveColumnLayout(fileId);

    const startX = event.clientX;
    const startWidthRaw = Number(
      liveColumnLayoutRef.current?.widths?.[colIndex]
    );
    const startWidth = Number.isFinite(startWidthRaw)
      ? startWidthRaw
      : getColumnWidthPx(colIndex);

    const handleMove = (moveEvent) => {
      if (Number.isFinite(pointerId) && moveEvent.pointerId !== pointerId)
        return;
      const delta = moveEvent.clientX - startX;
      scheduleColumnResizeDomUpdate(fileId, colIndex, startWidth + delta);
    };

    const cleanup = () => {
      flushPendingColumnResize();

      const live = liveColumnLayoutRef.current;
      const finalWidth =
        live?.fileId === fileId ? Number(live?.widths?.[colIndex]) : null;

      if (Number.isFinite(finalWidth) && finalWidth > 0) {
        setColumnWidthOverridesByFile((prev) => {
          const existing = prev[fileId] ?? {};
          const nextForFile = { ...existing, [colIndex]: finalWidth };
          return { ...prev, [fileId]: nextForFile };
        });
      }

      pendingColumnResizeRef.current = null;
      if (columnResizeRafRef.current) {
        cancelAnimationFrame(columnResizeRafRef.current);
        columnResizeRafRef.current = 0;
      }

      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
      window.removeEventListener("blur", cleanup);

      setIsColumnResizing(false);

      if (resizerEl?.releasePointerCapture && Number.isFinite(pointerId)) {
        try {
          resizerEl.releasePointerCapture(pointerId);
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener("pointermove", handleMove, { passive: true });
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
    window.addEventListener("blur", cleanup);
  };

  const previewWindow = usePreviewRowWindow({
    ensurePreviewRows,
    overscanRows: PREVIEW_OVERSCAN_ROWS,
    previewFileId: previewFile?.fileId,
    previewRowCount: previewFile?.rowCount,
    previewScrollTop,
    previewViewportHeight,
    rowHeightPx: PREVIEW_ROW_HEIGHT_PX,
  });

  const toggleColumn = (index) => {
    setConfig((prev) => {
      const isSelected = prev.selectedColumns.includes(index);
      if (isSelected) {
        return {
          ...prev,
          selectedColumns: prev.selectedColumns.filter((i) => i !== index),
        };
      }

      return {
        ...prev,
        selectedColumns: [...prev.selectedColumns, index],
      };
    });
  };

  const { selectionRects, hideDragOverlay, renderDragOverlay } =
    usePreviewSelectionOverlay({
      dragOverlayRef,
      gridRef,
      previewColumnGeometry,
      previewFileId: previewFile?.fileId,
      previewTableRef,
      previewWindow,
      rowHeightPx: PREVIEW_ROW_HEIGHT_PX,
      rowIndexWidthPx: PREVIEW_ROW_INDEX_COL_PX,
      selections,
    });

  const { copySelection, handleCellMouseDown } =
    usePreviewSelectionInteractions({
      ensurePreviewRows,
      getPreviewRow,
      gridRef,
      handlePreviewPick,
      hideDragOverlay,
      previewFileId: previewFile?.fileId,
      renderDragOverlay,
      selections,
      setSelections,
    });
  const renderSavePanel = ({
    includeIds = true,
    selectModeForDisabled = false,
  } = {}) => {
    const saveIsSelectMode = Boolean(selectModeForDisabled);
    const setConfigFromSave = (updater) => {
      saveDraftTouchedRef.current = true;
      setConfig(updater);
    };

    return (
      <div className="space-y-4">
        {/* 1. X Data */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            {t("da_save_x_data_label")}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-4">
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
                name="xPoints"
                value={config.xPoints}
                disabled={saveIsSelectMode}
                onChange={(next) => {
                  setConfigFromSave((prev) => ({ ...prev, xPoints: next }));
                  markFieldSource("xPoints", "manual");
                }}
                placeholder={t("da_save_points")}
                inputClassName="no-spinner"
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
                  value={config.xPoints || config.yPoints}
                  name="yPoints"
                  disabled={saveIsSelectMode || !!config.xPoints}
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

            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-4">
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
            label="Var1"
            value={config.bottomTitle || ""}
            name="bottomTitle"
            disabled={disableVarInputs}
            onChange={(next) => {
              setConfigFromSave((prev) => ({ ...prev, bottomTitle: next }));
              markFieldSource("bottomTitle", "manual");
            }}
            onBlur={toastVarPairIfInvalid}
            placeholder={t("da_save_curve_type")}
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

        {/* 5. Var2 */}
        <div>
          <Input
            id={
              includeIds
                ? "device-analysis-template-var2-legend-prefix"
                : undefined
            }
            label="Var2"
            value={config.legendPrefix || ""}
            name="legendPrefix"
            disabled={disableVarInputs}
            onChange={(next) => {
              setConfigFromSave((prev) => ({ ...prev, legendPrefix: next }));
              markFieldSource("legendPrefix", "manual");
            }}
            onBlur={toastVarPairIfInvalid}
            placeholder={t("da_save_legend")}
          />
        </div>

        {/* 6. Var3 */}
        <div>
          <Input
            id={
              includeIds
                ? "device-analysis-template-var3-left-title"
                : undefined
            }
            label="Var3"
            value={config.leftTitle || ""}
            name="leftTitle"
            onChange={(next) => {
              setConfigFromSave((prev) => ({ ...prev, leftTitle: next }));
              markFieldSource("leftTitle", "manual");
            }}
            placeholder={t("da_save_left_title")}
          />
        </div>
      </div>
    );
  };

  const renderSavePane = ({
    includeIds = true,
    selectModeForDisabled = false,
  } = {}) => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          {t("da_general_template")}
        </label>
        <div className="relative flex-1 min-w-0">
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
      <div className="space-y-4">
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
                    : () => setIsDropdownOpen((prev) => !prev)
                }
                onKeyDown={
                  measureOnly
                    ? undefined
                    : (e) => {
                        if (e.key === "Escape") {
                          setIsDropdownOpen(false);
                          return;
                        }

                        if (
                          e.key === "Enter" ||
                          e.key === " " ||
                          e.key === "ArrowDown"
                        ) {
                          e.preventDefault();
                          setIsDropdownOpen(true);
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
                onClose={() => setIsDropdownOpen(false)}
                anchorRef={dropdownRef}
                id="device-analysis-template-dropdown-menu"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-bg-page cursor-pointer group transition-colors mb-1 text-accent"
                  onClick={() => {
                    setTemplateMode("save");
                    setIsDropdownOpen(false);
                    setSelectedTemplateId(null);
                    if (typeof onUpdateDeviceAnalysisSettings === "function") {
                      void onUpdateDeviceAnalysisSettings({
                        lastTemplateId: null,
                      });
                    }
                    setInputSources({});
                    setConfig({
                      name: "",
                      xDataStart: "",
                      xDataEnd: "",
                      xPoints: "",
                      yDataStart: "",
                      yDataEnd: "",
                      yPoints: "",
                      yCount: "",
                      yStep: "",
                      stopOnError: Boolean(
                        deviceAnalysisSettings?.stopOnErrorDefault
                      ),
                      bottomTitle: "",
                      leftTitle: "",
                      legendPrefix: "",
                      selectedColumns: [],
                    });
                  }}
                >
                  <span className="flex-1 text-sm font-medium">
                    {t("da_new_template")}
                  </span>
                  <span className="p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Plus size={14} />
                  </span>
                </button>
                {templates.length > 0 ? (
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
                          handleDeleteTemplate(template.id);
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

  const renderPreviewPlaceholder = ({ title, hint }) => (
    <div
      id="device-analysis-preview-placeholder"
      className="empty_state_panel flex-1 min-h-0"
    >
      <Avatar icon={FileSpreadsheet} size="lg" variant="empty" />
      {title ? <p className="empty_state_title">{title}</p> : null}
      {hint ? <p className="empty_state_hint">{hint}</p> : null}
    </div>
  );

  return (
    <section
      aria-label={t("da_data_extraction_template")}
      className="flex flex-col flex-1 w-full h-full min-h-0"
    >
      <Card
        ref={containerRef}
        id="device-analysis-template-manager"
        className="p-4 flex flex-col flex-1 min-h-0"
        style={{
          "--da-template-panel-min-h": panelMinHeightPx
            ? `${panelMinHeightPx}px`
            : "0px",
        }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 flex-1 min-h-0">
          {/* Configuration Panel */}
          <div
            ref={leftPanelRef}
            className="lg:col-span-1 rounded-lg flex flex-col min-h-[var(--da-template-panel-min-h)]"
          >
            <div
              className="relative flex flex-col gap-4 flex-1 min-h-0"
              id="device-analysis-template-config-panel-content"
            >
              <div ref={basePanelRef} className="pb-2">
                <div className="flex items-center justify-start gap-3">
                  <Tabs
                    value={templateMode}
                    onChange={(val) => {
                      if (val === templateMode) return;

                      if (templateMode === "save" && val === "select") {
                        if (saveDraftTouchedRef.current) {
                          setPendingTemplateMode(val);
                          setIsDiscardConfirmOpen(true);
                          return;
                        }
                        saveDraftBaseConfigRef.current = null;
                        setTemplateMode(val);
                        return;
                      }

                      if (val === "save") {
                        saveDraftTouchedRef.current = false;
                        saveDraftBaseConfigRef.current =
                          cloneTemplateConfig(config);
                        setIsDropdownOpen(false);
                      }

                      setTemplateMode(val);
                    }}
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
              >
                {renderSelectPane({ includeIds: true, measureOnly: false })}
              </div>

              <div
                id="device-analysis-template-mode-panel-save"
                role="tabpanel"
                aria-labelledby="device-analysis-template-mode-tab-save"
                hidden={templateMode !== "save"}
              >
                {renderSavePane({
                  includeIds: true,
                  selectModeForDisabled: isSelectMode,
                })}
              </div>

              <div
                ref={selectPanelMeasureRef}
                aria-hidden="true"
                className="absolute left-0 top-0 w-full invisible pointer-events-none"
              >
                {renderSelectPane({ includeIds: false, measureOnly: true })}
              </div>

              <div
                ref={savePanelMeasureRef}
                aria-hidden="true"
                className="absolute left-0 top-0 w-full invisible pointer-events-none"
              >
                {renderSavePane({ includeIds: false })}
              </div>
            </div>
          </div>

          {/* Preview Panel */}
          <div className="lg:col-span-3 bg-bg-page rounded-lg p-4 overflow-hidden flex flex-col min-h-0 lg:min-h-[var(--da-template-panel-min-h)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-text-secondary">
                {t("da_preview_filename_label")}:{" "}
                {previewFile
                  ? String(previewFile.fileName || "").replace(/\.csv$/i, "")
                  : ""}
              </span>
              {previewStatus?.state === "loading" ? (
                <span className="text-xs text-text-secondary">
                  {previewStatus.message || "Loading preview..."}
                </span>
              ) : previewStatus?.state === "error" ? (
                <span className="text-xs text-red-500">
                  {previewStatus.message || "Preview failed to load"}
                </span>
              ) : null}
              <div className="flex items-center gap-2">
                <button
                  id="device-analysis-preview-copy-selection"
                  type="button"
                  onClick={copySelection}
                  disabled={selections.length === 0}
                  className="p-1.5 rounded-md border border-border bg-bg-surface hover:bg-bg-page text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors"
                  title="Copy selection as TSV"
                >
                  <Copy size={14} />
                </button>
              </div>
            </div>

            {previewStatus?.state === "loading" ? (
              renderPreviewPlaceholder({
                title: previewStatus.message || t("da_preview_loading"),
                hint: t("da_preview_loading_hint"),
              })
            ) : previewStatus?.state === "error" ? (
              renderPreviewPlaceholder({
                title: previewStatus.message || t("da_preview_error"),
                hint: t("da_preview_error_hint"),
              })
            ) : previewFile ? (
              <div
                ref={previewScrollRef}
                onScroll={(e) =>
                  handlePreviewScroll(
                    e.currentTarget.scrollTop,
                    e.currentTarget.scrollLeft
                  )
                }
                className={`flex-1 min-h-0 overflow-auto border border-border rounded custom-scrollbar ${
                  isColumnResizing ? "cursor-col-resize select-none" : ""
                }`}
              >
                <div
                  ref={gridRef}
                  className="relative min-w-full align-top select-none"
                >
                  <div className="absolute inset-0 pointer-events-none z-20">
                    {selectionRects.map((selection) => {
                      const rect = selection.rect;
                      return (
                        <div
                          key={selection.id}
                          className="absolute border border-accent bg-accent/5 z-10"
                          style={{
                            left: rect.left,
                            top: rect.top,
                            width: rect.width,
                            height: rect.height,
                          }}
                        />
                      );
                    })}
                    <div
                      ref={dragOverlayRef}
                      className="absolute border border-accent bg-accent/5 z-20"
                      style={{ display: "none" }}
                    />
                  </div>

                  <table
                    ref={previewTableRef}
                    className="text-sm text-left relative border-separate border-spacing-0 z-10 table-fixed"
                    style={{
                      width: `var(--da-preview-table-width, ${previewColumnGeometry.tableWidthPx}px)`,
                      tableLayout: "fixed",
                    }}
                  >
                    <colgroup>
                      <col style={{ width: PREVIEW_ROW_INDEX_COL_PX }} />
                      {previewColumnGeometry.hasLeftSpacer && (
                        <col
                          style={{
                            width: previewColumnGeometry.window.leftSpacerPx,
                          }}
                        />
                      )}
                      {previewColumnGeometry.visibleColumnIndices.map((idx) => (
                        <col
                          key={idx}
                          style={{
                            width: `var(--da-preview-col-${idx}-w, ${
                              previewColumnGeometry.widthsPx[idx] ??
                              PREVIEW_COL_MIN_PX
                            }px)`,
                          }}
                        />
                      ))}
                      {previewColumnGeometry.hasRightSpacer && (
                        <col
                          style={{
                            width: previewColumnGeometry.window.rightSpacerPx,
                          }}
                        />
                      )}
                    </colgroup>
                    <thead className="bg-bg-surface sticky top-0 z-30 shadow-sm">
                      <tr>
                        <th className="p-1 border-b border-r border-border bg-bg-surface w-12 text-center font-bold text-xs text-text-secondary select-none sticky left-0 top-0 z-40"></th>
                        {previewColumnGeometry.hasLeftSpacer && (
                          <th
                            aria-hidden="true"
                            className="p-0 border-b border-r border-border bg-bg-surface"
                          />
                        )}
                        {previewColumnGeometry.visibleColumnIndices.map(
                          (idx) => {
                            const isSelected = selectedColumnsSet.has(idx);
                            return (
                              <th
                                key={idx}
                                onClick={() => toggleColumn(idx)}
                                className={`px-2 py-1 border-b border-border border-r last:border-r-0 font-mono text-xs whitespace-nowrap bg-bg-surface font-semibold text-center select-none cursor-pointer relative pr-3 overflow-hidden ${
                                  isSelected
                                    ? "text-accent bg-accent/10 border-accent/30"
                                    : "text-text-secondary hover:bg-bg-page/60"
                                }`}
                                title="Click to toggle Y column"
                              >
                                <div
                                  className="flex items-center justify-center gap-2 cursor-pointer group"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleColumn(idx);
                                  }}
                                >
                                  <div className="relative flex items-center justify-center w-4 h-4">
                                    {isSelected ? (
                                      <div className="w-3.5 h-3.5 rounded bg-accent-terracotta border border-accent-terracotta flex items-center justify-center transition-all">
                                        <Check
                                          size={10}
                                          className="text-white"
                                          strokeWidth={4}
                                        />
                                      </div>
                                    ) : (
                                      <div className="w-3.5 h-3.5 rounded border border-border-200 group-hover:border-accent-terracotta/50 transition-colors bg-bg-surface" />
                                    )}
                                  </div>
                                  <span>{getExcelColumnLabel(idx)}</span>
                                </div>
                                <div
                                  role="separator"
                                  aria-orientation="vertical"
                                  title="Drag to resize • Double-click to reset"
                                  onPointerDown={(e) =>
                                    handleColumnResizeStart(e, idx)
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                  onDoubleClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (!previewFile?.fileId) return;
                                    resetColumnWidth(previewFile.fileId, idx);
                                  }}
                                  className="absolute top-0 right-0 h-full w-3 cursor-col-resize select-none hover:bg-accent/20 touch-none"
                                />
                              </th>
                            );
                          }
                        )}
                        {previewColumnGeometry.hasRightSpacer && (
                          <th
                            aria-hidden="true"
                            className="p-0 border-b border-border bg-bg-surface"
                          />
                        )}
                      </tr>
                    </thead>
                    <PreviewTbody
                      subscribePreviewRowsVersion={subscribePreviewRowsVersion}
                      getPreviewRowsVersion={getPreviewRowsVersion}
                      previewWindow={previewWindow}
                      columnGeometry={previewColumnGeometry}
                      selectedColumnsSet={selectedColumnsSet}
                      getPreviewRow={getPreviewRow}
                      handleCellMouseDown={handleCellMouseDown}
                    />
                  </table>
                </div>
              </div>
            ) : (
              renderPreviewPlaceholder({
                hint: t("da_preview_select_file_hint"),
              })
            )}
          </div>
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
