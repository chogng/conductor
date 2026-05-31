import type {
  ScrollbarMetrics,
  ScrollbarOrientation,
} from "src/cs/base/browser/ui/scrollbar/scrollbarOptions";

export const isScrollbarVisible = (
  metrics: ScrollbarMetrics,
  orientation: ScrollbarOrientation,
): boolean => orientation === "y" ? metrics.showY : metrics.showX;

