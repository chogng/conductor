import type {
  ChartPane,
  ChartViewInput,
} from "src/cs/workbench/services/chart/common/chartViewInput";
import type { PlotType } from "src/cs/workbench/services/plot/common/plot";
import type { ChartDetailPane } from "src/cs/workbench/services/chart/common/chart";

export const toAnalysisPanelProps = (
  props: ChartViewInput,
  activePlotType: PlotType,
  visibleDetailPanes: readonly ChartDetailPane[],
  hiddenLegendKeys: readonly string[] = [],
  legendLabels: Readonly<Record<string, string>> = {},
): ChartViewInput => ({
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
