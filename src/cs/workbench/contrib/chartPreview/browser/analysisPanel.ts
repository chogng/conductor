import { jsx, jsxs } from "react/jsx-runtime";
import { lxAnalysis } from "cogicon";
import { lazy, Suspense, type ComponentType, type Dispatch, type SetStateAction, } from "react";
import Card from "cs/base/browser/ui/card/card";
import CogIcon from "src/cs/base/browser/ui/cogIcon/cogIcon";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import type { IonIoffManualTargetsByFileId, IonIoffMethod, SsManualRanges, SsMethod, } from "src/cs/workbench/contrib/session/analysis-session-context";
import type { OriginPlotOptions } from "src/cs/workbench/contrib/origin/common/originPlotOptions";
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
    setIonIoffManualTargetsByFileId?: Dispatch<SetStateAction<IonIoffManualTargetsByFileId>>;
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
const AnalysisChartsLoadingFallback = ({ t }: {
    t: TranslateFn;
}) => {
    return (jsxs(Card, {
        id: "analysis-analysis-loading-card",
        variant: "fill",
        cta: "Device analysis",
        ctaPosition: "analysis",
        ctaCopy: "loading analysis charts",
        className: "flex-1 flex flex-col items-center justify-center border-2 border-dashed border-border bg-bg-surface/50 text-text-secondary",
        children: [
            jsx(CogIcon, {
                icon: lxAnalysis,
                size: 48,
                className: "mb-4 opacity-20 animate-pulse"
            }),
            jsx("p", {
                className: "text-lg font-medium",
                children: t("da_analysis_loading")
            }),
            jsx("p", {
                className: "text-sm",
                children: t("da_analysis_loading_hint")
            })
        ]
    }));
};
export type AnalysisPanelProps = AnalysisChartsLazyProps & {
    shouldMountCharts?: boolean;
    t: TranslateFn;
};
const AnalysisPanel = ({ processedData = [], processingStatus, activeFileId, ionIoffMethod, ionIoffManualTargetsByFileId, onActiveFileIdChange, showFileSelect = true, shouldMountCharts = false, setIonIoffMethod, setIonIoffManualTargetsByFileId, setSsDiagnosticsEnabled, setVthDiagnosticsEnabled, gmDiagnosticsEnabled, setGmDiagnosticsEnabled, setSsManualRanges, setSsMethod, setSsShowFitLine, ssDiagnosticsEnabled, vthDiagnosticsEnabled, ssManualRanges, ssMethod, ssShowFitLine, originOpenPlotOptions, onOriginOpenPlotOptionsChange, t, }: AnalysisPanelProps) => {
    const hasProcessedData = processedData.length > 0;
    const isProcessing = processingStatus?.state === "processing";
    const shouldRenderCharts = hasProcessedData && shouldMountCharts;
    return (jsx("section", {
        "aria-label": t("da_analysis_visualization"),
        className: "h-full flex flex-col",
        children: hasProcessedData ? (shouldRenderCharts ? (jsx(Suspense, {
            fallback: jsx(AnalysisChartsLoadingFallback, {
                t: t
            }),
            children: jsx(AnalysisCharts, {
                processedData: processedData,
                processingStatus: processingStatus,
                activeFileId: activeFileId,
                ionIoffMethod: ionIoffMethod,
                ionIoffManualTargetsByFileId: ionIoffManualTargetsByFileId,
                onActiveFileIdChange: onActiveFileIdChange,
                showFileSelect: showFileSelect,
                setIonIoffMethod: setIonIoffMethod,
                setIonIoffManualTargetsByFileId: setIonIoffManualTargetsByFileId,
                ssMethod: ssMethod,
                setSsMethod: setSsMethod,
                ssDiagnosticsEnabled: ssDiagnosticsEnabled,
                setSsDiagnosticsEnabled: setSsDiagnosticsEnabled,
                vthDiagnosticsEnabled: vthDiagnosticsEnabled,
                setVthDiagnosticsEnabled: setVthDiagnosticsEnabled,
                gmDiagnosticsEnabled: gmDiagnosticsEnabled,
                setGmDiagnosticsEnabled: setGmDiagnosticsEnabled,
                ssShowFitLine: ssShowFitLine,
                setSsShowFitLine: setSsShowFitLine,
                ssManualRanges: ssManualRanges,
                setSsManualRanges: setSsManualRanges,
                originOpenPlotOptions: originOpenPlotOptions,
                onOriginOpenPlotOptionsChange: onOriginOpenPlotOptionsChange
            })
        })) : null) : isProcessing ? (jsxs(Card, {
            id: "analysis-processing-card",
            variant: "fill",
            cta: "Device analysis",
            ctaPosition: "analysis",
            ctaCopy: "processing analysis data",
            className: "flex-1 flex flex-col items-center justify-center border-2 border-dashed border-border bg-bg-surface/50 text-text-secondary",
            children: [
                jsx(CogIcon, {
                    icon: lxAnalysis,
                    size: 48,
                    className: "mb-4 opacity-20 animate-pulse"
                }),
                jsx("p", {
                    className: "text-lg font-medium",
                    children: t("da_analysis_processing")
                }),
                jsx("p", {
                    className: "text-sm",
                    children: t("da_analysis_processing_hint")
                }),
                jsxs("div", {
                    className: "mt-4 w-full max-w-sm",
                    children: [
                        jsxs("div", {
                            className: "mb-2 flex items-center justify-between text-xs text-text-secondary",
                            children: [
                                jsx("span", {
                                    children: t("da_analysis_processing_progress", {
                                        processed: processingStatus?.processed ?? 0,
                                        total: processingStatus?.total ?? 0,
                                    })
                                }),
                                jsxs("span", {
                                    children: [
                                        Math.min(100, Math.round(((processingStatus?.processed ?? 0) /
                                            Math.max(1, processingStatus?.total ?? 0)) *
                                            100)),
                                        "%"
                                    ]
                                })
                            ]
                        }),
                        jsx("div", {
                            className: "h-2 overflow-hidden rounded-full bg-bg-page",
                            children: jsx("div", {
                                className: "h-full rounded-full bg-accent transition-[width] duration-200",
                                style: {
                                    width: `${Math.min(100, Math.round(((processingStatus?.processed ?? 0) /
                                        Math.max(1, processingStatus?.total ?? 0)) *
                                        100))}%`,
                                }
                            })
                        })
                    ]
                })
            ]
        })) : (jsxs(Card, {
            id: "analysis-empty-processed-data-card",
            variant: "fill",
            cta: "Device analysis",
            ctaPosition: "analysis",
            ctaCopy: "empty processed data",
            className: "flex-1 flex flex-col items-center justify-center border-2 border-dashed border-border bg-bg-surface/50 text-text-secondary",
            children: [
                jsx(CogIcon, {
                    icon: lxAnalysis,
                    size: 48,
                    className: "mb-4 opacity-20"
                }),
                jsx("p", {
                    className: "text-lg font-medium",
                    children: t("da_no_processed_data")
                }),
                jsx("p", {
                    className: "text-sm",
                    children: t("da_no_processed_data_hint")
                })
            ]
        }))
    }));
};
export default AnalysisPanel;
