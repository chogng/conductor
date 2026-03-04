import React, {
  startTransition,
  useCallback,
  useContext,
  useMemo,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  BarChart2,
  Upload,
  RefreshCw,
} from "lucide-react";
import Papa from "papaparse";
import JSZip from "jszip";
import CsvImporter from "../features/device-analysis/components/CsvImporter";
import TemplateManager from "../features/device-analysis/components/TemplateManager";
import AnalysisCharts from "../features/device-analysis/components/AnalysisCharts";
import DesktopCommandBar from "../features/device-analysis/components/DesktopCommandBar";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import {
  classifySsFit,
  computeSubthresholdSwing,
  computeSubthresholdSwingFitAuto,
  computeSubthresholdSwingFitInIdWindow,
  computeSubthresholdSwingFitInRange,
} from "../features/device-analysis/components/analysisMath";
import { prepareDeviceAnalysisExtraction } from "../features/device-analysis/deviceAnalysisExtractionValidation";
import { useLanguage } from "../hooks/useLanguage";
import { useDeviceAnalysisSession } from "../hooks/useDeviceAnalysisSession";
import { ThemeContext } from "../context/theme-context";
import { apiService } from "../services/apiService";
import {
  DA_PREVIEW_MAX_CACHED_FILES,
  DA_PREVIEW_MAX_CACHED_UI_ROWS_PER_FILE,
  DA_PREVIEW_UI_CHUNK_SIZE_ROWS,
} from "../features/device-analysis/deviceAnalysisPreviewLimits";

const stableStringify = (value) => {
  const seen = new WeakSet();

  const normalize = (input) => {
    if (!input || typeof input !== "object") return input;
    if (seen.has(input)) return null;
    seen.add(input);

    if (Array.isArray(input)) return input.map(normalize);

    const out = {};
    for (const key of Object.keys(input).sort()) {
      out[key] = normalize(input[key]);
    }
    return out;
  };

  return JSON.stringify(normalize(value));
};

