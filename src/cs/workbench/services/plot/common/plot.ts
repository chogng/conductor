/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import {
  CalculationKinds,
  type CalculationKind,
} from "src/cs/workbench/services/calculation/common/calculationTypes";
import type { CalculatedData } from "src/cs/workbench/services/calculation/common/calculationReadModel";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import type {
  FileId,
  SeriesId,
} from "src/cs/workbench/services/session/common/sessionModel";
import type {
  PlotMainRenderModel,
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
  readonly legendLabelsByFileId: Readonly<Record<FileId, Readonly<Record<SeriesId, string>>>>;
};

export type PlotAxisTitlePane = "chart" | "inspector";
export type PlotAxis = "x" | "y";

export type PlotFileAxisSettings = {
  readonly xUnitByFileId: Readonly<Record<FileId, string>>;
  readonly yScaleByFileId: Readonly<Record<FileId, "linear" | "log">>;
  readonly yUnitByFileId: Readonly<Record<FileId, string>>;
};

export type PlotAxisTitleContext = {
  readonly axis: PlotAxis;
  readonly fileId: FileId;
  readonly pane: PlotAxisTitlePane;
  readonly plotType: PlotType;
};

export type PlotCalculatedDataInput = {
  readonly fileId?: FileId | null;
  readonly plotType?: PlotType;
  readonly snapshot?: SessionSnapshot;
};

export type PlotCalculatedDataPrefetchPriority = "active" | "hover" | "visible" | "recent" | "nearby" | "idle";

export type PlotCalculatedDataCacheChangeEvent = {
  readonly fileId: FileId;
  readonly plotType: PlotType;
};

export type PlotDisplayModelCacheChangeEvent = {
  readonly fileId: FileId;
  readonly pane?: "chart" | "inspector";
  readonly plotType: PlotType;
};

export type PlotMainRenderModelInput = PlotCalculatedDataInput;

export type PlotLegendModel = {
  readonly fileId: FileId;
  readonly plotType: PlotType;
  readonly seriesList: readonly PlotMainSeries[];
};

export type PlotDisplayModelRequest = {
  readonly hiddenLegendKeys?: readonly string[];
  readonly legendLabels?: Readonly<Record<string, string>>;
};

export type PlotDisplayModelInput = PlotCalculatedDataInput &
  PlotDisplayModelRequest;

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

export type PlotUnitControlModel = {
  readonly fileId: FileId;
  readonly xUnit: XUnit;
  readonly xUnitOptions: readonly XUnit[];
  readonly yScale: "linear" | "log";
  readonly yUnit: YUnit | null;
  readonly yUnitOptions: readonly YUnit[];
};

export type PlotDisplayModel = {
  readonly chart: PlotPaneDisplayModel;
  readonly fileId: FileId;
  readonly inspector: PlotPaneDisplayModel | null;
  readonly plotType: PlotType;
  readonly unitControl: PlotUnitControlModel | null;
};

export interface IPlotService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeCalculatedDataCache: Event<PlotCalculatedDataCacheChangeEvent>;
  readonly onDidChangePlotDisplayModelCache: Event<PlotDisplayModelCacheChangeEvent>;
  readonly onDidChangePlotState: Event<PlotState>;

  getState(): PlotState;
  getCachedCalculatedData(input: PlotCalculatedDataInput): CalculatedData | null;
  getCachedPlotDisplayModel(input: PlotDisplayModelInput): PlotDisplayModel | null;
  getCachedPlotInspectorDisplayModel(input: PlotDisplayModelInput): PlotPaneDisplayModel | null;
  getCachedPlotLegendModel(input: PlotCalculatedDataInput): PlotLegendModel | null;
  getCalculatedData(input: PlotCalculatedDataInput): CalculatedData | null;
  getFileAxisSettings(snapshot: SessionSnapshot): PlotFileAxisSettings;
  getLegendLabels(fileId: FileId): Readonly<Record<SeriesId, string>>;
  getPlotDisplayModel(input: PlotDisplayModelInput): PlotDisplayModel | null;
  getPlotLegendModel(input: PlotCalculatedDataInput): PlotLegendModel | null;
  getPlotMainRenderModel(input: PlotMainRenderModelInput): PlotMainRenderModel | null;
  prefetchCalculatedData(fileIds: readonly FileId[], priority: PlotCalculatedDataPrefetchPriority, plotType?: PlotType): void;
  prefetchPlotInspectorDisplayModel(input: PlotDisplayModelInput, priority: PlotCalculatedDataPrefetchPriority): void;
  prefetchPlotDisplayModel(input: PlotDisplayModelInput, priority: PlotCalculatedDataPrefetchPriority): void;
  prefetchPlotDisplayModels(inputs: readonly PlotDisplayModelInput[], priority: PlotCalculatedDataPrefetchPriority): void;
  setAxisTitleOverride(context: PlotAxisTitleContext, title: string, defaultTitle: string): void;
  setAxisUnit(fileId: FileId, axis: PlotAxis, unit: XUnit | YUnit): Promise<void>;
  setActivePlotType(plotType: PlotType): void;
  setLegendLabel(fileId: FileId, seriesId: SeriesId, label: string | null): void;
  setYScale(fileId: FileId, scale: "linear" | "log"): Promise<void>;
}
