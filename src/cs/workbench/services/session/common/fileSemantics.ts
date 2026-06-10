/*
 * File semantics own the real scientific meaning shared by every curve in one
 * imported file. Axis labels, units, scale, source file name, template id, and
 * source curve kind belong here because they participate in calculation,
 * parameter extraction, export, and chart rendering.
 *
 * Curve data owns the measured or derived points for one plotted series. The
 * key is fileId + curveKind + seriesId, using the source series identity
 * directly instead of inventing a second curve id.
 *
 * Series labels own user label overrides for the source series in one file.
 * They are keyed by fileId + seriesId so derived IV/GM/SS/VTH curves reuse the
 * same source label instead of duplicating label state per curve kind.
 *
 * Curve view state owns visual-only choices for one plotted curve, such as
 * legend visibility and color. Moving a field here means changing it must not
 * change the scientific calculation result.
 */

export type CurveAxis = "x" | "y";

export type CurveKind =
  | "iv"
  | "gm"
  | "ss"
  | "vth"
  | "localSs"
  | "thresholdFit"
  | "subthresholdFit"
  | "secondDerivative"
  | "cv"
  | "cf"
  | "pv"
  | "it"
  | "transfer"
  | "output"
  | "unknown";

export type CurveYScale = "linear" | "log";

export type CurveKey = {
  readonly curveKind: CurveKind;
  readonly fileId: string;
  readonly seriesId: string;
};

export type CurveAxisSemantics = {
  readonly label?: string;
  readonly role?: string;
  readonly unit?: string;
};

export type CurveYAxisSemantics = CurveAxisSemantics & {
  readonly scale?: CurveYScale;
};

export type FileSemantics = {
  readonly fileId: string;
  readonly kind?: CurveKind;
  readonly sourceFileName?: string;
  readonly templateId?: string;
  readonly x: CurveAxisSemantics;
  readonly y: CurveYAxisSemantics;
};

export type CurvePoint = {
  readonly [key: string]: number | string | null | undefined;
  readonly x: number;
  readonly y: number;
};

export type CurveData = CurveKey & {
  readonly points: readonly CurvePoint[];
  readonly signature?: string;
  readonly xDomain?: readonly [number, number];
  readonly yDomain?: readonly [number, number];
};

export type FileSemanticsUpdate =
  Partial<Omit<FileSemantics, "fileId" | "x" | "y">> & {
    readonly x?: Partial<CurveAxisSemantics>;
    readonly y?: Partial<CurveYAxisSemantics>;
  };


