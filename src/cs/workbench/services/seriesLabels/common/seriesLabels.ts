import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type {
  CleanedEntry,
  CleanedSeries,
} from "src/cs/workbench/contrib/session/common/sessionTypes";

export const ISeriesLabelService = createDecorator<ISeriesLabelService>("seriesLabelService");

export type SeriesLabelChangeEvent = {
  readonly fileId: string;
  readonly label: string | null;
  readonly seriesId: string;
};

export interface ISeriesLabelService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeSeriesLabels: Event<SeriesLabelChangeEvent>;

  getLabel(fileId: string, seriesId: string): string | undefined;
  getLabels(fileId: string): Readonly<Record<string, string>>;
  prune(files: readonly CleanedEntry[]): void;
  resolveLabel(
    file: CleanedEntry | null | undefined,
    series: CleanedSeries | null | undefined,
    index: number,
  ): string;
  setLabel(fileId: string, seriesId: string, label: string | null): void;
}