const DeviceAnalysis = () => {
  const { t, language, setLanguage } = useLanguage();
  const themeContext = useContext(ThemeContext);
  const theme = themeContext?.theme ?? "system";
  const setTheme = themeContext?.setTheme ?? (() => undefined);
  const desktopMeta =
    typeof window !== "undefined" ? window.desktopMeta ?? null : null;
  const isWindowsDesktopShell =
    desktopMeta?.isDesktop === true && desktopMeta?.platform === "win32";
  const session = useDeviceAnalysisSession();
  const {
    rawData = [],
    setRawData = () => { },
    selectedPreviewFileId = null,
    setSelectedPreviewFileId = () => { },
    processedData = [],
    setProcessedData = () => { },
    extractionErrors = [],
    setExtractionErrors = () => { },
    ssMethod = "auto",
    setSsMethod = () => { },
    ssDiagnosticsEnabled = true,
    setSsDiagnosticsEnabled = () => { },
    ssShowFitLine = true,
    setSsShowFitLine = () => { },
    ssIdWindow = { low: "1e-11", high: "1e-9" },
    setSsIdWindow = () => { },
    ssManualRanges = {},
    setSsManualRanges = () => { },
    previewFile = null,
    setPreviewFile = () => { },
    previewStatus = { state: "idle", message: "" },
    setPreviewStatus = () => { },
    previewWorkerRef = { current: null },
    previewRequestIdRef = { current: 0 },
    previewRowsRequestIdRef = { current: 0 },
    previewRowsRequestsRef = { current: new Map() },
    previewRowsCacheByFileIdRef = { current: new Map() },
    previewLoadedChunksByFileIdRef = { current: new Map() },
    previewRowsCacheRef = { current: new Map() },
    previewLoadedChunksRef = { current: new Set() },
    previewCacheFileIdRef = { current: null },
    previewCacheFileLruRef = { current: new Set() },
  } = session || {};
  const importerRef = useRef(null);
  const [_processingStatus, setProcessingStatus] = useState({
    state: "idle", // 'idle' | 'processing' | 'done' | 'error'
    processed: 0,
    total: 0,
  });
  const [activePage, setActivePage] = useState("data");

  const previewRowsVersionRef = useRef(0);
  const previewRowsSubscribersRef = useRef(new Set());
  const previewRowsNotifyRafRef = useRef(0);

  const getPreviewRowsVersion = useCallback(
    () => previewRowsVersionRef.current,
    [],
  );

  const subscribePreviewRowsVersion = useCallback((callback) => {
    const subs = previewRowsSubscribersRef.current;
    subs.add(callback);
    return () => subs.delete(callback);
  }, []);

  const notifyPreviewRowsVersion = useCallback(() => {
    if (typeof window === "undefined") return;
    if (previewRowsNotifyRafRef.current) return;
    previewRowsNotifyRafRef.current = requestAnimationFrame(() => {
      previewRowsNotifyRafRef.current = 0;
      previewRowsVersionRef.current += 1;
      for (const cb of Array.from(previewRowsSubscribersRef.current)) {
        try {
          cb();
        } catch {
          // ignore subscriber errors
        }
      }
    });
  }, []);

  const PREVIEW_ROW_CHUNK_SIZE = DA_PREVIEW_UI_CHUNK_SIZE_ROWS;

  const processingWorkerRef = useRef(null);
  const processingJobIdRef = useRef(0);
  const processingQueueRef = useRef([]);
  const processingStopOnErrorRef = useRef(false);
  const lastAppliedTemplateConfigFingerprintRef = useRef(null);

  const [deviceAnalysisSettings, setDeviceAnalysisSettings] = useState(null);

  const deferredSelectedPreviewFileId = useDeferredValue(selectedPreviewFileId);
  const rawDataById = useMemo(() => {
    const map = new Map();
    for (const entry of Array.isArray(rawData) ? rawData : []) {
      const id = entry?.fileId;
      if (typeof id !== "string") continue;
      map.set(id, entry);
    }
    return map;
  }, [rawData]);
  const rawDataByIdRef = useRef(new Map());
  useEffect(() => {
    rawDataByIdRef.current = rawDataById;
  }, [rawDataById]);

  const _getExcelColumnLabel = (index) => {
    let label = "";
    let i = index;
    while (i >= 0) {
      label = String.fromCharCode(65 + (i % 26)) + label;
      i = Math.floor(i / 26) - 1;
    }
    return label;
  };

  const cancelPendingPreviewRowRequests = useCallback(() => {
    const pending = previewRowsRequestsRef.current;
    for (const request of pending.values()) {
      try {
        request?.resolve?.([]);
      } catch {
        // ignore
      }
    }
    pending.clear();
  }, [previewRowsRequestsRef]);

  const handlePreviewWorkerMessage = useCallback((event) => {
    const { type, payload } = event.data ?? {};
    if (type === "previewResult") {
      if (payload?.requestId !== previewRequestIdRef.current) return;

      const fileId = payload.fileId ?? null;
      previewCacheFileIdRef.current = fileId;

      if (!fileId) {
        previewRowsCacheRef.current = new Map();
        previewLoadedChunksRef.current = new Set();
        previewCacheFileLruRef.current = new Set();
      } else {
        const cacheByFileId = previewRowsCacheByFileIdRef.current;
        const chunksByFileId = previewLoadedChunksByFileIdRef.current;

        let rowCache = cacheByFileId.get(fileId);
        if (!rowCache) {
          rowCache = new Map();
          cacheByFileId.set(fileId, rowCache);
        }

        let loadedChunks = chunksByFileId.get(fileId);
        if (!loadedChunks) {
          loadedChunks = new Set();
          chunksByFileId.set(fileId, loadedChunks);
        }

        previewRowsCacheRef.current = rowCache;
        previewLoadedChunksRef.current = loadedChunks;

        const fileLru = previewCacheFileLruRef.current;
        fileLru.delete(fileId);
        fileLru.add(fileId);

        while (fileLru.size > DA_PREVIEW_MAX_CACHED_FILES) {
          const oldest = fileLru.values().next().value;
          if (!oldest) break;
          if (oldest === fileId) break;

          fileLru.delete(oldest);
          cacheByFileId.delete(oldest);
          chunksByFileId.delete(oldest);

          const worker = previewWorkerRef.current;
          if (worker) {
            worker.postMessage({
              type: "previewDispose",
              payload: { fileId: oldest },
            });
          }
        }
      }

      startTransition(() => {
        setPreviewFile({
          fileId,
          fileName: payload.fileName,
          rowCount: payload.rowCount,
          columnCount: payload.columnCount,
          maxCellLengths: payload.maxCellLengths,
        });
        setPreviewStatus({ state: "ready", message: "" });
      });
      return;
    }

    if (type === "previewRowsResult") {
      const requestId = payload?.requestId ?? null;
      const pending = previewRowsRequestsRef.current.get(requestId);
      if (!pending) return;
      previewRowsRequestsRef.current.delete(requestId);

      const { resolve, reject } = pending;
      try {
        const fileId = payload?.fileId ?? null;
        const startRow = Number(payload?.startRow) || 0;
        const rows = Array.isArray(payload?.rows) ? payload.rows : [];

        if (fileId && previewCacheFileIdRef.current !== fileId) {
          // Ignore stale rows for an old preview file.
          resolve([]);
          return;
        }

        const cache = previewRowsCacheRef.current;
        for (let i = 0; i < rows.length; i++) {
          cache.set(startRow + i, rows[i]);
        }

        notifyPreviewRowsVersion();
        resolve(rows);
      } catch (err) {
        reject(err);
      }
      return;
    }

    if (type === "workerError") {
      if (
        payload?.requestId !== previewRequestIdRef.current &&
        !previewRowsRequestsRef.current.has(payload?.requestId)
      ) {
        return;
      }

      if (previewRowsRequestsRef.current.has(payload?.requestId)) {
        const pending = previewRowsRequestsRef.current.get(payload?.requestId);
        previewRowsRequestsRef.current.delete(payload?.requestId);
        pending?.reject?.(
          new Error(payload?.message || "Unknown worker error"),
        );
        return;
      }

      console.error("Preview worker error:", payload?.message);
      startTransition(() => {
        setPreviewStatus({
          state: "error",
          message: payload?.message ?? "Preview worker error",
        });
      });
    }
  }, [
    notifyPreviewRowsVersion,
    previewCacheFileIdRef,
    previewCacheFileLruRef,
    previewRowsRequestsRef,
    previewLoadedChunksByFileIdRef,
    previewLoadedChunksRef,
    previewRequestIdRef,
    previewRowsCacheByFileIdRef,
    previewRowsCacheRef,
    previewWorkerRef,
    setPreviewFile,
    setPreviewStatus,
  ]);

  const createPreviewWorker = useCallback(() => {
    const worker = new Worker(
      new URL("../workers/deviceAnalysis.worker.js", import.meta.url),
      { type: "module" },
    );

    worker.onmessage = handlePreviewWorkerMessage;
    previewWorkerRef.current = worker;
    return worker;
  }, [handlePreviewWorkerMessage, previewWorkerRef]);

  const resetPreviewWorker = useCallback(() => {
    cancelPendingPreviewRowRequests("Preview reset");

    if (previewWorkerRef.current) {
      previewWorkerRef.current.terminate();
      previewWorkerRef.current = null;
    }

    createPreviewWorker();
  }, [cancelPendingPreviewRowRequests, createPreviewWorker, previewWorkerRef]);

  useEffect(() => {
    if (previewWorkerRef.current) return;
    createPreviewWorker();
  }, [createPreviewWorker, previewWorkerRef]);

  const resetProcessingWorker = useCallback(() => {
    processingJobIdRef.current += 1;
    processingQueueRef.current = [];
    processingStopOnErrorRef.current = false;

    if (processingWorkerRef.current) {
      processingWorkerRef.current.terminate();
      processingWorkerRef.current = null;
    }

    setProcessingStatus({
      state: "idle",
      processed: 0,
      total: 0,
    });
  }, []);

  const hasSessionData =
    rawData.length > 0 ||
    processedData.length > 0 ||
    extractionErrors.length > 0 ||
    previewFile !== null;

  const handleClearSession = useCallback(() => {
    if (!hasSessionData) return;

    resetProcessingWorker();

    // Invalidate in-flight preview metadata requests.
    previewRequestIdRef.current += 1;
    cancelPendingPreviewRowRequests("Preview cleared");

    setPreviewFile(null);
    setPreviewStatus({ state: "idle", message: "" });

    previewRowsCacheByFileIdRef.current = new Map();
    previewLoadedChunksByFileIdRef.current = new Map();
    previewRowsCacheRef.current = new Map();
    previewLoadedChunksRef.current = new Set();
    previewCacheFileIdRef.current = null;
    previewCacheFileLruRef.current = new Set();
    if (previewRowsNotifyRafRef.current) {
      cancelAnimationFrame(previewRowsNotifyRafRef.current);
      previewRowsNotifyRafRef.current = 0;
    }
    notifyPreviewRowsVersion();

    setProcessedData([]);
    setExtractionErrors([]);
    setSelectedPreviewFileId(null);
    setRawData([]);
    setSsManualRanges({});

    // Drop all preview caches held inside the worker (and cancel any parsing).
    resetPreviewWorker();
  }, [
    cancelPendingPreviewRowRequests,
    hasSessionData,
    notifyPreviewRowsVersion,
    previewCacheFileIdRef,
    previewCacheFileLruRef,
    previewLoadedChunksByFileIdRef,
    previewLoadedChunksRef,
    previewRequestIdRef,
    previewRowsCacheByFileIdRef,
    previewRowsCacheRef,
    resetPreviewWorker,
    resetProcessingWorker,
    setExtractionErrors,
    setProcessedData,
    setPreviewFile,
    setPreviewStatus,
    setRawData,
    setSelectedPreviewFileId,
    setSsManualRanges,
  ]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const settings = await apiService.getDeviceAnalysisSettings();
        if (cancelled) return;

        setDeviceAnalysisSettings(settings ?? null);

        const method = settings?.ssMethodDefault;
        if (
          method === "auto" ||
          method === "manual" ||
          method === "idWindow" ||
          method === "legacy"
        ) {
          setSsMethod(method);
        }

        if (typeof settings?.ssDiagnosticsEnabled === "boolean") {
          setSsDiagnosticsEnabled(settings.ssDiagnosticsEnabled);
        }

        const low = Number(settings?.ssIdLow);
        const high = Number(settings?.ssIdHigh);
        if (Number.isFinite(low) && Number.isFinite(high) && low > 0 && high > 0) {
          setSsIdWindow({ low: String(low), high: String(high) });
        }
      } catch {
        // ignore settings load failures
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setSsDiagnosticsEnabled, setSsIdWindow, setSsMethod]);

  const handleUpdateDeviceAnalysisSettings = useCallback(
    async (updates) => {
      const patch = updates && typeof updates === "object" ? updates : null;
      if (!patch) return null;

      const updated = await apiService.updateDeviceAnalysisSettings(patch);
      setDeviceAnalysisSettings((prev) => ({ ...(prev || {}), ...(updated || {}) }));
      return updated;
    },
    [setDeviceAnalysisSettings],
  );



  useEffect(() => {
    return () => {
      if (processingWorkerRef.current) {
        processingWorkerRef.current.terminate();
        processingWorkerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!rawData.length) {
      previewRequestIdRef.current += 1;
      cancelPendingPreviewRowRequests("Preview cleared");
      setPreviewFile(null);
      setPreviewStatus({ state: "idle", message: "" });
      setSelectedPreviewFileId(null);
      previewRowsCacheByFileIdRef.current = new Map();
      previewLoadedChunksByFileIdRef.current = new Map();
      previewRowsCacheRef.current = new Map();
      previewLoadedChunksRef.current = new Set();
      previewCacheFileIdRef.current = null;
      previewCacheFileLruRef.current = new Set();
      if (previewRowsNotifyRafRef.current) {
        cancelAnimationFrame(previewRowsNotifyRafRef.current);
        previewRowsNotifyRafRef.current = 0;
      }
      notifyPreviewRowsVersion();
      return;
    }

    const effectiveFileId =
      deferredSelectedPreviewFileId &&
        rawDataById.has(deferredSelectedPreviewFileId)
        ? deferredSelectedPreviewFileId
        : (rawData[0]?.fileId ?? null);

    const target = rawDataById.get(effectiveFileId) ?? null;
    if (!target?.file || !target?.fileId) return;
    if (previewFile?.fileId === target.fileId) return;

    const worker = previewWorkerRef.current;
    if (!worker) return;

    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;

    startTransition(() => {
      setPreviewStatus({ state: "loading", message: t("da_preview_loading") });
    });

    worker.postMessage({
      type: "preview",
      payload: {
        requestId,
        fileId: target.fileId,
        file: target.file,
        maxPreviewRows: DA_PREVIEW_MAX_CACHED_UI_ROWS_PER_FILE,
      },
    });
  }, [
    deferredSelectedPreviewFileId,
    previewFile?.fileId,
    rawData,
    rawDataById,
    cancelPendingPreviewRowRequests,
    notifyPreviewRowsVersion,
    setSelectedPreviewFileId,
    setPreviewFile,
    setPreviewStatus,
    t,
    previewCacheFileIdRef,
    previewLoadedChunksByFileIdRef,
    previewLoadedChunksRef,
    previewRequestIdRef,
    previewRowsCacheByFileIdRef,
    previewRowsCacheRef,
    previewWorkerRef,
    previewCacheFileLruRef,
  ]);

  const getPreviewRow = useCallback((rowIndex) => {
    const idx = Number(rowIndex);
    if (!Number.isInteger(idx) || idx < 0) return null;
    return previewRowsCacheRef.current.get(idx) ?? null;
  }, [previewRowsCacheRef]);

  const requestPreviewRowsRange = useCallback((fileId, startRow, endRow) => {
    const worker = previewWorkerRef.current;
    if (!worker || !fileId) return Promise.resolve([]);

    const requestId = previewRowsRequestIdRef.current + 1;
    previewRowsRequestIdRef.current = requestId;

    const start = Math.max(0, Math.floor(Number(startRow) || 0));
    const end = Math.max(start, Math.floor(Number(endRow) || start));

    return new Promise((resolve, reject) => {
      previewRowsRequestsRef.current.set(requestId, { resolve, reject });
      worker.postMessage({
        type: "previewRows",
        payload: {
          requestId,
          fileId,
          startRow: start,
          endRow: end,
        },
      });
    });
  }, [previewRowsRequestIdRef, previewRowsRequestsRef, previewWorkerRef]);

  const ensurePreviewRows = useCallback(
    async (fileId, startRow, endRow) => {
      if (!previewFile?.rowCount || !Number.isFinite(previewFile.rowCount))
        return;
      if (!fileId) return;

      const totalRows = Math.max(0, Math.floor(previewFile.rowCount));
      const start = Math.max(0, Math.min(totalRows, Math.floor(startRow || 0)));
      const end = Math.max(start, Math.min(totalRows, Math.floor(endRow || 0)));
      if (start >= end) return;

      const firstChunkStart =
        Math.floor(start / PREVIEW_ROW_CHUNK_SIZE) * PREVIEW_ROW_CHUNK_SIZE;
      const lastChunkStart =
        Math.floor((end - 1) / PREVIEW_ROW_CHUNK_SIZE) * PREVIEW_ROW_CHUNK_SIZE;

      const promises = [];
      for (
        let chunkStart = firstChunkStart;
        chunkStart <= lastChunkStart;
        chunkStart += PREVIEW_ROW_CHUNK_SIZE
      ) {
        if (previewLoadedChunksRef.current.has(chunkStart)) continue;
        previewLoadedChunksRef.current.delete(chunkStart);
        previewLoadedChunksRef.current.add(chunkStart);

        const maxChunks = Math.max(
          1,
          Math.ceil(DA_PREVIEW_MAX_CACHED_UI_ROWS_PER_FILE / PREVIEW_ROW_CHUNK_SIZE),
        );
        while (previewLoadedChunksRef.current.size > maxChunks) {
          const evictChunkStart = previewLoadedChunksRef.current.values().next().value;
          if (evictChunkStart === undefined) break;
          previewLoadedChunksRef.current.delete(evictChunkStart);
          for (let r = evictChunkStart; r < evictChunkStart + PREVIEW_ROW_CHUNK_SIZE; r++) {
            previewRowsCacheRef.current.delete(r);
          }
        }

        const chunkEnd = Math.min(
          totalRows,
          chunkStart + PREVIEW_ROW_CHUNK_SIZE,
        );
        const promise = requestPreviewRowsRange(
          fileId,
          chunkStart,
          chunkEnd,
        ).catch((err) => {
          previewLoadedChunksRef.current.delete(chunkStart);
          throw err;
        });
        promises.push(promise);
      }

      if (!promises.length) return;
      await Promise.all(promises);
    },
    [PREVIEW_ROW_CHUNK_SIZE, previewFile, previewLoadedChunksRef, previewRowsCacheRef, requestPreviewRowsRange],
  );

  // Handler when CSV is imported
  const handleDataImported = (fileInfo) => {
    setRawData((prev) => [...prev, fileInfo]);
    if (fileInfo?.fileId) setSelectedPreviewFileId(fileInfo.fileId);
  };

  const handleDataRemoved = (fileId) => {
    const removedFileName =
      rawData.find((f) => f.fileId === fileId)?.fileName ?? null;

    if (selectedPreviewFileId === fileId) {
      const remaining = rawData.filter((f) => f.fileId !== fileId);
      setSelectedPreviewFileId(remaining[0]?.fileId ?? null);
    }

    setRawData((prev) => prev.filter((f) => f.fileId !== fileId));
    setProcessedData((prev) =>
      (Array.isArray(prev) ? prev : []).filter((f) => f?.fileId !== fileId),
    );
    if (removedFileName) {
      setExtractionErrors((prev) =>
        prev.filter((e) => e.fileName !== removedFileName),
      );
    }

    if (_processingStatus.state === "processing") {
      const before = processingQueueRef.current.length;
      processingQueueRef.current = processingQueueRef.current.filter(
        (entry) => entry?.fileId !== fileId,
      );
      const removedCount = before - processingQueueRef.current.length;
      if (removedCount > 0) {
        setProcessingStatus((prev) => ({
          ...prev,
          total: Math.max(prev.processed, prev.total - removedCount),
        }));
      }
    }
    if (previewFile?.fileId === fileId) {
      setPreviewFile(null);
      setPreviewStatus({ state: "idle", message: "" });
    }

    previewRowsCacheByFileIdRef.current.delete(fileId);
    previewLoadedChunksByFileIdRef.current.delete(fileId);
    previewCacheFileLruRef.current.delete(fileId);
    if (previewCacheFileIdRef.current === fileId) {
      previewCacheFileIdRef.current = null;
      previewRowsCacheRef.current = new Map();
      previewLoadedChunksRef.current = new Set();
      if (previewRowsNotifyRafRef.current) {
        cancelAnimationFrame(previewRowsNotifyRafRef.current);
        previewRowsNotifyRafRef.current = 0;
      }
      notifyPreviewRowsVersion();
    }

    const worker = previewWorkerRef.current;
    if (worker) {
      worker.postMessage({
        type: "previewDispose",
        payload: { fileId },
      });
    }
  };

  const handlePreviewFileSelected = useCallback(
    (fileId) => {
      const next = typeof fileId === "string" ? fileId : null;
      if (!next) return;
      if (!rawDataById.has(next)) return;
      setSelectedPreviewFileId(next);
    },
    [rawDataById, setSelectedPreviewFileId],
  );

  // Handler when template is applied
  const startExtractionJob = useCallback(
    ({
      queue,
      extractionConfig,
      stopOnError,
      resetProcessedData,
      resetExtractionErrors,
    }) => {
      if (!Array.isArray(queue) || queue.length === 0) return;
      const workQueue = [...queue];

      if (resetProcessedData) setProcessedData([]);
      if (resetExtractionErrors) setExtractionErrors([]);
      processingStopOnErrorRef.current = Boolean(stopOnError);

      processingJobIdRef.current += 1;
      const jobId = processingJobIdRef.current;

      if (processingWorkerRef.current) {
        processingWorkerRef.current.terminate();
        processingWorkerRef.current = null;
      }

      const worker = new Worker(
        new URL("../workers/deviceAnalysis.worker.js", import.meta.url),
        { type: "module" },
      );
      processingWorkerRef.current = worker;

      processingQueueRef.current = workQueue;
      setProcessingStatus({
        state: "processing",
        processed: 0,
        total: workQueue.length,
      });

      const processNext = () => {
        const next = processingQueueRef.current.shift();
        if (!next) {
          setProcessingStatus((prev) => ({ ...prev, state: "done" }));
          worker.terminate();
          if (processingWorkerRef.current === worker) {
            processingWorkerRef.current = null;
          }
          return;
        }

        worker.postMessage({
          type: "processFile",
          payload: {
            jobId,
            fileId: next.fileId,
            fileName: next.fileName,
            file: next.file,
            config: extractionConfig,
            maxPoints: 600,
          },
        });
      };

      worker.onmessage = (event) => {
        const { type, payload } = event.data ?? {};

        if (type === "processResult") {
          if (payload?.jobId !== jobId) return;
          const nextProcessed = payload?.processed;
          const nextFileId = nextProcessed?.fileId;
          if (nextFileId && !rawDataByIdRef.current.has(nextFileId)) {
            // The user removed this CSV while it was being processed; don't re-add it.
            setProcessingStatus((prev) => ({
              ...prev,
              processed: prev.processed + 1,
            }));
            processNext();
            return;
          }

          setProcessedData((prev) => [...prev, nextProcessed]);
          setProcessingStatus((prev) => ({
            ...prev,
            processed: prev.processed + 1,
          }));
          processNext();
          return;
        }

        if (type === "workerError") {
          if (payload?.jobId !== jobId) return;
          const errFileName = payload?.fileName ?? "Unknown file";
          const errMessage = payload?.message ?? "Unknown error";
          setExtractionErrors((prev) => [
            ...prev,
            { fileName: errFileName, message: errMessage },
          ]);
          setProcessingStatus((prev) => ({
            ...prev,
            processed: prev.processed + 1,
          }));

          if (processingStopOnErrorRef.current) {
            setProcessingStatus((prev) => ({ ...prev, state: "error" }));
            worker.terminate();
            if (processingWorkerRef.current === worker) {
              processingWorkerRef.current = null;
            }
            return;
          }

          processNext();
        }
      };

      processNext();
    },
    [setExtractionErrors, setProcessedData, setProcessingStatus],
  );

  const handleTemplateApplied = useCallback((config) => {
    const prepared = prepareDeviceAnalysisExtraction({
      rawData,
      config,
      previewFile,
      getPreviewRow,
      t,
    });

    if (!prepared.ok) return prepared;

    const warnings = Array.isArray(prepared.warnings) ? prepared.warnings : [];
    const extractionConfig = prepared.extractionConfig;
    const meta = prepared.meta ?? {};
    const stopOnError = Boolean(config?.stopOnError);

    const queue = rawData
      .filter((f) => f?.file)
      .map((f) => ({ fileId: f.fileId, fileName: f.fileName, file: f.file }));

    lastAppliedTemplateConfigFingerprintRef.current = stableStringify(config);
    startExtractionJob({
      queue,
      extractionConfig,
      stopOnError,
      resetProcessedData: true,
      resetExtractionErrors: true,
    });

    const groupSizeText = meta.groupSizeCell
      ? t("da_extract_points_from_cell", { cell: meta.pointsRawUpper || "" })
      : t("da_extract_points_fixed", { points: meta.groupSize });

    const groupsText =
      meta.groupSizeCell &&
        Number.isInteger(meta.groupSizePreview) &&
        meta.groupSizePreview > 0
        ? t("da_extract_groups_suffix", {
          groups: Math.max(0, meta.total / meta.groupSizePreview),
        })
        : !meta.groupSizeCell
          ? t("da_extract_groups_suffix", { groups: meta.groups })
          : "";

    const warningText = warnings.length
      ? t("da_extract_warnings_block", { warnings: warnings.join("\n- ") })
      : "";

    return {
      ok: true,
      type: warnings.length ? "warning" : "success",
      message: t("da_extract_started", {
        count: queue.length,
        detail: groupSizeText,
        groups: groupsText,
        warnings: warningText,
      }),
    };
  }, [getPreviewRow, previewFile, rawData, startExtractionJob, t]);

  const handleTemplateAppliedIncremental = useCallback((config) => {
    if (_processingStatus.state === "processing") {
      return {
        ok: false,
        type: "warning",
        message: t("da_apply_to_new_files_busy"),
      };
    }

    const lastFingerprint = lastAppliedTemplateConfigFingerprintRef.current;
    if (!lastFingerprint) {
      return {
        ok: false,
        type: "warning",
        message: t("da_apply_to_new_files_requires_full_apply"),
      };
    }

    if (stableStringify(config) !== lastFingerprint) {
      return {
        ok: false,
        type: "warning",
        message: t("da_apply_to_new_files_requires_same_config"),
      };
    }

    const processedIds = new Set(
      (Array.isArray(processedData) ? processedData : [])
        .map((f) => f?.fileId)
        .filter(Boolean),
    );

    const queue = [];
    const queuedIds = new Set();
    for (const entry of Array.isArray(rawData) ? rawData : []) {
      const fileId = entry?.fileId;
      if (typeof fileId !== "string" || !fileId) continue;
      if (!entry?.file) continue;
      if (processedIds.has(fileId)) continue;
      if (queuedIds.has(fileId)) continue;
      queuedIds.add(fileId);
      queue.push({ fileId, fileName: entry.fileName, file: entry.file });
    }

    if (queue.length === 0) {
      return {
        ok: true,
        type: "info",
        message: t("da_apply_to_new_files_no_new"),
      };
    }

    const prepared = prepareDeviceAnalysisExtraction({
      rawData,
      config,
      previewFile,
      getPreviewRow,
      t,
    });

    if (!prepared.ok) return prepared;

    const warnings = Array.isArray(prepared.warnings) ? prepared.warnings : [];
    const extractionConfig = prepared.extractionConfig;
    const meta = prepared.meta ?? {};
    const stopOnError = Boolean(config?.stopOnError);

    startExtractionJob({
      queue,
      extractionConfig,
      stopOnError,
      resetProcessedData: false,
      resetExtractionErrors: false,
    });

    const groupSizeText = meta.groupSizeCell
      ? t("da_extract_points_from_cell", { cell: meta.pointsRawUpper || "" })
      : t("da_extract_points_fixed", { points: meta.groupSize });

    const groupsText =
      meta.groupSizeCell &&
        Number.isInteger(meta.groupSizePreview) &&
        meta.groupSizePreview > 0
        ? t("da_extract_groups_suffix", {
          groups: Math.max(0, meta.total / meta.groupSizePreview),
        })
        : !meta.groupSizeCell
          ? t("da_extract_groups_suffix", { groups: meta.groups })
          : "";

    const warningText = warnings.length
      ? t("da_extract_warnings_block", { warnings: warnings.join("\n- ") })
      : "";

    return {
      ok: true,
      type: warnings.length ? "warning" : "success",
      message: t("da_extract_started_incremental", {
        count: queue.length,
        detail: groupSizeText,
        groups: groupsText,
        warnings: warningText,
      }),
    };
  }, [_processingStatus.state, getPreviewRow, previewFile, processedData, rawData, startExtractionJob, t]);

  const handleExport = useCallback(async () => {
    if (processedData.length === 0) return;

    const sanitizeFilename = (name) =>
      String(name || "export")
        .replace(/[/\\?%*:|"<>]/g, "_")
        .replace(/\s+/g, " ")
        .trim();

    const triggerDownloadBlob = (filename, blob) => {
      const url = URL.createObjectURL(blob);
      const downloadAnchorNode = document.createElement("a");
      downloadAnchorNode.setAttribute("href", url);
      downloadAnchorNode.setAttribute("download", filename);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
      URL.revokeObjectURL(url);
    };

    const ensureUniqueFileName = () => {
      const usedNames = new Map();
      return (rawName) => {
        const name = String(rawName || "export.csv");
        const count = usedNames.get(name) ?? 0;
        usedNames.set(name, count + 1);
        if (count === 0) return name;

        const dotIndex = name.lastIndexOf(".");
        const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
        const ext = dotIndex > 0 ? name.slice(dotIndex) : "";
        return `${base} (${count + 1})${ext}`;
      };
    };

    const buildCsvExports = () => {
      const makeUniqueName = ensureUniqueFileName();
      const exports = [];

      for (const file of processedData) {
        const originalFileName = file?.fileName ?? "device_analysis";
        const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
        const seriesList = Array.isArray(file?.series) ? file.series : [];

        const seriesByYCol = new Map();
        for (const s of seriesList) {
          const yCol = Number(s?.yCol);
          if (!Number.isInteger(yCol)) continue;
          const list = seriesByYCol.get(yCol) ?? [];
          list.push(s);
          if (!seriesByYCol.has(yCol)) seriesByYCol.set(yCol, list);
        }

        for (const [yCol, list] of seriesByYCol.entries()) {
          const groups = list
            .slice()
            .sort((a, b) => Number(a?.groupIndex) - Number(b?.groupIndex))
            .map((s) => {
              const groupIndex = Number(s?.groupIndex);
              const xArr = xGroups[groupIndex];
              const yArr = s?.y;
              if (!xArr || !yArr) return null;
              return { groupIndex, xArr, yArr };
            })
            .filter(Boolean);

          if (!groups.length) continue;

          const headers = [];
          for (let gi = 0; gi < groups.length; gi++) {
            headers.push(`x${gi + 1}`, `y${gi + 1}`);
          }

          const rowCount = Math.max(
            ...groups.map((g) =>
              Math.min(g.xArr.length ?? 0, g.yArr.length ?? 0),
            ),
          );
          const rows = new Array(rowCount);

          for (let i = 0; i < rowCount; i++) {
            const row = [];
            for (const g of groups) {
              row.push(g.xArr[i] ?? "", g.yArr[i] ?? "");
            }
            rows[i] = row;
          }

          const csvText = Papa.unparse({ fields: headers, data: rows });

          const base = sanitizeFilename(originalFileName).replace(/\.csv$/i, "");
          const yLabel = _getExcelColumnLabel(yCol);
          const filename =
            seriesByYCol.size > 1 ? `${base}_${yLabel}.csv` : `${base}.csv`;

          exports.push({
            filename: makeUniqueName(filename),
            csvText,
            xyPairCount: groups.length,
          });
        }
      }

      return exports;
    };

    const buildPoints = (xArr, yArr) => {
      if (!xArr || !yArr) return [];
      const n = Math.min(xArr.length ?? 0, yArr.length ?? 0);
      if (n <= 0) return [];
      const out = new Array(n);
      for (let i = 0; i < n; i++) {
        out[i] = { x: xArr[i], y: yArr[i] };
      }
      return out;
    };

    const buildSsMetricsCsv = () => {
      const fields = [
        "ss_conf_version",
        "file_id",
        "file_name",
        "series_id",
        "series_name",
        "group_index",
        "y_col",
        "ss_method",
        "ss",
        "ss_ok",
        "ss_confidence",
        "ss_reason",
        "ss_x1",
        "ss_x2",
        "ss_r2",
        "ss_span_dec",
        "ss_n",
        "ss_iLow",
        "ss_iHigh",
        "ss_range_source",
      ];

      const rows = [];
      const confVersion = "ssfit_v1";

      const methodDefault = String(ssMethod || "auto");
      const idLow = Number(ssIdWindow?.low);
      const idHigh = Number(ssIdWindow?.high);
      const idWindowRatio =
        Number.isFinite(idLow) &&
          Number.isFinite(idHigh) &&
          idLow > 0 &&
          idHigh > 0
          ? Math.max(idLow, idHigh) / Math.min(idLow, idHigh)
          : null;

      for (const file of processedData) {
        const fileId = file?.fileId ?? "";
        const fileName = file?.fileName ?? "";
        const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
        const seriesList = Array.isArray(file?.series) ? file.series : [];

        for (const series of seriesList) {
          const seriesId = series?.id ?? "";
          const seriesName = series?.name ?? "";
          const groupIndex = Number(series?.groupIndex);
          const yCol = Number(series?.yCol);
          const xArr = xGroups[groupIndex];
          const yArr = series?.y;
          const points = buildPoints(xArr, yArr);

          const method =
            methodDefault === "auto" ||
              methodDefault === "manual" ||
              methodDefault === "idWindow" ||
              methodDefault === "legacy"
              ? methodDefault
              : "auto";

          let fit = { ok: false, reason: "common.invalid_points" };
          let cls = {
            ss_ok: false,
            ss_confidence: "fail",
            ss_reason: "common.invalid_points",
          };
          let rangeSource = "";

          if (method === "auto") {
            const auto = computeSubthresholdSwingFitAuto(points);
            fit = auto?.strict ?? { ok: false, reason: "common.invalid_points" };
            cls = classifySsFit("auto", fit);
          } else if (method === "manual") {
            const auto = computeSubthresholdSwingFitAuto(points);
            const stored =
              fileId && seriesId ? ssManualRanges?.[fileId]?.[seriesId] : null;
            const initRange = stored
              ? { x1: stored.x1, x2: stored.x2, source: "manual" }
              : auto?.strict?.ok
                ? { x1: auto.strict.x1, x2: auto.strict.x2, source: "strict" }
                : auto?.suggested?.ok
                  ? {
                    x1: auto.suggested.x1,
                    x2: auto.suggested.x2,
                    source: "suggested",
                  }
                  : null;

            rangeSource = initRange?.source ?? "";
            fit = initRange
              ? computeSubthresholdSwingFitInRange(points, initRange.x1, initRange.x2)
              : { ok: false, reason: "manual.range_outside_domain" };
            cls = classifySsFit("manual", fit);
          } else if (method === "idWindow") {
            fit = computeSubthresholdSwingFitInIdWindow(points, idLow, idHigh);
            cls = classifySsFit("idWindow", fit, { idWindowRatio });
          } else if (method === "legacy") {
            const diag = computeSubthresholdSwing(points);
            let min = Infinity;
            for (const p of diag ?? []) {
              const v = Number(p?.y);
              if (!Number.isFinite(v)) continue;
              if (v > 0 && v < min) min = v;
            }
            fit = Number.isFinite(min)
              ? { ok: true, ss: min, reason: "ok" }
              : { ok: false, reason: "common.not_enough_points" };
            cls = classifySsFit("legacy", fit);
          }

          const ssOk = Boolean(cls?.ss_ok);
          const ssValue = ssOk && Number.isFinite(fit?.ss) ? fit.ss : "";

          rows.push({
            ss_conf_version: confVersion,
            file_id: fileId,
            file_name: fileName,
            series_id: seriesId,
            series_name: seriesName,
            group_index: Number.isFinite(groupIndex) ? groupIndex : "",
            y_col: Number.isFinite(yCol) ? yCol : "",
            ss_method: method,
            ss: ssValue,
            ss_ok: ssOk ? "true" : "false",
            ss_confidence: cls?.ss_confidence ?? "fail",
            ss_reason: cls?.ss_reason ?? fit?.reason ?? "common.invalid_points",
            ss_x1: ssOk && Number.isFinite(fit?.x1) ? fit.x1 : "",
            ss_x2: ssOk && Number.isFinite(fit?.x2) ? fit.x2 : "",
            ss_r2: ssOk && Number.isFinite(fit?.r2) ? fit.r2 : "",
            ss_span_dec: ssOk && Number.isFinite(fit?.decadeSpan) ? fit.decadeSpan : "",
            ss_n: ssOk && Number.isFinite(fit?.n) ? fit.n : "",
            ss_iLow: method === "idWindow" && Number.isFinite(idLow) ? idLow : "",
            ss_iHigh: method === "idWindow" && Number.isFinite(idHigh) ? idHigh : "",
            ss_range_source: rangeSource,
          });
        }
      }

      const data = rows.map((row) => fields.map((f) => row?.[f] ?? ""));
      return Papa.unparse({ fields, data });
    };

    const exports = buildCsvExports();

    if (exports.length === 0) return;

    const zip = new JSZip();
    for (const item of exports) {
      zip.file(item.filename, "\uFEFF" + item.csvText);
    }
    zip.file("device_analysis_metrics.csv", "\uFEFF" + buildSsMetricsCsv());

    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    triggerDownloadBlob("device_analysis_export.zip", zipBlob);
  }, [processedData, ssIdWindow, ssManualRanges, ssMethod]);

  const handleExportOrigin = useCallback(async () => {
    if (processedData.length === 0) return;

    const sanitizeFilename = (name) =>
      String(name || "export")
        .replace(/[/\\?%*:|"<>]/g, "_")
        .replace(/\s+/g, " ")
        .trim();

    const triggerDownloadBlob = (filename, blob) => {
      const url = URL.createObjectURL(blob);
      const downloadAnchorNode = document.createElement("a");
      downloadAnchorNode.setAttribute("href", url);
      downloadAnchorNode.setAttribute("download", filename);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
      URL.revokeObjectURL(url);
    };

    const ensureUniqueFileName = () => {
      const usedNames = new Map();
      return (rawName) => {
        const name = String(rawName || "export.csv");
        const count = usedNames.get(name) ?? 0;
        usedNames.set(name, count + 1);
        if (count === 0) return name;

        const dotIndex = name.lastIndexOf(".");
        const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
        const ext = dotIndex > 0 ? name.slice(dotIndex) : "";
        return `${base} (${count + 1})${ext}`;
      };
    };

    const makeUniqueName = ensureUniqueFileName();
    const exports = [];

    for (const file of processedData) {
      const originalFileName = file?.fileName ?? "device_analysis";
      const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
      const seriesList = Array.isArray(file?.series) ? file.series : [];

      const seriesByYCol = new Map();
      for (const s of seriesList) {
        const yCol = Number(s?.yCol);
        if (!Number.isInteger(yCol)) continue;
        const list = seriesByYCol.get(yCol) ?? [];
        list.push(s);
        if (!seriesByYCol.has(yCol)) seriesByYCol.set(yCol, list);
      }

      for (const [yCol, list] of seriesByYCol.entries()) {
        const groups = list
          .slice()
          .sort((a, b) => Number(a?.groupIndex) - Number(b?.groupIndex))
          .map((s) => {
            const groupIndex = Number(s?.groupIndex);
            const xArr = xGroups[groupIndex];
            const yArr = s?.y;
            if (!xArr || !yArr) return null;
            return { groupIndex, xArr, yArr };
          })
          .filter(Boolean);

        if (!groups.length) continue;

        const headers = [];
        for (let gi = 0; gi < groups.length; gi++) {
          headers.push(`x${gi + 1}`, `y${gi + 1}`);
        }

        const rowCount = Math.max(
          ...groups.map((g) =>
            Math.min(g.xArr.length ?? 0, g.yArr.length ?? 0),
          ),
        );
        const rows = new Array(rowCount);

        for (let i = 0; i < rowCount; i++) {
          const row = [];
          for (const g of groups) {
            row.push(g.xArr[i] ?? "", g.yArr[i] ?? "");
          }
          rows[i] = row;
        }

        const csvText = Papa.unparse({ fields: headers, data: rows });

        const base = sanitizeFilename(originalFileName).replace(/\.csv$/i, "");
        const yLabel = _getExcelColumnLabel(yCol);
        const filename =
          seriesByYCol.size > 1 ? `${base}_${yLabel}.csv` : `${base}.csv`;

        exports.push({
          filename: makeUniqueName(filename),
          csvText,
          xyPairCount: groups.length,
        });
      }
    }

    if (exports.length === 0) return;

    const makePairsExpr = (xyPairCount) => {
      const pairs = [];
      const count = Math.max(1, Number(xyPairCount) || 1);
      for (let i = 0; i < count; i++) {
        pairs.push(`(${i * 2 + 1},${i * 2 + 2})`);
      }
      return `(${pairs.join(",")})`; // e.g. ((1,2),(3,4))
    };

    const buildOgsScript = (csvFileName, xyPairCount) => {
      const pairsExpr = makePairsExpr(xyPairCount);
      const safeCsv = String(csvFileName || "data.csv").replace(/"/g, "");

      return `[Main]
// Auto plot exported Device Analysis CSV in Origin
// Usage:
//   1) Put CSV and this OGS in the same folder, set Origin current folder to it, then run:
//        run.section("${safeCsv.replace(/\\.csv$/i, ".ogs")}", Main)
//   2) Or pass CSV full path as %1:
//        run.section("${safeCsv.replace(/\\.csv$/i, ".ogs")}", Main, "C:\\\\path\\\\${safeCsv}")

string csv$ = "%1";
if(csv$ == "")
{
    csv$ = "${safeCsv}";
}

// If CSV not found (exist returns -1), prompt user to select a CSV file.
if(exist(csv$) < 0)
{
    dlgfile group:=*.csv;
    csv$ = fname$;
}

newbook;
impCSV fname:=csv$;

// Plot XY XY pairs: (1,2) (3,4) ...
plotxy iy:=${pairsExpr} plot:=202;
type -b "Plotted %(csv$)";
`;
    };

    const readme = `Device Analysis -> Origin package

Files:
- *.csv: exported data (x1,y1,x2,y2,...)
- *.ogs: Origin LabTalk script to import CSV and plot automatically

How to use (recommended):
1) Unzip this package to a folder.
2) Open Origin.
3) (Optional) Set Origin current folder to the unzip folder (Command Window: cd "path")
4) Run the script (Script Window):
   run.section("your_file.ogs", Main)
   - If the CSV file is not found, Origin will prompt you to select it.

Note:
- Plot is created with plotxy plot:=202 (grouped line+symbol) using XY XY pairs.
`;

    const zip = new JSZip();
    zip.file("README_ORIGIN.txt", readme);
    for (const item of exports) {
      zip.file(item.filename, "\uFEFF" + item.csvText);
      const ogsName = String(item.filename).replace(/\.csv$/i, ".ogs");
      zip.file(ogsName, buildOgsScript(item.filename, item.xyPairCount));
    }

    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    triggerDownloadBlob("device_analysis_origin.zip", zipBlob);
  }, [processedData]);

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;

    // Expose export helpers for DevTools without keeping header-level export buttons.
    window.__appointerDebug = window.__appointerDebug || {};
    window.__appointerDebug.deviceAnalysis = {
      exportZip: handleExport,
      exportOriginZip: handleExportOrigin,
    };

    return () => {
      if (window.__appointerDebug?.deviceAnalysis) {
        delete window.__appointerDebug.deviceAnalysis;
      }
    };
  }, [handleExport, handleExportOrigin]);

  const isDataPageActive = activePage === "data";
  const isAnalysisPageActive = activePage === "analysis";
  const isSettingsPageActive = activePage === "settings";

  const handlePageTabSelect = useCallback((nextPage) => {
    if (nextPage !== "data" && nextPage !== "analysis" && nextPage !== "settings") return;
    setActivePage(nextPage);
  }, []);

  const handlePageTabsKeyDown = useCallback((event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    if (event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "Home") {
      event.preventDefault();
      setActivePage("data");
      return;
    }

    if (
      event.key === "ArrowRight" ||
      event.key === "ArrowDown" ||
      event.key === "End"
    ) {
      event.preventDefault();
      setActivePage("analysis");
    }
  }, []);

  const sendDesktopCommand = useCallback((command) => {
    if (typeof window === "undefined") return false;

    const desktopApp = window.desktopApp;
    if (
      !desktopApp ||
      typeof desktopApp.sendCommand !== "function" ||
      typeof command !== "string"
    ) {
      return false;
    }

    desktopApp.sendCommand(command);
    return true;
  }, []);

  const handleToggleDevTools = useCallback(() => {
    sendDesktopCommand("toggle-devtools");
  }, [sendDesktopCommand]);

  const handleReloadWindow = useCallback(() => {
    if (sendDesktopCommand("reload-window")) return;
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }, [sendDesktopCommand]);

  const handleMinimizeWindow = useCallback(() => {
    sendDesktopCommand("minimize-window");
  }, [sendDesktopCommand]);

  const handleToggleMaximizeWindow = useCallback(() => {
    sendDesktopCommand("toggle-maximize-window");
  }, [sendDesktopCommand]);

  const handleCloseWindow = useCallback(() => {
    sendDesktopCommand("close-window");
  }, [sendDesktopCommand]);

  useEffect(() => {
    if (!isWindowsDesktopShell) return undefined;

    const handleDesktopShortcuts = (event) => {
      if (event.defaultPrevented || event.metaKey || event.altKey) return;

      const key = String(event.key || "").toLowerCase();

      if (event.ctrlKey && !event.shiftKey && key === "o") {
        event.preventDefault();
        importerRef.current?.openFileDialog();
        return;
      }

      if (event.ctrlKey && event.shiftKey && key === "e") {
        event.preventDefault();
        void handleExport();
        return;
      }

      if (key === "f5") {
        event.preventDefault();
        handleReloadWindow();
        return;
      }

      if (key === "f12") {
        event.preventDefault();
        handleToggleDevTools();
      }
    };

    window.addEventListener("keydown", handleDesktopShortcuts);
    return () => {
      window.removeEventListener("keydown", handleDesktopShortcuts);
    };
  }, [
    handleExport,
    handleReloadWindow,
    handleToggleDevTools,
    isWindowsDesktopShell,
  ]);

  return (
    <div
      id="device-analysis-page"
      className="relative w-full h-full min-h-0 overflow-hidden flex flex-col"
    >
      {isWindowsDesktopShell ? (
        <DesktopCommandBar
          t={t}
          onOpenSettings={() => handlePageTabSelect("settings")}
          onMinimizeWindow={handleMinimizeWindow}
          onToggleMaximizeWindow={handleToggleMaximizeWindow}
          onCloseWindow={handleCloseWindow}
        />
      ) : null}

      <div className="relative flex-1 min-h-0 px-4 py-4 md:px-6 md:py-6 lg:px-8">
        <section
          id="device-analysis-tabpanel-data"
          role="tabpanel"
          aria-labelledby="device-analysis-tab-data"
          aria-hidden={!isDataPageActive}
          inert={!isDataPageActive ? "" : undefined}
          className={`absolute inset-0 min-h-0 transition-opacity duration-150 ${isDataPageActive
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
            }`}
        >
          <div className="da_page_scroll h-full min-h-0 overflow-y-auto xl:overflow-hidden">
            <div className="min-h-full grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-4 xl:h-full">
              <aside className="space-y-6 xl:min-h-0 xl:overflow-y-auto xl:custom-scrollbar xl:pr-2 flex flex-col h-full">
                <section aria-label={t("da_import_section")} className="flex-1 flex flex-col min-h-0">
                  <Card
                    id="device-analysis-import-card"
                    cta="Device analysis"
                    ctaPosition="data-import"
                    ctaCopy="csv importer"
                    className="p-4 flex flex-col flex-1 min-h-0"
                  >
                    <div className="import_card_head_warp">
                      <div className="import_card_head_group">
                        <button
                          type="button"
                          id="device-analysis-import-csv-btn"
                          data-icon="with"
                          data-cta="Device analysis"
                          data-cta-position="data-import"
                          data-cta-copy="import csv"
                          className="action-btn action-btn--md action-btn--primary"
                          aria-label={t("da_import_csv")}
                          onClick={() => importerRef.current?.openFileDialog()}
                        >
                          <span className="action-btn__content">
                            <Upload size={16} />
                            {t("da_import_csv")}
                          </span>
                        </button>
                        <span className="meta_text whitespace-nowrap">
                          {t("da_loaded_csv_files", { count: rawData.length })}
                        </span>
                      </div>

                      <button
                        type="button"
                        id="device-analysis-clear-session-btn"
                        data-icon="with"
                        data-cta="Device analysis"
                        data-cta-position="data-import"
                        data-cta-copy="reset session"
                        className={`action-btn action-btn--control ${hasSessionData ? "action-btn--danger" : "action-btn--disabled"
                          }`}
                        aria-label={t("da_reset_session")}
                        title={t("da_reset_session")}
                        onClick={handleClearSession}
                        disabled={!hasSessionData}
                      >
                        <span className="action-btn__content">
                          <RefreshCw
                            size={16}
                            className="transition-transform duration-500 hover:rotate-180"
                          />
                        </span>
                      </button>
                    </div>
                    <CsvImporter
                      ref={importerRef}
                      files={rawData}
                      onDataImported={handleDataImported}
                      onDataRemoved={handleDataRemoved}
                      onFileSelected={handlePreviewFileSelected}
                      selectedFileId={selectedPreviewFileId}
                    />
                  </Card>
                </section>

                {extractionErrors.length > 0 && (
                  <section aria-label={t("da_extraction_errors")}>
                    <div
                      id="device-analysis-extraction-errors"
                      className="bg-red-500/10 border border-red-500/20 rounded-xl p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-red-500">
                          <AlertCircle size={18} />
                          <h3 className="text-sm font-semibold">
                            {t("da_extraction_errors")} ({extractionErrors.length})
                          </h3>
                        </div>
                        <button
                          id="device-analysis-extraction-errors-clear-btn"
                          type="button"
                          onClick={() => setExtractionErrors([])}
                          className="text-xs px-2 py-1 rounded border border-red-500/20 text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          {t("common_clear")}
                        </button>
                      </div>

                      <div className="mt-3 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                        <ul className="space-y-2 text-sm text-text-secondary">
                          {extractionErrors.map((err, idx) => (
                            <li key={`${err.fileName}-${idx}`}>
                              <span className="font-semibold text-text-primary">
                                {err.fileName}:
                              </span>{" "}
                              <span className="whitespace-pre-wrap">{err.message}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </section>
                )}
              </aside>

              <section
                aria-label={t("da_data_extraction_template")}
                className="xl:min-h-0 xl:overflow-y-auto xl:custom-scrollbar xl:pr-2 flex flex-col h-full"
              >
                <TemplateManager
                  previewFile={previewFile}
                  previewStatus={previewStatus}
                  getPreviewRow={getPreviewRow}
                  ensurePreviewRows={ensurePreviewRows}
                  onTemplateApplied={handleTemplateApplied}
                  onTemplateAppliedIncremental={handleTemplateAppliedIncremental}
                  subscribePreviewRowsVersion={subscribePreviewRowsVersion}
                  getPreviewRowsVersion={getPreviewRowsVersion}
                  deviceAnalysisSettings={deviceAnalysisSettings}
                  onUpdateDeviceAnalysisSettings={handleUpdateDeviceAnalysisSettings}
                />
              </section>
            </div>
          </div>
        </section>

        <section
          id="device-analysis-tabpanel-analysis"
          role="tabpanel"
          aria-labelledby="device-analysis-tab-analysis"
          aria-hidden={!isAnalysisPageActive}
          inert={!isAnalysisPageActive ? "" : undefined}
          className={`absolute inset-0 min-h-0 transition-opacity duration-150 ${isAnalysisPageActive
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
            }`}
        >
          <div className="da_page_scroll h-full min-h-0 overflow-y-auto custom-scrollbar xl:pr-2">
            <section aria-label={t("da_analysis_visualization")}>
              <h2 className="section_title">{t("da_analysis_visualization")}</h2>

              {processedData.length > 0 ? (
                <AnalysisCharts
                  processedData={processedData}
                  processingStatus={_processingStatus}
                  ssMethod={ssMethod}
                  setSsMethod={setSsMethod}
                  ssDiagnosticsEnabled={ssDiagnosticsEnabled}
                  setSsDiagnosticsEnabled={setSsDiagnosticsEnabled}
                  ssShowFitLine={ssShowFitLine}
                  setSsShowFitLine={setSsShowFitLine}
                  ssIdWindow={ssIdWindow}
                  setSsIdWindow={setSsIdWindow}
                  ssManualRanges={ssManualRanges}
                  setSsManualRanges={setSsManualRanges}
                />
              ) : (
                <Card
                  id="device-analysis-empty-processed-data-card"
                  variant="panel"
                  cta="Device analysis"
                  ctaPosition="analysis"
                  ctaCopy="empty processed data"
                  className="flex flex-col items-center justify-center h-[300px] border-2 border-dashed border-border bg-bg-surface/50 text-text-secondary"
                >
                  <BarChart2 size={48} className="mb-4 opacity-20" />
                  <p className="text-lg font-medium">{t("da_no_processed_data")}</p>
                  <p className="text-sm">{t("da_no_processed_data_hint")}</p>
                </Card>
              )}
            </section>
          </div>
        </section>

        <section
          id="device-analysis-tabpanel-settings"
          role="tabpanel"
          aria-labelledby="device-analysis-window-settings-btn"
          aria-hidden={!isSettingsPageActive}
          inert={!isSettingsPageActive ? "" : undefined}
          className={`absolute inset-0 min-h-0 transition-opacity duration-150 ${isSettingsPageActive
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
            }`}
        >
          <div className="da_page_scroll h-full min-h-0 overflow-y-auto custom-scrollbar xl:pr-2">
            <section aria-label="Settings">
              <h2 className="section_title">Settings</h2>
              <Card
                id="device-analysis-settings-placeholder-card"
                variant="panel"
                className="flex flex-col items-center justify-center h-[300px] border-2 border-dashed border-border bg-bg-surface/50 text-text-secondary"
              >
                <p className="text-lg font-medium">Settings Placeholder</p>
                <p className="text-sm">Future settings options will be displayed here.</p>
              </Card>
            </section>
          </div>
        </section>
      </div>

      <nav
        className="da_bottom_tabs"
        role="tablist"
        aria-label={t("da_tab_switcher_label")}
        onKeyDown={handlePageTabsKeyDown}
      >
        <div
          className="da_bottom_tabs_indicator"
          style={{ transform: `translateX(${isDataPageActive ? '0%' : '100%'})` }}
        />
        <Button
          id="device-analysis-tab-data"
          role="tab"
          aria-controls="device-analysis-tabpanel-data"
          aria-selected={isDataPageActive}
          tabIndex={isDataPageActive ? 0 : -1}
          variant="ghost"
          size="control"
          dataIcon="with"
          cta="Device analysis"
          ctaPosition="bottom-tab"
          ctaCopy="data page"
          className={`da_bottom_tab_btn ${isDataPageActive ? "da_bottom_tab_btn--active" : ""}`}
          onClick={() => handlePageTabSelect("data")}
        >
          <Upload size={14} />
          {t("da_tab_data")}
        </Button>
        <Button
          id="device-analysis-tab-analysis"
          role="tab"
          aria-controls="device-analysis-tabpanel-analysis"
          aria-selected={isAnalysisPageActive}
          tabIndex={isAnalysisPageActive ? 0 : -1}
          variant="ghost"
          size="control"
          dataIcon="with"
          cta="Device analysis"
          ctaPosition="bottom-tab"
          ctaCopy="analysis page"
          className={`da_bottom_tab_btn ${isAnalysisPageActive ? "da_bottom_tab_btn--active" : ""}`}
          onClick={() => handlePageTabSelect("analysis")}
        >
          <BarChart2 size={14} />
          {t("da_tab_analysis")}
        </Button>
      </nav>
    </div>
  );
};

export default DeviceAnalysis;
