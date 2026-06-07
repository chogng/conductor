/*
 * Curve metadata owns the real semantic meaning of a curve. These fields are
 * allowed to participate in calculation, parameter extraction, export, and
 * chart rendering. Do not use this type for transient UI choices.
 *
 * Curve data owns the measured or derived points for that same curve. It should
 * stay numeric and should not carry DOM state, selection state, or formatting.
 *
 * Curve view state owns visual-only choices such as legend visibility, color,
 * and display title overrides. Moving a field here means changing it must not
 * change the scientific calculation result.
 */
import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const ICurveMetadataService = createDecorator<ICurveMetadataService>("curveMetadataService");

export type CurveAxis = "x" | "y";

export type CurveKind =
  | "iv"
  | "gm"
  | "ss"
  | "vth"
  | "cv"
  | "cf"
  | "pv"
  | "transfer"
  | "output"
  | "unknown"
  | (string & {});

export type CurveYScale = "linear" | "log";

export type CurveKey = {
  readonly curveId: string;
  readonly fileId: string;
};

export type CurveAxisMetadata = {
  readonly label?: string;
  readonly role?: string;
  readonly unit?: string;
};

export type CurveYAxisMetadata = CurveAxisMetadata & {
  readonly scale?: CurveYScale;
};

export type CurveMetadata = CurveKey & {
  readonly kind: CurveKind;
  readonly sourceFileName?: string;
  readonly templateId?: string;
  readonly x: CurveAxisMetadata;
  readonly y: CurveYAxisMetadata;
};

export type CurvePoint = {
  readonly [key: string]: number | string | null | undefined;
  readonly x: number;
  readonly y: number;
};

export type CurveData = CurveKey & {
  readonly points: readonly CurvePoint[];
  readonly xDomain?: readonly [number, number];
  readonly yDomain?: readonly [number, number];
};

export type CurveViewState = {
  readonly axisTitleOverrides?: Partial<Record<CurveAxis, string>>;
  readonly color?: string;
  readonly hidden?: boolean;
  readonly legendLabel?: string;
};

export type CurveModel = CurveKey & {
  readonly data?: CurveData;
  readonly metadata?: CurveMetadata;
  readonly viewState: CurveViewState;
};

export type CurveMetadataUpdate =
  Partial<Omit<CurveMetadata, "curveId" | "fileId" | "x" | "y">> & {
    readonly x?: Partial<CurveAxisMetadata>;
    readonly y?: Partial<CurveYAxisMetadata>;
  };

export type CurveChangeKind = "data" | "delete" | "metadata" | "prune" | "viewState";

export type CurveChangeEvent = CurveKey & {
  readonly kind: CurveChangeKind;
};

export interface ICurveMetadataService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeCurve: Event<CurveChangeEvent>;

  clearCurve(key: CurveKey): void;
  getCurveData(key: CurveKey): CurveData | undefined;
  getCurveMetadata(key: CurveKey): CurveMetadata | undefined;
  getCurveModel(key: CurveKey): CurveModel | undefined;
  getCurveViewState(key: CurveKey): CurveViewState;
  prune(fileIds: readonly string[]): void;
  setCurveData(data: CurveData): void;
  setCurveMetadata(metadata: CurveMetadata): void;
  updateCurveMetadata(key: CurveKey, updates: CurveMetadataUpdate): void;
  updateCurveViewState(key: CurveKey, updates: CurveViewState): void;
}
