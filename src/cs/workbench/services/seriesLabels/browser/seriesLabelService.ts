import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type {
  CleanedEntry,
  CleanedSeries,
} from "src/cs/workbench/contrib/session/common/sessionTypes";
import {
  ISeriesLabelService,
  type ISeriesLabelService as ISeriesLabelServiceType,
  type SeriesLabelChangeEvent,
} from "src/cs/workbench/services/seriesLabels/common/seriesLabels";

export class SeriesLabelService extends Disposable implements ISeriesLabelServiceType {
  declare readonly _serviceBrand: undefined;

  private readonly onDidChangeSeriesLabelsEmitter = this._register(new Emitter<SeriesLabelChangeEvent>());
  public readonly onDidChangeSeriesLabels = this.onDidChangeSeriesLabelsEmitter.event;

  private labelsByFileId: Record<string, Record<string, string>> = {};

  public getLabel(fileId: string, seriesId: string): string | undefined {
    const normalizedFileId = normalizeId(fileId);
    const normalizedSeriesId = normalizeId(seriesId);
    if (!normalizedFileId || !normalizedSeriesId) {
      return undefined;
    }

    return this.labelsByFileId[normalizedFileId]?.[normalizedSeriesId];
  }

  public getLabels(fileId: string): Readonly<Record<string, string>> {
    const normalizedFileId = normalizeId(fileId);
    return normalizedFileId ? this.labelsByFileId[normalizedFileId] ?? {} : {};
  }

  public setLabel(fileId: string, seriesId: string, label: string | null): void {
    const normalizedFileId = normalizeId(fileId);
    const normalizedSeriesId = normalizeId(seriesId);
    if (!normalizedFileId || !normalizedSeriesId) {
      return;
    }

    const normalizedLabel = String(label ?? "").trim();
    const current = this.labelsByFileId[normalizedFileId] ?? {};
    if ((current[normalizedSeriesId] ?? "") === normalizedLabel) {
      return;
    }

    const next: Record<string, string> = { ...current };
    if (normalizedLabel) {
      next[normalizedSeriesId] = normalizedLabel;
    } else {
      delete next[normalizedSeriesId];
    }

    if (Object.keys(next).length) {
      this.labelsByFileId = {
        ...this.labelsByFileId,
        [normalizedFileId]: next,
      };
    } else {
      const { [normalizedFileId]: _removed, ...rest } = this.labelsByFileId;
      this.labelsByFileId = rest;
    }

    this.onDidChangeSeriesLabelsEmitter.fire({
      fileId: normalizedFileId,
      label: normalizedLabel || null,
      seriesId: normalizedSeriesId,
    });
  }

  public resolveLabel(
    file: CleanedEntry | null | undefined,
    series: CleanedSeries | null | undefined,
    index: number,
  ): string {
    const fileId = normalizeId(file?.fileId);
    const seriesId = normalizeId(series?.id);
    const override = fileId && seriesId
      ? this.labelsByFileId[fileId]?.[seriesId]
      : undefined;
    if (override) {
      return override;
    }

    const legendValue = String(series?.legendValue ?? "").trim();
    if (legendValue) {
      return legendValue;
    }

    const name = String(series?.name ?? "").trim();
    return name || `Series ${index + 1}`;
  }

  public prune(files: readonly CleanedEntry[]): void {
    const liveFileIds = new Set(
      files.map((file) => normalizeId(file.fileId)).filter((fileId): fileId is string => Boolean(fileId)),
    );
    const liveSeriesIdsByFileId = new Map<string, Set<string>>();
    for (const file of files) {
      const fileId = normalizeId(file.fileId);
      if (!fileId) {
        continue;
      }

      liveSeriesIdsByFileId.set(fileId, new Set(
        (Array.isArray(file.series) ? file.series : [])
          .map((series) => normalizeId(series.id))
          .filter((seriesId): seriesId is string => Boolean(seriesId)),
      ));
    }

    for (const [fileId, labels] of Object.entries(this.labelsByFileId)) {
      if (!liveFileIds.has(fileId)) {
        for (const seriesId of Object.keys(labels)) {
          this.setLabel(fileId, seriesId, null);
        }
        continue;
      }

      const liveSeriesIds = liveSeriesIdsByFileId.get(fileId) ?? new Set<string>();
      for (const seriesId of Object.keys(labels)) {
        if (!liveSeriesIds.has(seriesId)) {
          this.setLabel(fileId, seriesId, null);
        }
      }
    }
  }
}

const normalizeId = (value: unknown): string => String(value ?? "").trim();

registerSingleton(ISeriesLabelService, SeriesLabelService, InstantiationType.Delayed);
