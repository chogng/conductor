/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { URI } from "src/cs/base/common/uri";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import {
  CalculationKinds,
  type CalculationKind,
} from "src/cs/workbench/services/calculation/common/calculationTypes";
import type { SeriesId } from "src/cs/workbench/services/calculation/common/calculationRecords";
import type {
  PlotMainRenderModel,
  PlotMainRenderModelSource,
  PlotMainSeries,
} from "src/cs/workbench/services/plot/common/plotModel";
import type { XUnit, YUnit } from "src/cs/workbench/services/plot/common/units";

export const PlotTypes = CalculationKinds;
export const IPlotService = createDecorator<IPlotService>("plotService");

export type PlotType = CalculationKind;

export const isPlotType = (value: unknown): value is PlotType =>
  typeof value === "string" && (PlotTypes as readonly string[]).includes(value);

export type PlotState = {
  readonly axisTitleOverridesByKey: Readonly<Record<string, string>>;
  readonly activePlotType: PlotType;
  readonly hiddenLegendKeysByPlotKey: Readonly<Record<string, readonly SeriesId[]>>;
  readonly legendLabels: Readonly<Record<string, Readonly<Record<SeriesId, string>>>>;
};

export type PlotAxis = "x" | "y";

export type PlotAxisOverrides = {
  readonly xUnit?: string;
  readonly yScale?: "linear" | "log";
  readonly yUnit?: string;
};

export type PlotAxisTitleContext = {
  readonly axis: PlotAxis;
  readonly pane: "chart" | "inspector";
  readonly plotType: PlotType;
  readonly resource: URI;
  readonly sheetId?: string | null;
};

export type PlotTarget = {
  readonly resource: URI;
  readonly sheetId?: string | null;
};

export type PlotCalculatedDataInput = {
  readonly plotType?: PlotType;
} & PlotTarget;

export type PlotSourceModel = PlotMainRenderModelSource & {
  readonly signature: string;
};

export type PlotCalculatedDataPrefetchPriority = "active" | "hover" | "visible" | "recent" | "nearby" | "idle";

export type PlotCalculatedDataCacheChangeEvent = {
  readonly plotType: PlotType;
  readonly resource: URI;
  readonly sheetId?: string | null;
};

export type PlotDisplayModelCacheChangeEvent = {
  readonly pane?: "chart" | "inspector";
  readonly plotType: PlotType;
  readonly resource: URI;
  readonly sheetId?: string | null;
};

export type PlotLegendModel = {
  readonly plotType: PlotType;
  readonly resource: URI;
  readonly seriesList: readonly PlotMainSeries[];
  readonly sheetId?: string | null;
};

export type PlotDisplayModelInput = PlotCalculatedDataInput & {
  readonly hiddenLegendKeys?: readonly string[];
  readonly legendLabels?: Readonly<Record<string, string>>;
};

export type PlotPaneDisplayModel = {
  readonly defaultXAxisTitle: string;
  readonly defaultYAxisTitle: string;
  readonly model: PlotMainRenderModel;
  readonly plotXFactor: number;
  readonly plotXUnitLabel?: string;
  readonly plotYFactor: number;
  readonly plotYUnitLabel?: string;
  readonly xAxisTitle: string;
  readonly xAxisTitleContext: PlotAxisTitleContext;
  readonly yAxisTitle: string;
  readonly yAxisTitleContext: PlotAxisTitleContext;
  readonly yScaleMode: "linear" | "log";
};

type PlotUnitControlModel = {
  readonly resource: URI;
  readonly sheetId?: string | null;
  readonly xUnit: XUnit;
  readonly xUnitOptions: readonly XUnit[];
  readonly yScale: "linear" | "log";
  readonly yUnit: YUnit | null;
  readonly yUnitOptions: readonly YUnit[];
};

export type PlotDisplayModel = {
  readonly chart: PlotPaneDisplayModel;
  readonly inspector: PlotPaneDisplayModel | null;
  readonly plotType: PlotType;
  readonly resource: URI;
  readonly sheetId?: string | null;
  readonly unitControl: PlotUnitControlModel | null;
};

export interface IPlotService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeCalculatedDataCache: Event<PlotCalculatedDataCacheChangeEvent>;
  readonly onDidChangePlotDisplayModelCache: Event<PlotDisplayModelCacheChangeEvent>;
  readonly onDidChangePlotState: Event<PlotState>;

  getState(): PlotState;
  getCachedCalculatedData(input: PlotCalculatedDataInput): PlotSourceModel | null;
  getCachedPlotDisplayModel(input: PlotDisplayModelInput): PlotDisplayModel | null;
  getCachedPlotLegendModel(input: PlotCalculatedDataInput): PlotLegendModel | null;
  getCalculatedData(input: PlotCalculatedDataInput): PlotSourceModel | null;
  getAxisOverrides(target: PlotTarget): PlotAxisOverrides;
  getHiddenLegendKeys(target: PlotTarget, plotType: PlotType, liveLegendKeys: readonly SeriesId[]): readonly SeriesId[];
  getLegendLabels(target: PlotTarget): Readonly<Record<SeriesId, string>>;
  cancelQueuedPlotInspectorDisplayModelPrefetch(): void;
  prefetchPlotInspectorDisplayModel(input: PlotDisplayModelInput, priority: PlotCalculatedDataPrefetchPriority): void;
  prefetchPlotDisplayModel(input: PlotDisplayModelInput, priority: PlotCalculatedDataPrefetchPriority): void;
  prefetchPlotDisplayModels(inputs: readonly PlotDisplayModelInput[], priority: PlotCalculatedDataPrefetchPriority): void;
  setAxisTitleOverride(context: PlotAxisTitleContext, title: string, defaultTitle: string): void;
  setAxisUnit(target: PlotTarget, axis: PlotAxis, unit: XUnit | YUnit): Promise<void>;
  setActivePlotType(plotType: PlotType): void;
  setLegendLabel(target: PlotTarget, seriesId: SeriesId, label: string | null): void;
  toggleHiddenLegendKey(target: PlotTarget, plotType: PlotType, seriesId: SeriesId, liveLegendKeys: readonly SeriesId[]): void;
  setYScale(target: PlotTarget, scale: "linear" | "log"): Promise<void>;
}
