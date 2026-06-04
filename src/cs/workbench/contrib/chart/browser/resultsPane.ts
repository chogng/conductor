import { localize } from "src/cs/nls";

import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import { LxIcon } from "src/cs/base/common/lxicon";
import SidebarPart from "src/cs/workbench/browser/parts/sidebar/sidebarPart";
import type {
  WorkbenchSidebarAction,
  WorkbenchSidebarHeaderAction,
} from "src/cs/workbench/browser/parts/sidebar/sidebarPart";
import { buildPoints } from "src/cs/workbench/contrib/plot/browser/chartViewModel";
import {
  computeCentralDerivative,
  computeSubthresholdSwingFitAuto,
} from "src/cs/workbench/contrib/diagnostics/common/analysisMath";
import {
  computeBaseCurrentMetrics,
  isTransferLikeFile,
} from "src/cs/workbench/contrib/diagnostics/common/metrics";
import type {
  OriginCurveExportSeriesOption,
  OriginExportContentOption,
} from "src/cs/workbench/contrib/export/browser/OriginExportToolbar";
import { getWorkbenchContribution } from "src/cs/workbench/common/contributions";
import type { ExportContribution } from "src/cs/workbench/contrib/export/browser/export.contribution";
import type {
  OriginCanvasExportScope,
  OriginCurveExportMode,
  OriginFilteredCanvasKind,
} from "src/cs/workbench/contrib/export/browser/originCanvasExport";
import type {
  OriginExportContentKey,
  OriginExportMode,
} from "src/cs/workbench/contrib/export/common/originSelectionExport";
import { ExportContributionId } from "src/cs/workbench/contrib/export/common/export";
import { ResultsViewId } from "src/cs/workbench/contrib/chart/common/chart";
import PlotSettingsView from "src/cs/workbench/contrib/origin/browser/PlotSettingsView";
import type { OriginPlotOptions } from "src/cs/workbench/contrib/origin/common/originPlotOptions";
import type { PlotAxisSettings } from "src/cs/workbench/contrib/plot/common/plotAxisSettings";
import type { ParametersContribution } from "src/cs/workbench/contrib/parameters/browser/parameters.contribution";
import { ParametersContributionId } from "src/cs/workbench/contrib/parameters/common/parameters";
import type { CalculatedParameterRowData } from "src/cs/workbench/contrib/parameters/browser/parametersModel";
import type {
  CleanedEntry,
  CleanedSeries,
} from "src/cs/workbench/contrib/session/common/sessionTypes";

import "src/cs/workbench/contrib/export/browser/media/export.css";
import "src/cs/workbench/contrib/parameters/browser/media/parametersView.css";
import "src/cs/workbench/contrib/chart/browser/media/resultsPane.css";

export type ResultsPaneProps = {
  readonly activeFileId?: string | null;
  readonly cleanedData: CleanedEntry[];
  readonly onPlotAxisSettingsChange?: (updates: Record<string, unknown>) => void | Promise<void>;
  readonly onOriginOpenPlotOptionsChange?: (updates: Partial<OriginPlotOptions>) => void | Promise<void>;
  readonly originOpenPlotOptions?: OriginPlotOptions;
  readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
};

type DerivativePoint = {
  x?: unknown;
  y?: unknown;
};

type SsFit = {
  ok?: unknown;
  ss?: unknown;
  x1?: unknown;
  x2?: unknown;
};

type SsFitResult = {
  strict?: SsFit;
  suggested?: SsFit;
};

type ResultsPaneView = "export" | "settings" | "parameters";

const ORIGIN_EXPORT_CONTENT_OPTIONS: OriginExportContentOption[] = [
  { group: "basic", key: "iv", labelKey: "da_origin_export_content_iv" },
  { group: "derived", key: "metrics", labelKey: "da_origin_export_content_metrics" },
  { group: "derived", key: "gm", labelKey: "da_origin_export_content_gm" },
  { group: "derived", key: "ss", labelKey: "da_origin_export_content_ss" },
  { group: "derived", key: "vth", labelKey: "da_origin_export_content_vth" },
];

