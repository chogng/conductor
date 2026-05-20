import { lxAnalysis } from "cogicon";
import {
  lazy,
  Suspense,
  type ComponentType,
  type Dispatch,
  type SetStateAction,
} from "react";
import Card from "cs/base/browser/ui/Card/Card";
import CogIcon from "src/cs/base/browser/ui/CogIcon/cogicon";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import type {
  IonIoffManualTargetsByFileId,
  IonIoffMethod,
  SsManualRanges,
  SsMethod,
} from "src/cs/workbench/contrib/deviceAnalysis/session/analysis-session-context";
import type { OriginPlotOptions } from "./lib/origin/originPlotOptions";
import type { ProcessedEntry, ProcessingStatus } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import { loadAnalysisCharts } from "./loadAnalysisCharts";

type AnalysisChartsLazyProps = {
  processedData: ProcessedEntry[];
  processingStatus?: Partial<ProcessingStatus>;
  activeFileId?: string | null;
  ionIoffMethod?: IonIoffMethod;
  ionIoffManualTargetsByFileId?: IonIoffManualTargetsByFileId;
  onActiveFileIdChange?: (nextFileId: string | null) => void;
  showFileSelect?: boolean;
  setIonIoffMethod?: (next: IonIoffMethod) => void;
  setIonIoffManualTargetsByFileId?: Dispatch<
    SetStateAction<IonIoffManualTargetsByFileId>
  >;
  ssMethod?: SsMethod;
  setSsMethod?: (next: SsMethod) => void;
  ssDiagnosticsEnabled?: boolean;
  setSsDiagnosticsEnabled?: (next: boolean) => void;
  vthDiagnosticsEnabled?: boolean;
  setVthDiagnosticsEnabled?: (next: boolean) => void;
  gmDiagnosticsEnabled?: boolean;
  setGmDiagnosticsEnabled?: (next: boolean) => void;
  ssShowFitLine?: boolean;
  setSsShowFitLine?: (next: boolean) => void;
  ssManualRanges?: SsManualRanges;
  setSsManualRanges?: (next: SsManualRanges) => void;
  originOpenPlotOptions?: OriginPlotOptions;
  onOriginOpenPlotOptionsChange?: (updates: unknown) => Promise<unknown> | void;
};

const AnalysisCharts = lazy(loadAnalysisCharts) as ComponentType<AnalysisChartsLazyProps>;

const AnalysisChartsLoadingFallback = ({ t }: { t: TranslateFn }) => {
  return (
    <Card
      id="analysis-analysis-loading-card"
      variant="fill"
      cta="Device analysis"
      ctaPosition="analysis"
      ctaCopy="loading analysis charts"
      className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-border bg-bg-surface/50 text-text-secondary"
    >
      <CogIcon icon={lxAnalysis} size={48} className="mb-4 opacity-20 animate-pulse" />
      <p className="text-lg font-medium">{t("da_analysis_loading")}</p>
      <p className="text-sm">{t("da_analysis_loading_hint")}</p>
    </Card>
  );
};

type AnalysisPanelProps = AnalysisChartsLazyProps & {
  shouldMountCharts?: boolean;
  t: TranslateFn;
};

const AnalysisPanel = ({
  processedData = [],
  processingStatus,
  activeFileId,
  ionIoffMethod,
  ionIoffManualTargetsByFileId,
  onActiveFileIdChange,
  showFileSelect = true,
  shouldMountCharts = false,
  setIonIoffMethod,
  setIonIoffManualTargetsByFileId,
  setSsDiagnosticsEnabled,
  setVthDiagnosticsEnabled,
  gmDiagnosticsEnabled,
  setGmDiagnosticsEnabled,
  setSsManualRanges,
  setSsMethod,
  setSsShowFitLine,
  ssDiagnosticsEnabled,
  vthDiagnosticsEnabled,
  ssManualRanges,
  ssMethod,
  ssShowFitLine,
  originOpenPlotOptions,
  onOriginOpenPlotOptionsChange,
  t,
}: AnalysisPanelProps) => {
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
              ionIoffMethod={ionIoffMethod}
              ionIoffManualTargetsByFileId={ionIoffManualTargetsByFileId}
              onActiveFileIdChange={onActiveFileIdChange}
              showFileSelect={showFileSelect}
              setIonIoffMethod={setIonIoffMethod}
              setIonIoffManualTargetsByFileId={setIonIoffManualTargetsByFileId}
              ssMethod={ssMethod}
              setSsMethod={setSsMethod}
              ssDiagnosticsEnabled={ssDiagnosticsEnabled}
              setSsDiagnosticsEnabled={setSsDiagnosticsEnabled}
              vthDiagnosticsEnabled={vthDiagnosticsEnabled}
              setVthDiagnosticsEnabled={setVthDiagnosticsEnabled}
              gmDiagnosticsEnabled={gmDiagnosticsEnabled}
              setGmDiagnosticsEnabled={setGmDiagnosticsEnabled}
              ssShowFitLine={ssShowFitLine}
              setSsShowFitLine={setSsShowFitLine}
              ssManualRanges={ssManualRanges}
              setSsManualRanges={setSsManualRanges}
              originOpenPlotOptions={originOpenPlotOptions}
              onOriginOpenPlotOptionsChange={onOriginOpenPlotOptionsChange}
            />
          </Suspense>
        ) : null
      ) : isProcessing ? (
        <Card
          id="analysis-processing-card"
          variant="fill"
          cta="Device analysis"
          ctaPosition="analysis"
          ctaCopy="processing analysis data"
          className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-border bg-bg-surface/50 text-text-secondary"
        >
          <CogIcon icon={lxAnalysis} size={48} className="mb-4 opacity-20 animate-pulse" />
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
          id="analysis-empty-processed-data-card"
          variant="fill"
          cta="Device analysis"
          ctaPosition="analysis"
          ctaCopy="empty processed data"
          className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-border bg-bg-surface/50 text-text-secondary"
        >
          <CogIcon icon={lxAnalysis} size={48} className="mb-4 opacity-20" />
          <p className="text-lg font-medium">{t("da_no_processed_data")}</p>
          <p className="text-sm">{t("da_no_processed_data_hint")}</p>
        </Card>
      )}
    </section>
  );
};

export default AnalysisPanel;
