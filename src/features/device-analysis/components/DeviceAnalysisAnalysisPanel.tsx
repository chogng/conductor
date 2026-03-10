import { lazy, Suspense, type ComponentType } from "react";
import { BarChart2 } from "lucide-react";
import Card from "../../../components/ui/Card";
import type { TranslateFn } from "../../../context/language-context";
import type {
  SsIdWindow,
  SsManualRanges,
  SsMethod,
} from "../context/device-analysis-session-context";
import type { OriginPlotOptions } from "../lib/originPlotOptions";
import type { ProcessingStatus } from "../lib/sharedTypes";
import { loadAnalysisCharts } from "./loadAnalysisCharts";

type AnalysisChartsLazyProps = {
  processedData: unknown[];
  processingStatus?: Partial<ProcessingStatus>;
  activeFileId?: string | null;
  onActiveFileIdChange?: (nextFileId: string | null) => void;
  showFileSelect?: boolean;
  ssMethod?: SsMethod;
  setSsMethod?: (next: SsMethod) => void;
  ssDiagnosticsEnabled?: boolean;
  setSsDiagnosticsEnabled?: (next: boolean) => void;
  ssShowFitLine?: boolean;
  setSsShowFitLine?: (next: boolean) => void;
  ssIdWindow?: SsIdWindow;
  setSsIdWindow?: (next: SsIdWindow) => void;
  ssManualRanges?: SsManualRanges;
  setSsManualRanges?: (next: SsManualRanges) => void;
  originOpenPlotOptions?: OriginPlotOptions;
};

const AnalysisCharts = lazy(loadAnalysisCharts) as ComponentType<AnalysisChartsLazyProps>;

const AnalysisChartsLoadingFallback = ({ t }: { t: TranslateFn }) => {
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

type DeviceAnalysisAnalysisPanelProps = AnalysisChartsLazyProps & {
  shouldMountCharts?: boolean;
  t: TranslateFn;
};

const DeviceAnalysisAnalysisPanel = ({
  processedData = [],
  processingStatus,
  activeFileId,
  onActiveFileIdChange,
  showFileSelect = true,
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
  originOpenPlotOptions,
  t,
}: DeviceAnalysisAnalysisPanelProps) => {
  const hasProcessedData = processedData.length > 0;
  const isProcessing = processingStatus?.state === "processing";
  const shouldRenderCharts = hasProcessedData && shouldMountCharts;

  return (
    <section aria-label={t("da_analysis_visualization")} className="h-full flex flex-col">
      {hasProcessedData ? (
        shouldRenderCharts ? (
          <Suspense fallback={<AnalysisChartsLoadingFallback t={t} />}>
            <AnalysisCharts
              processedData={processedData}
              processingStatus={processingStatus}
              activeFileId={activeFileId}
              onActiveFileIdChange={onActiveFileIdChange}
              showFileSelect={showFileSelect}
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
              originOpenPlotOptions={originOpenPlotOptions}
            />
          </Suspense>
        ) : null
      ) : isProcessing ? (
        <Card
          id="device-analysis-processing-card"
          variant="fill"
          cta="Device analysis"
          ctaPosition="analysis"
          ctaCopy="processing analysis data"
          className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-border bg-bg-surface/50 text-text-secondary"
        >
          <BarChart2 size={48} className="mb-4 opacity-20 animate-pulse" />
          <p className="text-lg font-medium">{t("da_analysis_processing")}</p>
          <p className="text-sm">{t("da_analysis_processing_hint")}</p>
          <div className="mt-4 w-full max-w-sm">
            <div className="mb-2 flex items-center justify-between text-xs text-text-secondary">
              <span>
                {t("da_analysis_processing_progress", {
                  processed: processingStatus?.processed ?? 0,
                  total: processingStatus?.total ?? 0,
                })}
              </span>
              <span>
                {Math.min(
                  100,
                  Math.round(
                    ((processingStatus?.processed ?? 0) /
                      Math.max(1, processingStatus?.total ?? 0)) *
                      100,
                  ),
                )}
                %
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-bg-page">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-200"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      ((processingStatus?.processed ?? 0) /
                        Math.max(1, processingStatus?.total ?? 0)) *
                        100,
                    ),
                  )}%`,
                }}
              />
            </div>
          </div>
        </Card>
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
