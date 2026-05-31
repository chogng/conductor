import { useCallback, useEffect, useLayoutEffect, lazy, useMemo, useRef, useState, Suspense, } from "react";
import { createPortal } from "react-dom";
import { jsx, jsxs } from "react/jsx-runtime";
import Toast from "src/cs/base/browser/ui/toast/toast";
import type { TranslationVars } from "src/cs/platform/language/common/language";
import { loadAnalysisCharts } from "src/cs/workbench/contrib/chartPreview/browser/loadAnalysisCharts";
import { getExtractionErrorMessage } from "src/cs/workbench/common/deviceAnalysis/utils";
import DataViewPane from "src/cs/workbench/contrib/data/browser/dataViewPane";
import type { ImporterRef } from "src/cs/workbench/contrib/import/browser/importerView";
import ImporterViewletHost from "src/cs/workbench/contrib/workspace/ImporterViewletHost";
import { useWorkbenchLayoutNavigation, } from "src/cs/workbench/browser/layout";
import { createPanePart, createScrollPanePart, createWorkbenchParts, } from "src/cs/workbench/browser/part";
import { useLanguage } from "src/cs/workbench/browser/hooks/useLanguage";
import { useTheme } from "src/cs/workbench/browser/hooks/useTheme";
import type { ToastType } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import { useExports } from "src/cs/workbench/contrib/export/browser/useExports";
import { useDesktopShell } from "src/cs/workbench/contrib/desktop/useDesktopShell";
import { createIdleOnboardingState, type OnboardingControllerState, } from "src/cs/workbench/contrib/onboarding/onboardingState";
import { usePreview } from "src/cs/workbench/contrib/tablePreview/usePreview";
import { useProcessing } from "src/cs/workbench/contrib/data/useProcessing";
import { loadOnboarding, loadOnboardingController, } from "src/cs/workbench/contrib/onboarding/onboardingLoader";
import { useAnalysisSelectionState } from "src/cs/workbench/contrib/workspace/useAnalysisSelectionState";
import { useOnboardingLauncher } from "src/cs/workbench/contrib/onboarding/useOnboardingLauncher";
import { useSession } from "src/cs/workbench/contrib/session/useSession";
import { useSessionActions } from "src/cs/workbench/contrib/session/useSessionActions";
import { CoreSettingsController, createCoreSettingsState, type CoreSettingsControllerOptions, } from "src/cs/workbench/contrib/settings/browser/coreSettingsController";
import WorkbenchLayout from "src/cs/workbench/browser/layout/workbenchLayout";
import { Workbench, type WorkbenchTitlebarState, } from "src/cs/workbench/browser/workbench";
import { getWorkbenchWindowState } from "src/cs/workbench/browser/window";
type ProcessingExtractionError = {
    fileName?: string;
    message: string;
    messageKey?: string | null;
    messageParams?: Record<string, unknown> | null;
    [key: string]: unknown;
};
const AnalysisViewPane = lazy(() => import("src/cs/workbench/contrib/chartPreview/browser/chartPreviewViewPane"));
const SettingsViewPane = lazy(() => import("src/cs/workbench/contrib/settings/browser/settingsViewPane"));
const OnboardingControllerHost = lazy(loadOnboardingController);
const Onboarding = lazy(loadOnboarding);
const DeferredPanelFallback = ({ label }: {
    label: string;
}) => (jsx("div", {
    className: "flex h-full w-full items-center justify-center rounded-[20px] border border-border bg-bg-surface/60 text-sm text-text-secondary",
    children: label
}));
const Page = () => {
    const { t, language, setLanguage } = useLanguage();
    const { theme, setTheme } = useTheme();
    const tLoose = useCallback((key: string, vars?: Record<string, unknown>) => t(key, vars as TranslationVars | undefined), [t]);
    const { environment, isAppUpdatePreviewEnabled, isDesktopChromePreviewEnabled, isPackagedWindowsDesktopShell, isWindowsDesktopShell, } = getWorkbenchWindowState();
    const session = useSession();
    const { rawData, setRawData, selectedPreviewFileId, setSelectedPreviewFileId, processedData, setProcessedData, templateConfig, setTemplateConfig, ionIoffMethod, setIonIoffMethod, ionIoffManualTargetsByFileId, setIonIoffManualTargetsByFileId, ssMethod, setSsMethod, ssDiagnosticsEnabled, setSsDiagnosticsEnabled, vthDiagnosticsEnabled, setVthDiagnosticsEnabled, gmDiagnosticsEnabled, setGmDiagnosticsEnabled, ssShowFitLine, setSsShowFitLine, ssManualRanges, setSsManualRanges, previewFile, setPreviewFile, previewStatus, setPreviewStatus, previewWorkerRef, previewRequestIdRef, previewRowsRequestIdRef, previewRowsRequestsRef, previewRowsCacheByFileIdRef, previewLoadedChunksByFileIdRef, previewRowsCacheRef, previewLoadedChunksRef, previewCacheFileIdRef, previewCacheFileLruRef, } = session;
    const importerRef = useRef<ImporterRef | null>(null);
    const [onboarding, setOnboarding] = useState<OnboardingControllerState>(() => createIdleOnboardingState(importerRef));
    const handleOnboardingStateChange = useCallback((nextState: OnboardingControllerState) => {
        setOnboarding((prevState) => {
            if (prevState.isOpen === nextState.isOpen &&
                prevState.canNext === nextState.canNext &&
                prevState.stepIndex === nextState.stepIndex &&
                prevState.steps === nextState.steps &&
                prevState.back === nextState.back &&
                prevState.close === nextState.close &&
                prevState.handleImportTrigger === nextState.handleImportTrigger &&
                prevState.handleOpenOrigin === nextState.handleOpenOrigin &&
                prevState.next === nextState.next &&
                prevState.open === nextState.open) {
                return prevState;
            }
            return nextState;
        });
    }, []);
    const handleOnboardingControllerStateChange = useCallback((nextState: OnboardingControllerState) => {
        handleOnboardingStateChange(nextState);
        if (nextState.isOpen) {
            setPendingOnboardingOpenMode(null);
        }
    }, [handleOnboardingStateChange]);
    const [analysisViewSessionKey, setAnalysisViewSessionKey] = useState(0);
    const [extractionErrorToast, setExtractionErrorToast] = useState<{
        isVisible: boolean;
        message: string;
        type: ToastType;
    }>({
        isVisible: false,
        message: "",
        type: "error",
    });
    const extractionErrorToastRef = useRef<Toast | null>(null);
    const { activeView, layoutState, navigateBack, navigateForward, navigateToView, resetAnalysisViewVisit, selectView, visitedViews, } = useWorkbenchLayoutNavigation();
    useEffect(() => {
        const toast = new Toast();
        extractionErrorToastRef.current = toast;
        return () => {
            extractionErrorToastRef.current = null;
            toast.dispose();
        };
    }, []);
    useEffect(() => {
        const toast = extractionErrorToastRef.current;
        if (!toast)
            return;
        if (!extractionErrorToast.isVisible) {
            toast.hide();
            return;
        }
        toast.show({
            dataUi: "analysis-extraction-error-toast",
            message: extractionErrorToast.message,
            onClose: () => setExtractionErrorToast((prev) => ({ ...prev, isVisible: false })),
            position: "fixed",
            type: extractionErrorToast.type,
        });
    }, [
        extractionErrorToast.isVisible,
        extractionErrorToast.message,
        extractionErrorToast.type,
    ]);
    const handleAnalysisIntent = useCallback(() => {
        void loadAnalysisCharts();
    }, []);
    useEffect(() => {
        if (visitedViews.hasVisitedAnalysisView || processedData.length === 0)
            return undefined;
        const prefetch = () => {
            void loadAnalysisCharts();
        };
        if (typeof window !== "undefined" &&
            typeof window.requestIdleCallback === "function") {
            const idleId = window.requestIdleCallback(prefetch, { timeout: 1200 });
            return () => {
                if (typeof window.cancelIdleCallback === "function") {
                    window.cancelIdleCallback(idleId);
                }
            };
        }
        const timeoutId = window.setTimeout(prefetch, 300);
        return () => window.clearTimeout(timeoutId);
    }, [processedData.length, visitedViews.hasVisitedAnalysisView]);
    const getProcessingExtractionErrorMessage = useCallback((error: ProcessingExtractionError) => getExtractionErrorMessage(tLoose, {
        message: error?.message,
        messageKey: typeof error?.messageKey === "string" ? error.messageKey : undefined,
        messageParams: error?.messageParams && typeof error.messageParams === "object"
            ? error.messageParams
            : undefined,
    }), [tLoose]);
    const handleProcessingExtractionError = useCallback((error: ProcessingExtractionError) => {
        const fileName = typeof error?.fileName === "string" && error.fileName.trim()
            ? `${error.fileName}: `
            : "";
        const message = getProcessingExtractionErrorMessage(error);
        if (!message)
            return;
        setExtractionErrorToast({
            isVisible: true,
            message: `${fileName}${message}`,
            type: "error",
        });
    }, [getProcessingExtractionErrorMessage]);
    const { clearPreviewState, disposePreviewFileCache, ensurePreviewCells, ensurePreviewRows, getPreviewRow, getPreviewRowsVersion, handlePreviewFileSelected, invalidatePreviewRequests, rawDataByIdRef, resetPreviewWorker, subscribePreviewRowsVersion, } = usePreview({
        previewCacheFileIdRef,
        previewCacheFileLruRef,
        previewFile,
        previewLoadedChunksByFileIdRef,
        previewLoadedChunksRef,
        previewRequestIdRef,
        previewRowsCacheByFileIdRef,
        previewRowsCacheRef,
        previewRowsRequestIdRef,
        previewRowsRequestsRef,
        previewWorkerRef,
        rawData,
        selectedPreviewFileId,
        setPreviewFile,
        setPreviewStatus,
        setSelectedPreviewFileId,
        t: tLoose,
    });
    const coreSettingsOptions = useMemo<CoreSettingsControllerOptions>(() => ({
        language,
        setIonIoffMethod,
        setLanguage,
        theme,
        setTheme,
        setGmDiagnosticsEnabled,
        setSsDiagnosticsEnabled,
        setVthDiagnosticsEnabled,
        setSsMethod,
        setSsShowFitLine,
    }), [
        language,
        setIonIoffMethod,
        setLanguage,
        theme,
        setTheme,
        setGmDiagnosticsEnabled,
        setSsDiagnosticsEnabled,
        setVthDiagnosticsEnabled,
        setSsMethod,
        setSsShowFitLine,
    ]);
    const coreSettingsControllerRef = useRef<CoreSettingsController | null>(null);
    const [coreSettingsState, setCoreSettingsState] = useState(createCoreSettingsState);
    useLayoutEffect(() => {
        const controller = new CoreSettingsController(coreSettingsOptions);
        coreSettingsControllerRef.current = controller;
        const listener = controller.onDidChangeState(setCoreSettingsState);
        setCoreSettingsState(controller.getState());
        return () => {
            coreSettingsControllerRef.current = null;
            listener.dispose();
            controller.dispose();
        };
    }, []);
    useLayoutEffect(() => {
        coreSettingsControllerRef.current?.update(coreSettingsOptions);
    }, [coreSettingsOptions]);
    const { analysisSettings, analysisSettingsLoaded, handleLanguageChange, handleThemeChange, handleUpdateAnalysisSettings, mergeAnalysisSettings, originOpenPlotOptions, } = coreSettingsState;
    const prefetchOnboarding = useCallback(() => {
        void loadOnboardingController();
        void loadOnboarding();
    }, []);
    const { analysisActiveFileId, analysisFileOptions, handleAnalysisFileChange, setAnalysisActiveFileId, } = useAnalysisSelectionState({
        analysisSettings,
        analysisSettingsLoaded,
        handleUpdateAnalysisSettings,
        ionIoffManualTargetsByFileId,
        processedData,
        setIonIoffManualTargetsByFileId,
    });
    const { handleOpenOnboardingGuide, hasOnboardingSessionData, pendingOnboardingOpenMode, setPendingOnboardingOpenMode, shouldMountOnboardingController, } = useOnboardingLauncher({
        analysisSettings,
        onboardingIsOpen: onboarding.isOpen,
        prefetchOnboarding,
        processedDataCount: processedData.length,
        rawDataCount: rawData.length,
    });
    const { handleTemplateApplied, handleTemplateAppliedIncremental, processingStatus, removeQueuedProcessingFile, resetProcessingWorker, } = useProcessing({
        activeFileId: analysisActiveFileId,
        getPreviewRow,
        previewFile,
        processedData,
        rawData,
        rawDataByIdRef,
        onExtractionError: handleProcessingExtractionError,
        setActivePage: (page: string) => {
            if (page === "data" || page === "analysis" || page === "settings") {
                navigateToView(page);
            }
        },
        setProcessedData,
        t: tLoose,
    });
    const { handleExport } = useExports({
        processedData,
        ssManualRanges,
        ssMethod,
    });
    const { handleClearSession, handleDataImported, handleDataRemoved, hasSessionData, } = useSessionActions({
        clearPreviewState,
        disposePreviewFileCache,
        invalidatePreviewRequests,
        previewFile,
        processedData,
        processingStatus,
        rawData,
        removeQueuedProcessingFile,
        resetPreviewWorker,
        resetProcessingWorker,
        selectedPreviewFileId,
        setProcessedData,
        setRawData,
        setSelectedPreviewFileId,
        setIonIoffManualTargetsByFileId,
        setSsManualRanges,
    });
    const hadOnboardingSessionDataRef = useRef(hasOnboardingSessionData);
    const dataPane = layoutState.panes.data;
    const analysisPane = layoutState.panes.analysis;
    const settingsPane = layoutState.panes.settings;
    useEffect(() => {
        const hadOnboardingSessionData = hadOnboardingSessionDataRef.current;
        hadOnboardingSessionDataRef.current = hasOnboardingSessionData;
        if (!hadOnboardingSessionData || hasOnboardingSessionData) {
            return;
        }
        setAnalysisViewSessionKey((prev) => prev + 1);
        setAnalysisActiveFileId(null);
        resetAnalysisViewVisit();
    }, [hasOnboardingSessionData, resetAnalysisViewVisit, setAnalysisActiveFileId]);
    const { autoUpdateStatus, handleCheckForUpdatesAndInstall, handleCloseWindow, handleInstallDownloadedUpdate, handleMinimizeWindow, handleToggleMaximizeWindow, } = useDesktopShell({
        handleExport,
        importerRef,
        isWindowsDesktopShell,
    });
    const handlePreviewCheckForUpdates = useCallback(async () => {
        await new Promise((resolve) => {
            setTimeout(resolve, 900);
        });
        return true;
    }, []);
    const onboardingControllerPart = shouldMountOnboardingController ? (jsx(Suspense, {
        fallback: null,
        children: jsx(OnboardingControllerHost, {
            clearPreviewState: clearPreviewState,
            importerRef: importerRef,
            isRequestedOpen: pendingOnboardingOpenMode !== null,
            openMode: pendingOnboardingOpenMode ?? "manual",
            navigateToPage: navigateToView,
            onStateChange: handleOnboardingControllerStateChange,
            processingState: processingStatus?.state,
            processedData: processedData,
            rawData: rawData,
            setProcessedData: setProcessedData,
            setRawData: setRawData,
            setSelectedPreviewFileId: setSelectedPreviewFileId,
            setTemplateConfig: setTemplateConfig,
            templateConfig: templateConfig,
            updateSettings: handleUpdateAnalysisSettings
        })
    })) : null;
    const dataSidebarPart = (jsx(ImporterViewletHost, {
        hasSessionData: hasSessionData,
        importerRef: importerRef,
        onClearSession: handleClearSession,
        onDataImported: handleDataImported,
        onDataRemoved: handleDataRemoved,
        onFileSelected: handlePreviewFileSelected,
        onImportTrigger: () => {
            onboarding.handleImportTrigger();
        },
        rawData: rawData,
        selectedPreviewFileId: selectedPreviewFileId,
        t: t
    }));
    const dataPanelPart = createScrollPanePart({
        isActive: dataPane.isActive,
        labelledBy: dataPane.labelledBy,
        paneId: dataPane.paneId,
        viewportClassName: "pl-0 pt-0 pr-0 pb-0 !overflow-hidden",
        children: (jsx(DataViewPane, {
            analysisSettings: analysisSettings,
            ensurePreviewCells: ensurePreviewCells,
            ensurePreviewRows: ensurePreviewRows,
            getPreviewRow: getPreviewRow,
            getPreviewRowsVersion: getPreviewRowsVersion,
            onTemplateApplied: handleTemplateApplied,
            onTemplateAppliedIncremental: handleTemplateAppliedIncremental,
            onUpdateSettings: handleUpdateAnalysisSettings,
            previewFile: previewFile,
            previewStatus: previewStatus,
            rawData: rawData,
            subscribePreviewRowsVersion: subscribePreviewRowsVersion,
            t: t
        })),
    });
    const analysisPanelPart = createPanePart({
        isActive: analysisPane.isActive,
        labelledBy: analysisPane.labelledBy,
        paneId: analysisPane.paneId,
        children: (analysisPane.shouldMount ? (jsx(AnalysisViewPane, {
            key: `analysis-view-session-${analysisViewSessionKey}`,
            processedData: processedData,
            processingStatus: processingStatus,
            activeFileId: analysisActiveFileId,
            onActiveFileIdChange: handleAnalysisFileChange,
            showFileSelect: !isWindowsDesktopShell,
            shouldMountCharts: analysisPane.isActive || visitedViews.hasVisitedAnalysisView,
            setSsDiagnosticsEnabled: setSsDiagnosticsEnabled,
            setVthDiagnosticsEnabled: setVthDiagnosticsEnabled,
            setGmDiagnosticsEnabled: setGmDiagnosticsEnabled,
            ionIoffMethod: ionIoffMethod,
            ionIoffManualTargetsByFileId: ionIoffManualTargetsByFileId,
            setIonIoffMethod: setIonIoffMethod,
            setIonIoffManualTargetsByFileId: setIonIoffManualTargetsByFileId,
            setSsManualRanges: setSsManualRanges,
            setSsMethod: setSsMethod,
            setSsShowFitLine: setSsShowFitLine,
            gmDiagnosticsEnabled: gmDiagnosticsEnabled,
            ssDiagnosticsEnabled: ssDiagnosticsEnabled,
            vthDiagnosticsEnabled: vthDiagnosticsEnabled,
            ssManualRanges: ssManualRanges,
            ssMethod: ssMethod,
            ssShowFitLine: ssShowFitLine,
            originOpenPlotOptions: originOpenPlotOptions,
            onOriginOpenPlotOptionsChange: handleUpdateAnalysisSettings,
            t: tLoose
        })) : null),
    });
    const settingsViewPanePart = createScrollPanePart({
        isActive: settingsPane.isActive,
        labelledBy: settingsPane.labelledBy,
        paneId: settingsPane.paneId,
        viewportClassName: "p-1 pt-0",
        children: settingsPane.shouldMount ? (jsx(Suspense, {
            fallback: jsx(DeferredPanelFallback, {
                label: t("da_settings_title")
            }),
            children: jsx(SettingsViewPane, {
                appUpdateSettings: {
                    isAvailable: isAppUpdatePreviewEnabled,
                    currentVersion: typeof environment?.appVersion === "string"
                        ? environment.appVersion
                        : null,
                    onCheckForUpdates: isPackagedWindowsDesktopShell
                        ? handleCheckForUpdatesAndInstall
                        : handlePreviewCheckForUpdates,
                },
                analysisSettings: analysisSettings,
                analysisSettingsLoaded: analysisSettingsLoaded,
                handleUpdateAnalysisSettings: handleUpdateAnalysisSettings,
                isWindowsDesktopShell: isWindowsDesktopShell,
                language: language,
                handleLanguageChange: handleLanguageChange,
                onboardingSettings: {
                    onOpenGuide: handleOpenOnboardingGuide,
                },
                mergeAnalysisSettings: mergeAnalysisSettings,
                theme: theme,
                handleThemeChange: handleThemeChange,
                t: tLoose
            })
        })) : null,
    });
    const onboardingOverlayPart = onboarding.isOpen ? (jsx(Suspense, {
        fallback: null,
        children: jsx(Onboarding, {
            isOpen: onboarding.isOpen,
            stepIndex: onboarding.stepIndex,
            steps: onboarding.steps,
            t: t,
            canNext: onboarding.canNext,
            onBack: onboarding.back,
            onClose: onboarding.close,
            onNext: onboarding.next
        })
    })) : null;
    const pageParts = createWorkbenchParts({
        analysis: jsxs("div", {
            children: [analysisPanelPart, settingsViewPanePart],
        }),
        controller: onboardingControllerPart,
        data: dataPanelPart,
        overlay: onboardingOverlayPart,
        sidebar: dataSidebarPart,
    });
    const titlebarState: WorkbenchTitlebarState | undefined = {
        enabled: isDesktopChromePreviewEnabled,
        activePage: activeView,
        t,
        canNavigateBack: layoutState.canNavigateBack,
        canNavigateForward: layoutState.canNavigateForward,
        onAnalysisIntent: handleAnalysisIntent,
        onNavigateBack: navigateBack,
        onNavigateForward: navigateForward,
        onPageChange: selectView,
        onOpenSettings: () => selectView("settings"),
        onMinimizeWindow: handleMinimizeWindow,
        onToggleMaximizeWindow: handleToggleMaximizeWindow,
        onCloseWindow: handleCloseWindow,
        isUpdateReadyToInstall: autoUpdateStatus.status === "downloaded",
        updateVersion: autoUpdateStatus.version,
        showAnalysisFileSelector: analysisPane.isActive && analysisFileOptions.length > 0,
        onInstallUpdate: () => {
            void handleInstallDownloadedUpdate();
        },
        analysisFileOptions,
        analysisActiveFileId,
        onAnalysisFileChange: handleAnalysisFileChange,
    };
    const workbenchContainerRef = useRef<HTMLDivElement | null>(null);
    const workbenchRef = useRef<Workbench | null>(null);
    const [workbenchContentElement, setWorkbenchContentElement] = useState<HTMLElement | null>(null);
    useLayoutEffect(() => {
        const container = workbenchContainerRef.current;
        if (!container) {
            return undefined;
        }
        const workbench = new Workbench(container, {
            id: "analysis-page",
            className: "relative w-full h-full min-h-0 overflow-hidden",
            showDesktopCommandBar: isDesktopChromePreviewEnabled,
            showSkeleton: false,
            titlebarState,
        });
        workbenchRef.current = workbench;
        setWorkbenchContentElement(workbench.contentElement);
        return () => {
            workbenchRef.current = null;
            setWorkbenchContentElement(null);
            workbench.dispose();
        };
    }, []);
    useLayoutEffect(() => {
        workbenchRef.current?.update({
            id: "analysis-page",
            className: "relative w-full h-full min-h-0 overflow-hidden",
            showDesktopCommandBar: isDesktopChromePreviewEnabled,
            showSkeleton: false,
            titlebarState,
        });
    }, [isDesktopChromePreviewEnabled, titlebarState]);
    const workbenchContent = (jsxs("div", {
        className: "relative flex flex-1 min-h-0 flex-col",
        children: [
            pageParts.controller ?? null,
            jsx(WorkbenchLayout, {
                activeView: activeView,
                dataSidebar: pageParts.sidebar,
                children: pageParts.main
            }),
            pageParts.overlay ?? null
        ]
    }));
    return (jsx("div", {
        ref: workbenchContainerRef,
        children: workbenchContentElement
            ? createPortal(workbenchContent, workbenchContentElement)
            : null
    }));
};
export default Page;

