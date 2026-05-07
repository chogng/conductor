import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  SessionContext,
  type SessionContextValue,
  type TemplateConfig,
  type IonIoffManualTargetsByFileId,
  type IonIoffMethod,
  type PreviewStatus,
  type SsManualRanges,
  type SsMethod,
  type TemplateMode,
} from "./analysis-session-context";
import type {
  PreviewFile,
  PreviewRowsRequest,
  ProcessedEntry,
  RawDataEntry,
} from "../shared/lib/sharedTypes";

type SessionProviderProps = {
  children: ReactNode;
};

export const SessionProvider = ({
  children,
}: SessionProviderProps) => {
  const [rawData, setRawData] = useState<RawDataEntry[]>([]);
  const [selectedPreviewFileId, setSelectedPreviewFileId] = useState<string | null>(null);
  const [processedData, setProcessedData] = useState<ProcessedEntry[]>([]);

  // Device Analysis: template manager session state (persist across route switches)
  const [templateMode, setTemplateMode] = useState<TemplateMode>("select");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateConfig, setTemplateConfig] = useState<TemplateConfig>({
    name: "",
    xDataStart: "",
    xDataEnd: "",
    xSegmentationMode: "auto",
    xSegmentCount: "",
    xPointsPerGroup: "",
    xUnit: "V",
    yLegendStart: "",
    yLegendCount: "",
    yLegendStep: "",
    yLegendTarget: "auto",
    yUnit: "A",
    stopOnError: false,
    fileNameMatchCaseSensitive: false,
    bottomTitle: "",
    leftTitle: "",
    legendPrefix: "",
    fileNameVgKeywords: "",
    fileNameVdKeywords: "",
    yColumns: [],
  });

  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>({
    state: "idle",
    message: "",
  });

  const previewWorkerRef = useRef<Worker | null>(null);
  const previewRequestIdRef = useRef(0);
  const previewRowsRequestIdRef = useRef(0);
  const previewRowsRequestsRef = useRef<Map<number, PreviewRowsRequest>>(
    new Map(),
  );

  const previewRowsCacheByFileIdRef = useRef<
    Map<string, Map<number, unknown[]>>
  >(new Map());
  const previewLoadedChunksByFileIdRef = useRef<Map<string, Set<number>>>(new Map());
  const previewRowsCacheRef = useRef<Map<number, unknown[]>>(new Map());
  const previewLoadedChunksRef = useRef<Set<number>>(new Set());
  const previewCacheFileIdRef = useRef<string | null>(null);
  const previewCacheFileLruRef = useRef<Set<string>>(new Set());

  const [ionIoffMethod, setIonIoffMethod] = useState<IonIoffMethod>("auto");
  const [ionIoffManualTargetsByFileId, setIonIoffManualTargetsByFileId] =
    useState<IonIoffManualTargetsByFileId>({});

  // Device analysis SS (session state; defaults overridden by user settings if loaded).
  const [ssMethod, setSsMethod] = useState<SsMethod>("auto");
  const [ssDiagnosticsEnabled, setSsDiagnosticsEnabled] = useState(false);
  const [vthDiagnosticsEnabled, setVthDiagnosticsEnabled] = useState(false);
  const [gmDiagnosticsEnabled, setGmDiagnosticsEnabled] = useState(false);
  const [ssShowFitLine, setSsShowFitLine] = useState(true);
  const [ssManualRanges, setSsManualRanges] = useState<SsManualRanges>({});

  const value = useMemo<SessionContextValue>(
    () => ({
      rawData,
      setRawData,
      selectedPreviewFileId,
      setSelectedPreviewFileId,
      processedData,
      setProcessedData,
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
      ionIoffMethod,
      setIonIoffMethod,
      ionIoffManualTargetsByFileId,
      setIonIoffManualTargetsByFileId,
      ssMethod,
      setSsMethod,
      ssDiagnosticsEnabled,
      setSsDiagnosticsEnabled,
      vthDiagnosticsEnabled,
      setVthDiagnosticsEnabled,
      gmDiagnosticsEnabled,
      setGmDiagnosticsEnabled,
      ssShowFitLine,
      setSsShowFitLine,
      ssManualRanges,
      setSsManualRanges,
    }),
    [
      selectedTemplateId,
      templateConfig,
      templateMode,
      previewFile,
      previewStatus,
      processedData,
      rawData,
      selectedPreviewFileId,
      ionIoffManualTargetsByFileId,
      ionIoffMethod,
      gmDiagnosticsEnabled,
      ssDiagnosticsEnabled,
      vthDiagnosticsEnabled,
      ssManualRanges,
      ssMethod,
      ssShowFitLine,
    ],
  );

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
};
