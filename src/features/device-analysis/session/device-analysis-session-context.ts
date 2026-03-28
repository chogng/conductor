import {
  createContext,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type {
  PreviewFile,
  PreviewRowsRequest,
  ProcessedEntry,
  RawDataEntry,
} from "../shared/lib/sharedTypes";

export type TemplateMode = "select" | "save";
export type PreviewStatusState = "idle" | "loading" | "ready" | "error";
export type SsMethod = "auto" | "manual" | "idWindow" | "legacy";

export type DeviceAnalysisTemplateConfig = {
  name: string;
  xDataStart: string;
  xDataEnd: string;
  xSegmentationMode: "auto" | "points" | "segments";
  xSegmentCount: string;
  xPointsPerGroup: string;
  xUnit: string;
  yLegendStart: string;
  yLegendCount: string;
  yLegendStep: string;
  yLegendTarget: "auto" | "yColumn" | "group";
  yUnit: string;
  stopOnError: boolean;
  fileNameMatchCaseSensitive: boolean;
  bottomTitle: string;
  leftTitle: string;
  legendPrefix: string;
  fileNameVgKeywords: string;
  fileNameVdKeywords: string;
  yColumns: number[];
};

export type PreviewStatus = {
  state: PreviewStatusState;
  message: string;
};

export type SsIdWindow = {
  low: string;
  high: string;
};

export type SsManualRange = {
  x1: unknown;
  x2: unknown;
};

export type SsManualRanges = Record<string, Record<string, SsManualRange>>;

export type DeviceAnalysisSessionContextValue = {
  rawData: RawDataEntry[];
  setRawData: Dispatch<SetStateAction<RawDataEntry[]>>;
  selectedPreviewFileId: string | null;
  setSelectedPreviewFileId: Dispatch<SetStateAction<string | null>>;
  processedData: ProcessedEntry[];
  setProcessedData: Dispatch<SetStateAction<ProcessedEntry[]>>;
  templateMode: TemplateMode;
  setTemplateMode: Dispatch<SetStateAction<TemplateMode>>;
  selectedTemplateId: string | null;
  setSelectedTemplateId: Dispatch<SetStateAction<string | null>>;
  templateConfig: DeviceAnalysisTemplateConfig;
  setTemplateConfig: Dispatch<SetStateAction<DeviceAnalysisTemplateConfig>>;
  previewFile: PreviewFile | null;
  setPreviewFile: Dispatch<SetStateAction<PreviewFile | null>>;
  previewStatus: PreviewStatus;
  setPreviewStatus: Dispatch<SetStateAction<PreviewStatus>>;
  previewWorkerRef: MutableRefObject<Worker | null>;
  previewRequestIdRef: MutableRefObject<number>;
  previewRowsRequestIdRef: MutableRefObject<number>;
  previewRowsRequestsRef: MutableRefObject<Map<number, PreviewRowsRequest>>;
  previewRowsCacheByFileIdRef: MutableRefObject<
    Map<string, Map<number, unknown[]>>
  >;
  previewLoadedChunksByFileIdRef: MutableRefObject<Map<string, Set<number>>>;
  previewRowsCacheRef: MutableRefObject<Map<number, unknown[]>>;
  previewLoadedChunksRef: MutableRefObject<Set<number>>;
  previewCacheFileIdRef: MutableRefObject<string | null>;
  previewCacheFileLruRef: MutableRefObject<Set<string>>;
  ssMethod: SsMethod;
  setSsMethod: Dispatch<SetStateAction<SsMethod>>;
  ssDiagnosticsEnabled: boolean;
  setSsDiagnosticsEnabled: Dispatch<SetStateAction<boolean>>;
  ssShowFitLine: boolean;
  setSsShowFitLine: Dispatch<SetStateAction<boolean>>;
  ssIdWindow: SsIdWindow;
  setSsIdWindow: Dispatch<SetStateAction<SsIdWindow>>;
  ssManualRanges: SsManualRanges;
  setSsManualRanges: Dispatch<SetStateAction<SsManualRanges>>;
};

export const DeviceAnalysisSessionContext =
  createContext<DeviceAnalysisSessionContextValue | null>(null);

