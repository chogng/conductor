import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  DeviceAnalysisSessionContext,
  type DeviceAnalysisSessionContextValue,
  type DeviceAnalysisTemplateConfig,
  type PreviewStatus,
  type SsIdWindow,
  type SsManualRanges,
  type SsMethod,
  type TemplateMode,
} from "./device-analysis-session-context";

type DeviceAnalysisSessionProviderProps = {
  children: ReactNode;
};

export const DeviceAnalysisSessionProvider = ({
  children,
}: DeviceAnalysisSessionProviderProps) => {
  const [rawData, setRawData] = useState<unknown[]>([]);
  const [selectedPreviewFileId, setSelectedPreviewFileId] = useState<string | null>(null);
  const [processedData, setProcessedData] = useState<unknown[]>([]);
  const [extractionErrors, setExtractionErrors] = useState<unknown[]>([]);

  // Device Analysis: template manager session state (persist across route switches)
  const [templateMode, setTemplateMode] = useState<TemplateMode>("select");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateConfig, setTemplateConfig] = useState<DeviceAnalysisTemplateConfig>({
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
    selectedColumns: [],
  });

  const [previewFile, setPreviewFile] = useState<unknown | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>({
    state: "idle",
    message: "",
  });

  const previewWorkerRef = useRef<Worker | null>(null);
  const previewRequestIdRef = useRef(0);
  const previewRowsRequestIdRef = useRef(0);
  const previewRowsRequestsRef = useRef<Map<number, unknown>>(new Map());

  const previewRowsCacheByFileIdRef = useRef<Map<string, unknown>>(new Map());
  const previewLoadedChunksByFileIdRef = useRef<Map<string, Set<number>>>(new Map());
  const previewRowsCacheRef = useRef<Map<number, unknown>>(new Map());
  const previewLoadedChunksRef = useRef<Set<number>>(new Set());
  const previewCacheFileIdRef = useRef<string | null>(null);
  const previewCacheFileLruRef = useRef<Set<string>>(new Set());

  // Device analysis SS (session state; defaults overridden by user settings if loaded).
  const [ssMethod, setSsMethod] = useState<SsMethod>("auto");
  const [ssDiagnosticsEnabled, setSsDiagnosticsEnabled] = useState(true);
  const [ssShowFitLine, setSsShowFitLine] = useState(true);
  const [ssIdWindow, setSsIdWindow] = useState<SsIdWindow>({
    low: "1e-11",
    high: "1e-9",
  });
  const [ssManualRanges, setSsManualRanges] = useState<SsManualRanges>({});

  const value = useMemo<DeviceAnalysisSessionContextValue>(
    () => ({
      rawData,
      setRawData,
      selectedPreviewFileId,
      setSelectedPreviewFileId,
      processedData,
      setProcessedData,
      extractionErrors,
      setExtractionErrors,
      templateMode,
      setTemplateMode,
      selectedTemplateId,
      setSelectedTemplateId,
      templateConfig,
      setTemplateConfig,
      previewFile,
      setPreviewFile,
      previewStatus,
      setPreviewStatus,
      previewWorkerRef,
      previewRequestIdRef,
      previewRowsRequestIdRef,
      previewRowsRequestsRef,
      previewRowsCacheByFileIdRef,
      previewLoadedChunksByFileIdRef,
      previewRowsCacheRef,
      previewLoadedChunksRef,
      previewCacheFileIdRef,
      previewCacheFileLruRef,
      ssMethod,
      setSsMethod,
      ssDiagnosticsEnabled,
      setSsDiagnosticsEnabled,
      ssShowFitLine,
      setSsShowFitLine,
      ssIdWindow,
      setSsIdWindow,
      ssManualRanges,
      setSsManualRanges,
    }),
    [
      extractionErrors,
      selectedTemplateId,
      templateConfig,
      templateMode,
      previewFile,
      previewStatus,
      processedData,
      rawData,
      selectedPreviewFileId,
      ssDiagnosticsEnabled,
      ssIdWindow,
      ssManualRanges,
      ssMethod,
      ssShowFitLine,
    ],
  );

  return (
    <DeviceAnalysisSessionContext.Provider value={value}>
      {children}
    </DeviceAnalysisSessionContext.Provider>
  );
};
