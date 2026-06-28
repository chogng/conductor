/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export type Template = {
  readonly schemaVersion: 1;
  readonly id?: string;
  readonly name: string;
  readonly version: number;
  readonly measurement?: TemplateMeasurementBinding;
  readonly blocks: readonly TemplateBlock[];
  readonly stopOnError: boolean;
  readonly applicability?: TemplateApplicability;
};

export type TemplateMeasurementFamily = "iv" | "cv" | "cf" | "pv" | "it";

export type TemplateIvMode = "transfer" | "output";

export type TemplateItMode =
  | "stability"
  | "transient"
  | "retention"
  | "biasStress"
  | "photoResponse"
  | "generic";

export type TemplateMeasurementBinding = {
  readonly curveFamily: TemplateMeasurementFamily;
  readonly ivMode?: TemplateIvMode | null;
  readonly itMode?: TemplateItMode | null;
};

export type TemplateApplicability = {
  readonly schemaFingerprint?: string;
  readonly columnCount?: number;
};

export type TemplateBlock = {
  readonly rowRange: TemplateRowRange;
  readonly x: TemplateAxisBinding;
  readonly y: TemplateAxisBinding;
  readonly segmentation: TemplateSegmentation;
  readonly legend: TemplateLegend;
  readonly titles?: TemplateTitles;
};

export type TemplateRowRange = {
  readonly startRow: number;
  readonly endRow: number | "end";
};

export type TemplateAxisBinding = {
  readonly columns: readonly number[];
  readonly ranges?: readonly TemplateColumnRange[];
  readonly unit?: string;
};

export type TemplateColumnRange = {
  readonly column: number;
  readonly startRow: number;
  readonly endRow: number | "end";
};

export type TemplateSegmentation =
  | { readonly kind: "auto" }
  | { readonly kind: "none" }
  | { readonly kind: "fixedPoints"; readonly pointsPerGroup: number }
  | { readonly kind: "fixedSegments"; readonly segmentCount: number };

export type TemplateLegend = {
  readonly target: "auto" | "yColumn" | "group";
  readonly prefix?: string;
};

export type TemplateTitles = {
  readonly bottom?: string;
  readonly left?: string;
};
