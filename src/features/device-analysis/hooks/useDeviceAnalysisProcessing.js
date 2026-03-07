import { useCallback, useEffect, useRef, useState } from "react";
import { prepareDeviceAnalysisExtraction } from "../lib/deviceAnalysisExtractionValidation";
import {
  parseLegacyExtractionError,
  stableStringify,
} from "../lib/deviceAnalysisUtils";

export const useDeviceAnalysisProcessing = ({
  getPreviewRow,
  previewFile,
  processedData = [],
  rawData = [],
  rawDataByIdRef,
  setActivePage,
  setExtractionErrors,
  setProcessedData,
  t,
}) => {
  const [processingStatus, setProcessingStatus] = useState({
    state: "idle",
    processed: 0,
    total: 0,
  });

  const processingWorkerRef = useRef(null);
  const processingJobIdRef = useRef(0);
  const processingQueueRef = useRef([]);
  const processingStopOnErrorRef = useRef(false);
  const lastAppliedTemplateConfigFingerprintRef = useRef(null);

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

  const removeQueuedProcessingFile = useCallback(
    (fileId) => {
      if (processingStatus.state !== "processing") return;

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
    },
    [processingStatus.state],
  );

  useEffect(() => {
    return () => {
      if (processingWorkerRef.current) {
        processingWorkerRef.current.terminate();
        processingWorkerRef.current = null;
      }
    };
  }, []);

  const startExtractionJob = useCallback(
    ({
      extractionConfig,
      queue,
      resetExtractionErrors,
      resetProcessedData,
      stopOnError,
    }) => {
      if (!Array.isArray(queue) || queue.length === 0) return;

      const workQueue = [...queue];
      let hasAnyProcessedResult = false;

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
        const nextEntry = processingQueueRef.current.shift();

        if (!nextEntry) {
          setProcessingStatus((prev) => ({ ...prev, state: "done" }));
          if (hasAnyProcessedResult) {
            setActivePage("analysis");
          }

          worker.terminate();
          if (processingWorkerRef.current === worker) {
            processingWorkerRef.current = null;
          }
          return;
        }

        worker.postMessage({
          type: "processFile",
          payload: {
            config: extractionConfig,
            file: nextEntry.file,
            fileId: nextEntry.fileId,
            fileName: nextEntry.fileName,
            jobId,
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
            setProcessingStatus((prev) => ({
              ...prev,
              processed: prev.processed + 1,
            }));
            processNext();
            return;
          }

          hasAnyProcessedResult = true;
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

          const rawMessage =
            typeof payload?.message === "string" && payload.message.trim()
              ? payload.message
              : "Unknown error";
          const legacyParsed = parseLegacyExtractionError(rawMessage);
          const errFileName =
            payload?.fileName ?? legacyParsed?.fileName ?? "Unknown file";
          const errMessageKey =
            typeof payload?.messageKey === "string" && payload.messageKey
              ? payload.messageKey
              : legacyParsed?.messageKey ?? null;
          const errMessageParams =
            payload?.messageParams && typeof payload.messageParams === "object"
              ? payload.messageParams
              : legacyParsed?.messageParams ?? null;

          setExtractionErrors((prev) => [
            ...prev,
            {
              fileName: errFileName,
              message: rawMessage,
              messageKey: errMessageKey,
              messageParams: errMessageParams,
            },
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
    [
      rawDataByIdRef,
      setActivePage,
      setExtractionErrors,
      setProcessedData,
    ],
  );

  const handleTemplateApplied = useCallback(
    (config) => {
      const prepared = prepareDeviceAnalysisExtraction({
        config,
        getPreviewRow,
        previewFile,
        rawData,
        t,
      });

      if (!prepared.ok) return prepared;

      const warnings = Array.isArray(prepared.warnings) ? prepared.warnings : [];
      const extractionConfig = prepared.extractionConfig;
      const meta = prepared.meta ?? {};
      const stopOnError = Boolean(config?.stopOnError);
      const queue = rawData
        .filter((entry) => entry?.file)
        .map((entry) => ({
          file: entry.file,
          fileId: entry.fileId,
          fileName: entry.fileName,
        }));

      lastAppliedTemplateConfigFingerprintRef.current = stableStringify(config);
      startExtractionJob({
        extractionConfig,
        queue,
        resetExtractionErrors: true,
        resetProcessedData: true,
        stopOnError,
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
        message: t("da_extract_started", {
          count: queue.length,
          detail: groupSizeText,
          groups: groupsText,
          warnings: warningText,
        }),
        ok: true,
        type: warnings.length ? "warning" : "success",
      };
    },
    [getPreviewRow, previewFile, rawData, startExtractionJob, t],
  );

  const handleTemplateAppliedIncremental = useCallback(
    (config) => {
      if (processingStatus.state === "processing") {
        return {
          message: t("da_apply_to_new_files_busy"),
          ok: false,
          type: "warning",
        };
      }

      const lastFingerprint = lastAppliedTemplateConfigFingerprintRef.current;
      if (!lastFingerprint) {
        return {
          message: t("da_apply_to_new_files_requires_full_apply"),
          ok: false,
          type: "warning",
        };
      }

      if (stableStringify(config) !== lastFingerprint) {
        return {
          message: t("da_apply_to_new_files_template_changed"),
          ok: false,
          type: "warning",
        };
      }

      const processedIds = new Set(
        (Array.isArray(processedData) ? processedData : [])
          .map((entry) => entry?.fileId)
          .filter(Boolean),
      );

      const queue = [];
      const queuedIds = new Set();
      for (const entry of rawData) {
        const fileId = entry?.fileId;
        if (!fileId || !entry?.file) continue;
        if (processedIds.has(fileId) || queuedIds.has(fileId)) continue;

        queue.push({ file: entry.file, fileId, fileName: entry.fileName });
        queuedIds.add(fileId);
      }

      if (!queue.length) {
        return {
          message: t("da_apply_to_new_files_none"),
          ok: false,
          type: "warning",
        };
      }

      const prepared = prepareDeviceAnalysisExtraction({
        config,
        getPreviewRow,
        previewFile,
        rawData,
        t,
      });
      if (!prepared.ok) return prepared;

      const warnings = Array.isArray(prepared.warnings) ? prepared.warnings : [];
      const extractionConfig = prepared.extractionConfig;
      const meta = prepared.meta ?? {};
      const stopOnError = Boolean(config?.stopOnError);

      startExtractionJob({
        extractionConfig,
        queue,
        resetExtractionErrors: false,
        resetProcessedData: false,
        stopOnError,
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
        message: t("da_apply_to_new_files_started", {
          count: queue.length,
          detail: groupSizeText,
          groups: groupsText,
          warnings: warningText,
        }),
        ok: true,
        type: warnings.length ? "warning" : "success",
      };
    },
    [
      getPreviewRow,
      previewFile,
      processedData,
      processingStatus.state,
      rawData,
      startExtractionJob,
      t,
    ],
  );

  return {
    handleTemplateApplied,
    handleTemplateAppliedIncremental,
    processingStatus,
    removeQueuedProcessingFile,
    resetProcessingWorker,
  };
};
