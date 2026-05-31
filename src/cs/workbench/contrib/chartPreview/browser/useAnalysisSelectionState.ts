import type { IonIoffManualTargetsByFileId } from "src/cs/workbench/contrib/session/analysis-session-context";
import type { AnalysisSettings } from "src/cs/workbench/contrib/settings/settingsShared";
import type { ProcessedEntry } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";

export type AnalysisFileOption = {
  label: string;
  value: string;
};

type StateSetter<T> = (value: T | ((previous: T) => T)) => void;

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
  setIonIoffManualTargetsByFileId: StateSetter<IonIoffManualTargetsByFileId>;
};

export const createAnalysisSelectionState = ({
  analysisSettings,
  analysisSettingsLoaded,
  handleUpdateAnalysisSettings,
  ionIoffManualTargetsByFileId,
  processedData,
  setIonIoffManualTargetsByFileId,
}: UseAnalysisSelectionStateParams) => {
  const analysisFileOptions = getAnalysisFileOptions(processedData);
  let analysisActiveFileId: string | null = analysisFileOptions[0]?.value ?? null;

  const setAnalysisActiveFileId: StateSetter<string | null> = (value) => {
    analysisActiveFileId =
      typeof value === "function"
        ? value(analysisActiveFileId)
        : value;
  };

  const handleAnalysisFileChange = (nextFileId: string | null) => {
    setAnalysisActiveFileId(nextFileId ?? null);
  };

  const fileId = String(analysisActiveFileId ?? "").trim();
  if (fileId) {
    const activeFile =
      processedData.find((entry) => entry?.fileId === fileId) ?? null;
    const defaultSeriesId = String(activeFile?.series?.[0]?.id ?? "").trim();
    const fallbackIonX = analysisSettings?.ionIoffManualIonX;
    const fallbackIoffX = analysisSettings?.ionIoffManualIoffX;

    if (
      defaultSeriesId &&
      !ionIoffManualTargetsByFileId[fileId]?.[defaultSeriesId] &&
      !(
        (fallbackIonX === undefined ||
          fallbackIonX === null ||
          fallbackIonX === "") &&
        (fallbackIoffX === undefined ||
          fallbackIoffX === null ||
          fallbackIoffX === "")
      )
    ) {
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
    }
  }

  if (analysisSettingsLoaded) {
    void handleUpdateAnalysisSettings({
      ionIoffManualTargetsByFileId,
    }).catch(() => {
      // Settings persistence is non-blocking for selection state.
    });
  }

  return {
    get analysisActiveFileId() {
      return analysisActiveFileId;
    },
    analysisFileOptions,
    handleAnalysisFileChange,
    setAnalysisActiveFileId,
  };
};

export const useAnalysisSelectionState = createAnalysisSelectionState;
