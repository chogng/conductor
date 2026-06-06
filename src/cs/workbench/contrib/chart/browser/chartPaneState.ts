import type { AnalysisPanelProps } from "src/cs/workbench/contrib/chart/browser/analysisPanel";
import type { ChartPane } from "src/cs/workbench/contrib/chart/browser/views/chartView";
import type { PlotType } from "src/cs/workbench/contrib/plot/common/plot";

export type ChartDetailPane = "inspector";

export const toggleDetailPane = (
  panes: readonly ChartDetailPane[],
  pane: ChartDetailPane,
): readonly ChartDetailPane[] =>
  panes.includes(pane)
    ? panes.filter((item) => item !== pane)
    : [...panes, pane];

export const sameDetailPanes = (
  left: readonly ChartDetailPane[],
  right: readonly ChartDetailPane[],
): boolean =>
  left.length === right.length && left.every((pane) => right.includes(pane));

export const toAnalysisPanelProps = (
  props: AnalysisPanelProps,
  activePlotType: PlotType,
  visibleDetailPanes: readonly ChartDetailPane[],
  hiddenLegendKeys: readonly string[] = [],
  legendLabels: Readonly<Record<string, string>> = {},
): AnalysisPanelProps => ({
  ...props,
  activePlotType,
  hiddenLegendKeys,
  legendLabels,
  visiblePanes: toVisiblePanes(visibleDetailPanes),
});

const toVisiblePanes = (
  visibleDetailPanes: readonly ChartDetailPane[],
): readonly ChartPane[] => [
  "chart",
  ...visibleDetailPanes,
];
