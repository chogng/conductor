import { lazy, Suspense, type ComponentType } from "react";
import { jsx } from "react/jsx-runtime";
import type { AnalysisPanelProps } from "src/cs/workbench/contrib/chartPreview/browser/analysisPanel";

const AnalysisPanel = lazy(
  () => import("src/cs/workbench/contrib/chartPreview/browser/analysisPanel"),
) as ComponentType<AnalysisPanelProps>;

const ChartPreviewViewPane = (props: AnalysisPanelProps) =>
  jsx("div", {
    className: "da_page_scroll h-full min-h-0 overflow-hidden p-1 pt-0",
    children: jsx(Suspense, {
      fallback: jsx(DeferredAnalysisFallback, { label: props.t("da_analysis_loading") }),
      children: jsx(AnalysisPanel, props),
    }),
  });

const DeferredAnalysisFallback = ({ label }: { label: string }) =>
  jsx("div", {
    className: "flex h-full w-full items-center justify-center rounded-[20px] border border-border bg-bg-surface/60 text-sm text-text-secondary",
    children: label,
  });

export default ChartPreviewViewPane;
