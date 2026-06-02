export type ChartAxisTitleChangeEvent = {
  axis: "x" | "y";
  title: string;
};

export const createChartAxisTitleChangeEvent = (
  axis: "x" | "y",
  title: unknown,
): ChartAxisTitleChangeEvent => ({
  axis,
  title: String(title ?? "").trim(),
});
