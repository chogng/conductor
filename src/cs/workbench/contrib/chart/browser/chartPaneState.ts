import type {
  ChartPane,
  ChartViewInput,
} from "src/cs/workbench/services/chart/common/chartViewInput";
import type { PlotType } from "src/cs/workbench/services/plot/common/plot";
import type { ChartDetailPane } from "src/cs/workbench/services/chart/common/chart";
import type { ChartViewProps } from "src/cs/workbench/contrib/chart/browser/views/chartView";

export const toChartPanelProps = (
  props: ChartViewInput,
  activePlotType: PlotType,
  visibleDetailPanes: readonly ChartDetailPane[],
): ChartViewProps => ({
  ...props,
  activePlotType,
  visiblePanes: toVisiblePanes(visibleDetailPanes),
});

const toVisiblePanes = (
  visibleDetailPanes: readonly ChartDetailPane[],
): readonly ChartPane[] => [
  "chart",
  ...visibleDetailPanes,
];
