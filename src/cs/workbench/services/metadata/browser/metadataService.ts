// Browser-side owner for curve metadata, curve data, and visual-only curve state.
// It stores the three layers separately so calculation code never needs to read
// chart UI props, and chart/export/parameters can consume the same curve model.
import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  ICurveMetadataService,
  type CurveChangeEvent,
  type CurveData,
  type CurveKey,
  type CurveMetadata,
  type CurveMetadataUpdate,
  type CurveModel,
  type CurveViewState,
  type ICurveMetadataService as ICurveMetadataServiceType,
} from "src/cs/workbench/services/metadata/common/metadata";

export class CurveMetadataService extends Disposable implements ICurveMetadataServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeCurveEmitter = this._register(new Emitter<CurveChangeEvent>());
  public readonly onDidChangeCurve = this.onDidChangeCurveEmitter.event;

  private dataByKey = new Map<string, CurveData>();
  private metadataByKey = new Map<string, CurveMetadata>();
  private viewStateByKey = new Map<string, CurveViewState>();

  public getCurveMetadata(key: CurveKey): CurveMetadata | undefined {
    return this.metadataByKey.get(getKey(key));
  }

  public setCurveMetadata(metadata: CurveMetadata): void {
    const normalized = normalizeMetadata(metadata);
    if (!normalized) {
      return;
    }

    this.metadataByKey.set(getKey(normalized), normalized);
    this.fire("metadata", normalized);
  }

  public updateCurveMetadata(key: CurveKey, updates: CurveMetadataUpdate): void {
    const normalizedKey = normalizeKey(key);
    if (!normalizedKey) {
      return;
    }

    const current = this.metadataByKey.get(getKey(normalizedKey));
    if (!current) {
      return;
    }

    this.setCurveMetadata({
      ...current,
      ...updates,
      curveId: current.curveId,
      fileId: current.fileId,
      x: {
        ...current.x,
        ...updates.x,
      },
      y: {
        ...current.y,
        ...updates.y,
      },
    });
  }

  public getCurveData(key: CurveKey): CurveData | undefined {
    return this.dataByKey.get(getKey(key));
  }

  public setCurveData(data: CurveData): void {
    const normalized = normalizeData(data);
    if (!normalized) {
      return;
    }

    this.dataByKey.set(getKey(normalized), normalized);
    this.fire("data", normalized);
  }

  public getCurveViewState(key: CurveKey): CurveViewState {
    return this.viewStateByKey.get(getKey(key)) ?? {};
  }

  public updateCurveViewState(key: CurveKey, updates: CurveViewState): void {
    const normalizedKey = normalizeKey(key);
    if (!normalizedKey) {
      return;
    }

    const current = this.viewStateByKey.get(getKey(normalizedKey)) ?? {};
    const next: CurveViewState = {
      ...current,
      ...updates,
      axisTitleOverrides: {
        ...current.axisTitleOverrides,
        ...updates.axisTitleOverrides,
      },
    };
    this.viewStateByKey.set(getKey(normalizedKey), next);
    this.fire("viewState", normalizedKey);
  }

  public getCurveModel(key: CurveKey): CurveModel | undefined {
    const normalizedKey = normalizeKey(key);
    if (!normalizedKey) {
      return undefined;
    }

    const metadata = this.getCurveMetadata(normalizedKey);
    const data = this.getCurveData(normalizedKey);
    const viewState = this.getCurveViewState(normalizedKey);
    if (!metadata && !data && !Object.keys(viewState).length) {
      return undefined;
    }

    return {
      ...normalizedKey,
      data,
      metadata,
      viewState,
    };
  }

  public clearCurve(key: CurveKey): void {
    const normalizedKey = normalizeKey(key);
    if (!normalizedKey) {
      return;
    }

    const id = getKey(normalizedKey);
    const changed =
      this.metadataByKey.delete(id) ||
      this.dataByKey.delete(id) ||
      this.viewStateByKey.delete(id);
    if (changed) {
      this.fire("delete", normalizedKey);
    }
  }

  public prune(fileIds: readonly string[]): void {
    const liveFileIds = new Set(fileIds.map(normalizeId).filter((fileId): fileId is string => Boolean(fileId)));
    const keys = new Set([
      ...this.metadataByKey.keys(),
      ...this.dataByKey.keys(),
      ...this.viewStateByKey.keys(),
    ]);
    for (const key of keys) {
      const fileId = getFileIdFromKey(key);
      if (!liveFileIds.has(fileId)) {
        this.metadataByKey.delete(key);
        this.dataByKey.delete(key);
        this.viewStateByKey.delete(key);
        this.onDidChangeCurveEmitter.fire({
          curveId: getCurveIdFromKey(key),
          fileId,
          kind: "prune",
        });
      }
    }
  }

  private fire(kind: CurveChangeEvent["kind"], key: CurveKey): void {
    this.onDidChangeCurveEmitter.fire({
      curveId: key.curveId,
      fileId: key.fileId,
      kind,
    });
  }
}

const normalizeMetadata = (metadata: CurveMetadata): CurveMetadata | null => {
  const key = normalizeKey(metadata);
  if (!key) {
    return null;
  }

  return {
    ...metadata,
    ...key,
    kind: metadata.kind || "unknown",
    sourceFileName: normalizeOptionalText(metadata.sourceFileName),
    templateId: normalizeOptionalText(metadata.templateId),
    x: normalizeAxisMetadata(metadata.x),
    y: {
      ...normalizeAxisMetadata(metadata.y),
      scale: metadata.y.scale === "log" ? "log" : "linear",
    },
  };
};

const normalizeData = (data: CurveData): CurveData | null => {
  const key = normalizeKey(data);
  if (!key) {
    return null;
  }

  return {
    ...data,
    ...key,
    points: data.points.filter((point) =>
      Number.isFinite(Number(point.x)) &&
      Number.isFinite(Number(point.y)),
    ),
  };
};

const normalizeAxisMetadata = (metadata: { readonly label?: string; readonly role?: string; readonly unit?: string }): {
  readonly label?: string;
  readonly role?: string;
  readonly unit?: string;
} => {
  const label = normalizeOptionalText(metadata.label);
  const role = normalizeOptionalText(metadata.role);
  const unit = normalizeOptionalText(metadata.unit);
  return {
    ...(label ? { label } : {}),
    ...(role ? { role } : {}),
    ...(unit ? { unit } : {}),
  };
};

const normalizeKey = (key: CurveKey): CurveKey | null => {
  const fileId = normalizeId(key.fileId);
  const curveId = normalizeId(key.curveId);
  return fileId && curveId ? { curveId, fileId } : null;
};

const normalizeId = (value: unknown): string => String(value ?? "").trim();

const normalizeOptionalText = (value: unknown): string | undefined => {
  const text = String(value ?? "").trim();
  return text || undefined;
};

const getKey = (key: CurveKey): string => `${key.fileId}:${key.curveId}`;

const getFileIdFromKey = (key: string): string => key.split(":", 1)[0] ?? "";

const getCurveIdFromKey = (key: string): string => key.slice(getFileIdFromKey(key).length + 1);

registerSingleton(ICurveMetadataService, CurveMetadataService, InstantiationType.Delayed);