export class ResultsPane extends ViewPane {
  private readonly content = document.createElement("div");
  private readonly exportContribution: ExportContribution;
  private readonly parametersContribution: ParametersContribution;
  private readonly plotSettingsView = new PlotSettingsView();
  private readonly sidebarPart: SidebarPart;
  private props: ResultsPaneProps;
  private activeView: ResultsPaneView = "export";
  private originMode: OriginExportMode = "merged";
  private canvasScope: OriginCanvasExportScope = "current";
  private filteredKind: OriginFilteredCanvasKind = "output";
  private curveMode: OriginCurveExportMode = "all";
  private selectedContentKeys: OriginExportContentKey[] = ["iv"];
  private selectedCurveKeys = new Set<string>();

  constructor(props: ResultsPaneProps) {
    super({
      id: ResultsViewId,
      title: localize("analysis.visualization", "Analysis & Visualization"),
      className: "results-view-pane",
      bodyClassName: "workbench-part-view-pane__body",
      headerVisible: false,
    });
    this.props = props;
    this.content.className = "results_pane";
    this.exportContribution = getWorkbenchContribution<ExportContribution>(ExportContributionId);
    this.parametersContribution = getWorkbenchContribution<ParametersContribution>(ParametersContributionId);
    this.exportContribution.element.className = "results_pane_body";
    this.parametersContribution.element.className = "results_pane_body results_pane_body--scroll";
    this.sidebarPart = new SidebarPart(this.getSidebarOptions(props));
    this.body.append(this.sidebarPart.element);
  }

  public update(props: ResultsPaneProps): void {
    this.props = props;
    this.sidebarPart.update(this.getSidebarOptions(props));
  }

  public dispose(): void {
    this.plotSettingsView.dispose();
    this.sidebarPart.dispose();
    this.content.replaceChildren();
    super.dispose();
  }

  private getSidebarOptions(props: ResultsPaneProps) {
    this.render(props);

    return {
      ariaLabel: localize("analysis.visualization", "Analysis & Visualization"),
      children: this.content,
      className: "results_sidebar_part",
      headerActions: this.createHeaderActions(props),
      onAction: (action: WorkbenchSidebarAction) => this.handleHeaderAction(action),
      title: localize("analysis.visualization", "Analysis & Visualization"),
    };
  }

  private render(props: ResultsPaneProps): void {
    const activeFile = resolveActiveFile(props);
    this.content.replaceChildren();

    if (!activeFile) {
      this.renderSettingsPane(props);
      this.content.append(this.createEmptyActivePane());
      return;
    }

    this.syncCurveSelection(activeFile);
    this.renderExportPane(props, activeFile);
    this.renderSettingsPane(props);
    this.renderParametersPane(props, activeFile);
    this.content.append(this.createActivePane(props));
  }

  private createHeaderActions(props: ResultsPaneProps): WorkbenchSidebarHeaderAction[] {
    return [
      this.createHeaderAction(
        "export",
        localize("analysis.results.export", "Export"),
        LxIcon.origin.render(),
      ),
      this.createHeaderAction(
        "parameters",
        localize("analysis.results.parameters", "Parameters"),
        LxIcon.listUnordered.render(),
      ),
      this.createHeaderAction(
        "settings",
        localize("da_chart_curve_settings_title", "Curve Settings"),
        LxIcon.settings.render(),
      ),
    ];
  }

  private createHeaderAction(
    view: ResultsPaneView,
    title: string,
    icon: string,
  ): WorkbenchSidebarHeaderAction {
    return {
      id: `results-pane.${view}`,
      title,
      icon,
      isActive: this.activeView === view,
      kind: "icon",
    };
  }

  private handleHeaderAction(action: WorkbenchSidebarAction): void {
    const view = getActionView(action.id);
    if (!view || view === this.activeView) {
      return;
    }

    this.activeView = view;
    this.update(this.props);
  }

  private createActivePane(props: ResultsPaneProps): HTMLElement {
    switch (this.activeView) {
      case "parameters":
        return this.createPane(
          localize("analysis.results.parameters", "Parameters"),
          this.parametersContribution.element,
          "results_pane_section--fill",
        );
      case "settings":
        return this.createPane(
          localize("da_chart_curve_settings_title", "Curve Settings"),
          this.plotSettingsView.element,
          "results_pane_section--fill",
        );
      case "export":
      default:
        return this.createPane(
          localize("analysis.results.export", "Export"),
          this.exportContribution.element,
        );
    }
  }

