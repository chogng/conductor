import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import type { AnalysisPanelProps } from "src/cs/workbench/contrib/chart/browser/analysisPanel";
import type {
  FileId,
  FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";

export type ChartFileOption = {
  readonly fileId: string;
  readonly fileName: string;
};

export const createChartFileOptionsFromRecords = (
  filesById: Record<FileId, FileRecord>,
  fileOrder: readonly FileId[],
): ChartFileOption[] => {
  const seen = new Set<FileId>();
  const options: ChartFileOption[] = [];
  const pushFile = (fileId: FileId): void => {
    if (seen.has(fileId)) {
      return;
    }
    seen.add(fileId);

    const file = filesById[fileId];
    if (!file || !hasAnalysisData(file)) {
      return;
    }

    options.push({
      fileId,
      fileName: String(file.raw.fileName ?? fileId),
    });
  };

  for (const fileId of fileOrder) {
    pushFile(fileId);
  }
  for (const fileId of Object.keys(filesById)) {
    pushFile(fileId);
  }

  return options;
};

export const resolveChartFileOptions = ({
  chartFileOptions,
}: AnalysisPanelProps): ChartFileOption[] => {
  if (chartFileOptions?.length) {
    return [...chartFileOptions];
  }

  return [];
};

export const resolveActiveChartFileOption = (
  props: AnalysisPanelProps,
): ChartFileOption | null => {
  const options = resolveChartFileOptions(props);
  const normalizedActiveFileId = String(props.activeFileId ?? "").trim();
  return (
    options.find((option) => option.fileId === normalizedActiveFileId) ??
    options[0] ??
    null
  );
};

export const createFileSelect = (
  props: AnalysisPanelProps,
  activeFile: ChartFileOption,
  store: DisposableStore,
): HTMLSelectElement => {
  const select = document.createElement("select");
  select.className = "chart_view_file_select dropdown-field dropdown-field--sm";
  select.value = activeFile.fileId;
  for (const file of resolveChartFileOptions(props)) {
    const fileId = file.fileId;
    if (!fileId) {
      continue;
    }

    const option = document.createElement("option");
    option.value = fileId;
    option.textContent = file.fileName.replace(/\.csv$/i, "");
    select.append(option);
  }
  store.add(addDisposableListener(select, EventType.CHANGE, () => {
    props.onActiveFileIdChange?.(select.value || null);
  }));
  return select;
};

const hasAnalysisData = (file: FileRecord): boolean =>
  file.seriesOrder.length > 0 ||
  Object.values(file.curvesByKey).some((curve) => curve.curveGeneration === "base");
