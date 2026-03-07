import { lazy, Suspense } from "react";
import { BarChart2 } from "lucide-react";
import Card from "../../../components/ui/Card";

const AnalysisCharts = lazy(() => import("./AnalysisCharts"));

const AnalysisChartsLoadingFallback = ({ t }) => {
  return (
    <Card
      id="device-analysis-analysis-loading-card"
      variant="fill"
      cta="Device analysis"
      ctaPosition="analysis"
      ctaCopy="loading analysis charts"
      className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-border bg-bg-surface/50 text-text-secondary"
    >
      <BarChart2 size={48} className="mb-4 opacity-20 animate-pulse" />
      <p className="text-lg font-medium">{t("da_analysis_loading")}</p>
      <p className="text-sm">{t("da_analysis_loading_hint")}</p>
    </Card>
  );
};

const DeviceAnalysisAnalysisPanel = ({
  processedData = [],
  processingStatus,
  shouldMountCharts = false,
  setSsDiagnosticsEnabled,
  setSsIdWindow,
  setSsManualRanges,
  setSsMethod,
  setSsShowFitLine,
  ssDiagnosticsEnabled,
  ssIdWindow,
  ssManualRanges,
  ssMethod,
  ssShowFitLine,
  t,
}) => {
  const hasProcessedData = processedData.length > 0;
  const shouldRenderCharts = hasProcessedData && shouldMountCharts;

  return (
    <section aria-label={t("da_analysis_visualization")} className="h-full flex flex-col">
      {hasProcessedData ? (
        shouldRenderCharts ? (
          <Suspense fallback={<AnalysisChartsLoadingFallback t={t} />}>
            <AnalysisCharts
              processedData={processedData}
              processingStatus={processingStatus}
              ssMethod={ssMethod}
              setSsMethod={setSsMethod}
              ssDiagnosticsEnabled={ssDiagnosticsEnabled}
              setSsDiagnosticsEnabled={setSsDiagnosticsEnabled}
              ssShowFitLine={ssShowFitLine}
              setSsShowFitLine={setSsShowFitLine}
              ssIdWindow={ssIdWindow}
              setSsIdWindow={setSsIdWindow}
              ssManualRanges={ssManualRanges}
              setSsManualRanges={setSsManualRanges}
            />
          </Suspense>
        ) : null
      ) : (
        <Card
          id="device-analysis-empty-processed-data-card"
          variant="fill"
          cta="Device analysis"
          ctaPosition="analysis"
          ctaCopy="empty processed data"
          className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-border bg-bg-surface/50 text-text-secondary"
        >
          <BarChart2 size={48} className="mb-4 opacity-20" />
          <p className="text-lg font-medium">{t("da_no_processed_data")}</p>
          <p className="text-sm">{t("da_no_processed_data_hint")}</p>
        </Card>
      )}
    </section>
  );
};

export default DeviceAnalysisAnalysisPanel;