  private createEmptyActivePane(): HTMLElement {
    switch (this.activeView) {
      case "parameters":
        return this.createPane(
          localize("analysis.results.parameters", "Parameters"),
          createEmptyState(localize("da_no_processed_data", "No Processed Data")),
          "results_pane_section--fill",
        );
      case "settings":
        return this.createPane(
          localize("da_chart_curve_settings_title", "Curve Settings"),
          this.plotSettingsView.element,
          "results_pane_section--fill",
        );
      case "export":
      default:
        return this.createPane(
          localize("analysis.results.export", "Export"),
          createEmptyState(localize("da_no_processed_data", "No Processed Data")),
          "results_pane_section--fill",
        );
    }
  }

  private renderExportPane(
    props: ResultsPaneProps,
    activeFile: CleanedEntry,
  ): void {
    this.exportContribution.render({
      curveOptions: createOriginCurveOptions(activeFile),
      hasMixedExportYScales: false,
      mode: this.originMode,
      onExportOriginZip: () => undefined,
      onModeChange: (next) => {
        this.originMode = next;
      },
      onOpenInOrigin: () => undefined,
      onSelectedCurveOptionKeysChange: (nextKeys) => {
        this.selectedCurveKeys = new Set(nextKeys);
      },
      originCanvasExportScope: this.canvasScope,
      originExportContentOptions: ORIGIN_EXPORT_CONTENT_OPTIONS,
      originFilteredCanvasKind: this.filteredKind,
      replaceMatchingOriginSeriesAcrossFiles: () => ({
        matchedFileCount: 0,
        matchedSeriesCount: 0,
      }),
      resolvedCurveExportMode: this.curveMode,
      scopedFileIds: activeFile.fileId ? [activeFile.fileId] : [],
      selectedContentKeys: this.selectedContentKeys,
      selectedCurveOptionKeySet: this.selectedCurveKeys,
      setContentKeys: (next) => {
        this.selectedContentKeys =
          typeof next === "function" ? next(this.selectedContentKeys) : next;
      },
      setOriginCanvasExportScope: (next) => {
        this.canvasScope =
          typeof next === "function" ? next(this.canvasScope) : next;
      },
      setOriginFilteredCanvasKind: (next) => {
        this.filteredKind =
          typeof next === "function" ? next(this.filteredKind) : next;
      },
      setResolvedCurveExportMode: (next) => {
        this.curveMode = next;
      },
      showFilteredCanvasKindSelect: true,
    });
  }

  private renderParametersPane(
    props: ResultsPaneProps,
    activeFile: CleanedEntry,
  ): void {
    this.parametersContribution.renderParameters({
      gmMetricHeader: "gm",
      rows: createParameterRows(activeFile),
      showTransferMetrics: isTransferLikeFile(activeFile),
    });
  }

  private renderSettingsPane(props: ResultsPaneProps): void {
    this.plotSettingsView.update({
      axisSettings: props.plotAxisSettings,
      onAxisChange: props.onPlotAxisSettingsChange,
      onChange: props.onOriginOpenPlotOptionsChange,
      options: props.originOpenPlotOptions,
    });
  }

  private createPane(
    titleText: string,
    body: HTMLElement,
    className?: string,
  ): HTMLElement {
    const section = document.createElement("section");
    section.className = className
      ? `results_pane_section ${className}`
      : "results_pane_section";
    section.append(createSectionTitle(titleText), body);
    return section;
  }

  private syncCurveSelection(activeFile: CleanedEntry): void {
    const curveKeys = new Set(
      createOriginCurveOptions(activeFile).map((option) => option.key),
    );
    this.selectedCurveKeys = new Set(
      this.selectedCurveKeys.size > 0
        ? [...this.selectedCurveKeys].filter((key) => curveKeys.has(key))
        : [...curveKeys],
    );
  }
}

const getActionView = (actionId: string): ResultsPaneView | null => {
  switch (actionId) {
    case "results-pane.export":
      return "export";
    case "results-pane.settings":
      return "settings";
    case "results-pane.parameters":
      return "parameters";
    default:
      return null;
  }
};

