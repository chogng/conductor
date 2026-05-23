import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { IonIoffManualTargetsByFileId } from "src/cs/workbench/contrib/deviceAnalysis/session/analysis-session-context";
import type { AnalysisSettings } from "src/cs/workbench/contrib/deviceAnalysis/settings/settingsShared";
import type { ProcessedEntry } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";

export type AnalysisFileOption = {
  label: string;
  value: string;
};

const stripCsvExtension = (fileName: string): string => {
  const normalized = String(fileName ?? "").trim();
  if (!normalized) {
    return normalized;
  }

  const withoutCsv = normalized.replace(/\.csv$/i, "");
  return withoutCsv.length > 0 ? withoutCsv : normalized;
};

const getAnalysisFileOptions = (
  processedData: ProcessedEntry[] | null | undefined,
): AnalysisFileOption[] =>
  (Array.isArray(processedData) ? processedData : [])
    .map((entry) => {
      const fileId =
        typeof entry?.fileId === "string"
          ? entry.fileId
          : String(entry?.fileId ?? "");
      const fileNameRaw = entry?.fileName;
      const fileName =
        typeof fileNameRaw === "string" && fileNameRaw.trim().length > 0
          ? fileNameRaw
          : fileId;
      const displayName = stripCsvExtension(fileName);
      if (!fileId) {
        return null;
      }

      return { value: fileId, label: displayName };
    })
    .filter((entry): entry is AnalysisFileOption => !!entry);

type UseAnalysisSelectionStateParams = {
  analysisSettings: AnalysisSettings | null;
  analysisSettingsLoaded: boolean;
  handleUpdateAnalysisSettings: (
    updates: unknown,
  ) => Promise<AnalysisSettings | null>;
  ionIoffManualTargetsByFileId: IonIoffManualTargetsByFileId;
  processedData: ProcessedEntry[];
  setIonIoffManualTargetsByFileId: Dispatch<
    SetStateAction<IonIoffManualTargetsByFileId>
  >;
};

export const useAnalysisSelectionState = ({
  analysisSettings,
  analysisSettingsLoaded,
  handleUpdateAnalysisSettings,
  ionIoffManualTargetsByFileId,
  processedData,
  setIonIoffManualTargetsByFileId,
}: UseAnalysisSelectionStateParams) => {
  const [analysisActiveFileId, setAnalysisActiveFileId] = useState<
    string | null
  >(null);

  const analysisFileOptions = useMemo(
    () => getAnalysisFileOptions(processedData),
    [processedData],
  );

  useEffect(() => {
    setAnalysisActiveFileId((prev) => {
      if (!analysisFileOptions.length) {
        return prev === null ? prev : null;
      }

      if (prev && analysisFileOptions.some((option) => option.value === prev)) {
        return prev;
      }

      return analysisFileOptions[0].value;
    });
  }, [analysisFileOptions]);

  const handleAnalysisFileChange = useCallback((nextFileId: string | null) => {
    setAnalysisActiveFileId(nextFileId ?? null);
  }, []);

  useEffect(() => {
    const fileId = String(analysisActiveFileId ?? "").trim();
    if (!fileId) {
      return;
    }

    const activeFile =
      processedData.find((entry) => entry?.fileId === fileId) ?? null;
    const defaultSeriesId = String(activeFile?.series?.[0]?.id ?? "").trim();
    if (!defaultSeriesId) {
      return;
    }

    if (ionIoffManualTargetsByFileId[fileId]?.[defaultSeriesId]) {
      return;
    }

    const fallbackIonX = analysisSettings?.ionIoffManualIonX;
    const fallbackIoffX = analysisSettings?.ionIoffManualIoffX;
    if (
      (fallbackIonX === undefined ||
        fallbackIonX === null ||
        fallbackIonX === "") &&
      (fallbackIoffX === undefined ||
        fallbackIoffX === null ||
        fallbackIoffX === "")
    ) {
      return;
    }

    setIonIoffManualTargetsByFileId((prev) => {
      if (prev?.[fileId]?.[defaultSeriesId]) {
        return prev;
      }

      return {
        ...(prev || {}),
        [fileId]: {
          ...(prev?.[fileId] ?? {}),
          [defaultSeriesId]: {
            ionX:
              fallbackIonX === undefined ||
              fallbackIonX === null ||
              fallbackIonX === ""
                ? ""
                : String(fallbackIonX),
            ioffX:
              fallbackIoffX === undefined ||
              fallbackIoffX === null ||
              fallbackIoffX === ""
                ? ""
                : String(fallbackIoffX),
          },
        },
      };
    });
  }, [
    analysisActiveFileId,
    analysisSettings?.ionIoffManualIoffX,
    analysisSettings?.ionIoffManualIonX,
    ionIoffManualTargetsByFileId,
    processedData,
    setIonIoffManualTargetsByFileId,
  ]);

  const persistedIonIoffTargetsRef = useRef<string | null>(null);
  useEffect(() => {
    if (!analysisSettingsLoaded) {
      return;
    }

    const serializedTargets = JSON.stringify(ionIoffManualTargetsByFileId);
    if (persistedIonIoffTargetsRef.current === serializedTargets) {
      return;
    }

    persistedIonIoffTargetsRef.current = serializedTargets;
    handleUpdateAnalysisSettings({
      ionIoffManualTargetsByFileId,
    }).catch(() => {});
  }, [
    analysisSettingsLoaded,
    handleUpdateAnalysisSettings,
    ionIoffManualTargetsByFileId,
  ]);

  return {
    analysisActiveFileId,
    analysisFileOptions,
    handleAnalysisFileChange,
    setAnalysisActiveFileId,
  };
};
