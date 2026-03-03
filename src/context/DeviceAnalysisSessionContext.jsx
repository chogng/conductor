import { useMemo, useRef, useState } from "react";
import { DeviceAnalysisSessionContext } from "./device-analysis-session-context";

export const DeviceAnalysisSessionProvider = ({ children }) => {
  const [rawData, setRawData] = useState([]);
  const [selectedPreviewFileId, setSelectedPreviewFileId] = useState(null);
  const [processedData, setProcessedData] = useState([]);
  const [extractionErrors, setExtractionErrors] = useState([]);

  // Device Analysis: template manager session state (persist across route switches)
  const [templateMode, setTemplateMode] = useState("select"); // "select" | "save"
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [templateConfig, setTemplateConfig] = useState({
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

  const [previewFile, setPreviewFile] = useState(null);
  const [previewStatus, setPreviewStatus] = useState({
    state: "idle", // 'idle' | 'loading' | 'ready' | 'error'
    message: "",
  });

  const previewWorkerRef = useRef(null);
  const previewRequestIdRef = useRef(0);
  const previewRowsRequestIdRef = useRef(0);
  const previewRowsRequestsRef = useRef(new Map());

  const previewRowsCacheByFileIdRef = useRef(new Map());
  const previewLoadedChunksByFileIdRef = useRef(new Map());
  const previewRowsCacheRef = useRef(new Map());
  const previewLoadedChunksRef = useRef(new Set());
  const previewCacheFileIdRef = useRef(null);
  const previewCacheFileLruRef = useRef(new Set());

  // Device analysis SS (session state; defaults overridden by user settings if loaded).
  const [ssMethod, setSsMethod] = useState("auto"); // auto | manual | idWindow | legacy
  const [ssDiagnosticsEnabled, setSsDiagnosticsEnabled] = useState(true);
  const [ssShowFitLine, setSsShowFitLine] = useState(true);
  const [ssIdWindow, setSsIdWindow] = useState({
    low: "1e-11",
    high: "1e-9",
  });
  // { [fileId]: { [seriesId]: { x1, x2 } } }
  const [ssManualRanges, setSsManualRanges] = useState({});

  const value = useMemo(
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