const resolveActiveFile = ({
  activeFileId,
  cleanedData,
}: ResultsPaneProps): CleanedEntry | null => {
  const files = Array.isArray(cleanedData) ? cleanedData : [];
  const normalizedActiveFileId = String(activeFileId ?? "").trim();
  return (
    files.find((file) => String(file?.fileId ?? "") === normalizedActiveFileId) ??
    files[0] ??
    null
  );
};

const createOriginCurveOptions = (
  file: CleanedEntry,
): OriginCurveExportSeriesOption[] =>
  (Array.isArray(file?.series) ? file.series : [])
    .map((series, index) => {
      const seriesId = String(series?.id ?? "");
      if (!seriesId) return null;
      return {
        key: seriesId,
        label: String(series?.name ?? `Series ${index + 1}`),
        sourceFileId: String(file?.fileId ?? ""),
        sourceSeriesId: seriesId,
      };
    })
    .filter((option): option is OriginCurveExportSeriesOption => Boolean(option));

const createParameterRows = (
  file: CleanedEntry,
): Array<CalculatedParameterRowData & { id?: unknown }> => {
  const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
  const seriesList = Array.isArray(file?.series) ? file.series : [];
  const showTransferMetrics = isTransferLikeFile(file);

  return seriesList.map((series, index) => {
    const points = buildPoints(xGroups[Number(series?.groupIndex)], series?.y);
    const baseMetrics = computeBaseCurrentMetrics({
      points,
      sourceFile: file,
    });
    const derivative = computeCentralDerivative(points) as DerivativePoint[];
    const gm = resolveMaxAbsPoint(derivative);
    const ssFit = showTransferMetrics
      ? resolveSsFit(computeSubthresholdSwingFitAuto(points))
      : { confidence: "fail", value: null, x: null };

    return {
      currentCandidateWindows: baseMetrics.candidateWindows,
      currentMethod: baseMetrics.method,
      gmMaxAbs: gm.y,
      id: series.id ?? index,
      ion: baseMetrics.ion,
      ionIoff: baseMetrics.ionIoff,
      ionWindow: baseMetrics.ionWindow,
      ioff: baseMetrics.ioff,
      ioffWindow: baseMetrics.ioffWindow,
      jon: null,
      name: resolveSeriesName(series, index),
      ss: ssFit.value,
      ssConfidence: ssFit.confidence,
      thresholdVoltage: null,
      thresholdVoltageElectron: null,
      thresholdVoltageHole: null,
      xAtGmMaxAbs: gm.x,
      xAtIon: baseMetrics.xAtIon,
      xAtIoff: baseMetrics.xAtIoff,
      xAtSs: ssFit.x,
    };
  });
};

const resolveSeriesName = (series: CleanedSeries, index: number): string =>
  String(series?.name ?? `Series ${index + 1}`);

const resolveMaxAbsPoint = (
  points: DerivativePoint[],
): { x: number | null; y: number | null } => {
  let best: { x: number | null; y: number | null } = { x: null, y: null };
  let bestAbs = -1;

  for (const point of Array.isArray(points) ? points : []) {
    const y = Number(point?.y);
    if (!Number.isFinite(y)) continue;
    const abs = Math.abs(y);
    if (abs <= bestAbs) continue;
    const x = Number(point?.x);
    bestAbs = abs;
    best = {
      x: Number.isFinite(x) ? x : null,
      y: abs,
    };
  }

  return best;
};

const resolveSsFit = (
  value: unknown,
): { confidence: string; value: number | null; x: number | null } => {
  const result = isRecord(value) ? (value as SsFitResult) : null;
  const fit = result?.strict?.ok ? result.strict : result?.suggested ?? null;
  const ss = Number(fit?.ss);
  const x1 = Number(fit?.x1);
  const x2 = Number(fit?.x2);

  return {
    confidence: result?.strict?.ok ? "high" : fit?.ok ? "low" : "fail",
    value: Number.isFinite(ss) ? ss : null,
    x: Number.isFinite(x1) && Number.isFinite(x2) ? (x1 + x2) / 2 : null,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const createSectionTitle = (text: string): HTMLElement => {
  const title = document.createElement("h3");
  title.className = "results_section_title";
  title.textContent = text;
  return title;
};

const createEmptyState = (message: string): HTMLElement => {
  const root = document.createElement("div");
  root.className = "results_empty";
  root.textContent = message;
  return root;
};

export default ResultsPane;
