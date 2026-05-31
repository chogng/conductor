import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import React, { useCallback, useEffect, useId, useMemo, useRef, useState, type ButtonHTMLAttributes, type ChangeEvent, type CSSProperties, type HTMLAttributes, type InputHTMLAttributes, type ReactElement, type ReactNode, type Ref, } from "react";
import { createPortal } from "react-dom";
import { lxAddSmall, lxArrowUp, lxClose, lxDownloadTray, lxExportTray, lxListUnordered, lxSave, lxTrash, } from "cogicon";
import { getCogIconClassName, getCogIconMarkup, getCogIconStyle, type CogIconRenderer, type CogIconStyle } from "src/cs/base/browser/ui/cogIcon/cogIcon";
import { lxAlertTriangle, } from "src/cs/base/browser/ui/cogIcon/icons";
import { useLanguage } from "src/cs/workbench/browser/hooks/useLanguage";
import type { TranslateFn, TranslationVars } from "src/cs/platform/language/common/language";
import type { StateSetter } from "src/cs/workbench/contrib/session/analysis-session-context";
import Toast from "cs/base/browser/ui/toast/toast";
import { getInputDataAttributes, getInputFieldClassName, getInputFieldState, getInputNativeClassName, getInputWrapperClassName, mergeSpaceSeparatedIds, slugifyInputId, type InputSize, type LabelPlacement } from "cs/base/browser/ui/input/input";
import DropdownField from "src/cs/workbench/browser/components/DropdownField";
import { getTabDataAttributes, getTabsDevTestId, getTabsInstanceId, getTabsMenuClassName, getTabsButtonClassName, getTabsUiMarker, normalizeTabsOptions, type KeyboardActivation, type NormalizedTabOption, type PanelIdMode, type TabOptionBase, type TabSize, type TabValue } from "cs/base/browser/ui/tabs/tabs";
import { getCardClassName, getCardDataAttributes, type CardVariant } from "cs/base/browser/ui/card/card";
import { getButtonClassName, getButtonContentClassName, getButtonDataAttributes, type ButtonSize, type ButtonVariant, } from "cs/base/browser/ui/button/button";
import { getCheckboxAriaAttributes, getCheckboxClassName, getCheckboxIconMarkup, type CheckboxSize } from "cs/base/browser/ui/checkbox/checkbox";
import { MODAL_BACKDROP_CLASS, MODAL_OVERLAY_CLASS, getModalDataAttributes, getModalDialogClassName, getModalDialogId, getModalTitleId, getModalUiMarker, type ModalInitialFocus, type ModalSize, type ModalVariant } from "cs/base/browser/ui/modal/modal";
import ScrollArea from "src/cs/workbench/browser/components/ScrollArea";
import { runAtThisOrScheduleAtNextAnimationFrame } from "src/cs/base/browser/dom";
import { addDisposableListener, EventType } from "src/cs/base/browser/event";
import DataPreviewArea from "src/cs/workbench/contrib/data/DataPreviewArea";
import { TemplateManagerPreviewEmptyState, TemplateManagerPreviewSurface, } from "./templatePreviewSurface";
import TemplateManagerPreviewWorkspace from "./templatePreviewWorkspace";
import { validateVarPair } from "src/cs/workbench/contrib/template/common/templateValidation";
import { getExcelColumnLabel } from "src/cs/workbench/contrib/template/common/templateColumnLabel";
import { useTemplateManagerState } from "./useTemplateManagerState";
import { createEmptyTemplateConfig, normalizeXDataEndValue, normalizeTemplateConfigRecord, type TemplateConfig, } from "src/cs/workbench/contrib/template/common/templateManagerUtils";
import { Y_UNIT_VALUES } from "src/cs/workbench/contrib/chart/common/units";
import { buildAutoTemplateConfig, inferAutoExtraction, AUTO_TEMPLATE_ID, type AutoExtractionResult, } from "src/cs/workbench/common/deviceAnalysis/autoExtraction";
import { stableStringify } from "src/cs/workbench/common/deviceAnalysis/utils";
import { deriveFileNameFieldSuggestions, joinFileNameMatchInput, matchFileNameAgainstPhrase, matchFileNameAgainstPatternTokens, normalizeFileNameFieldSeparators, splitFileNameMatchInput, } from "src/cs/workbench/common/deviceAnalysis/fileNameFieldMatching";
import { inferXSegmentationSuggestionFromPreview, resolveXRangeForPreview, resolveXSegmentationMode, } from "src/cs/workbench/common/deviceAnalysis/XSegmentation";
import { TEMPLATE_MODE_ICON_ONLY_THRESHOLD_PX } from "src/cs/workbench/browser/layout";
import type { PreviewStatus as SessionPreviewStatus } from "src/cs/workbench/contrib/session/analysis-session-context";
import { useSession } from "src/cs/workbench/contrib/session/useSession";
import type { PreviewFileLike, RawDataEntry, ToastType, } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import { BrowserTemplateService } from "src/cs/workbench/contrib/template/browser/templateService";
type LocalCogIconProps = {
    className?: string;
    icon: CogIconRenderer;
    size?: number | string;
    style?: CogIconStyle;
    [key: string]: unknown;
};
type LocalCogIconComponentProps = Pick<LocalCogIconProps, "className" | "size" | "style">;
const renderLocalCogIcon = ({ className, icon, size = 16, style, ...props }: LocalCogIconProps) => jsx("span", {
    ...props,
    className: getCogIconClassName(className),
    style: getCogIconStyle({ size, style }),
    dangerouslySetInnerHTML: {
        __html: getCogIconMarkup(icon)
    }
});
const TemplateModeSelectIcon = ({ className, size = 16, style }: LocalCogIconComponentProps) => renderLocalCogIcon({ className, icon: lxListUnordered, size, style });
const TemplateModeSaveIcon = ({ className, size = 16, style }: LocalCogIconComponentProps) => renderLocalCogIcon({ className, icon: lxSave, size, style });
const TemplateOptionAddIcon = ({ className, size = 16, style }: LocalCogIconComponentProps) => renderLocalCogIcon({ className, icon: lxAddSmall, size, style });
const TemplateOptionTrashIcon = ({ className, size = 16, style }: LocalCogIconComponentProps) => renderLocalCogIcon({ className, icon: lxTrash, size, style });
type LocalModalProps = {
    children?: ReactNode;
    className?: string;
    cta?: string;
    ctaCopy?: string;
    ctaPosition?: string;
    dataUi?: string;
    footer?: ReactNode;
    headerRight?: ReactNode;
    idBase?: string;
    initialFocus?: ModalInitialFocus;
    isOpen: boolean;
    onClose: () => void;
    size?: ModalSize;
    title?: ReactNode;
    variant?: ModalVariant;
};
const Modal = ({ children, className = "", cta, ctaCopy, ctaPosition, dataUi, footer, headerRight, idBase, initialFocus = "dialog", isOpen, onClose, size = "md", title, variant = "primary", }: LocalModalProps) => {
    const reactId = useId();
    const titleId = getModalTitleId(idBase, reactId);
    const uiMarker = getModalUiMarker(dataUi);
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const previouslyFocusedRef = useRef<HTMLElement | null>(null);
    const previousBodyOverflowRef = useRef<string | null>(null);
    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape")
                onClose();
        };
        let focusHandle: { dispose(): void } | null = null;
        let keydownDisposable: { dispose(): void } | null = null;
        if (isOpen) {
            keydownDisposable = addDisposableListener(document, EventType.KEY_DOWN, handleEscape);
            previouslyFocusedRef.current =
                document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null;
            previousBodyOverflowRef.current = document.body.style.overflow;
            document.body.style.overflow = "hidden";
            focusHandle = runAtThisOrScheduleAtNextAnimationFrame(window, () => {
                const dialog = dialogRef.current;
                if (!dialog)
                    return;
                const autoFocusTarget = dialog.querySelector("[data-autofocus], [autofocus]");
                const focusable = initialFocus === "first"
                    ? dialog.querySelector('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
                    : null;
                const target = (autoFocusTarget instanceof HTMLElement && autoFocusTarget) ||
                    (focusable instanceof HTMLElement && focusable) ||
                    dialog;
                target.focus();
            });
        }
        return () => {
            keydownDisposable?.dispose();
            focusHandle?.dispose();
            if (!isOpen)
                return;
            document.body.style.overflow = previousBodyOverflowRef.current ?? "";
            const previousFocused = previouslyFocusedRef.current;
            if (previousFocused && typeof previousFocused.focus === "function") {
                try {
                    previousFocused.focus();
                }
                catch {
                    // Element may have been removed while the modal was open.
                }
            }
        };
    }, [initialFocus, isOpen, onClose]);
    if (!isOpen)
        return null;
    const hasHeader = title != null || headerRight != null;
    return createPortal(jsx("div", {
        className: MODAL_OVERLAY_CLASS,
        "data-style": "modal",
        "data-ui": uiMarker,
        children: [
            jsx("div", {
                className: MODAL_BACKDROP_CLASS,
                onClick: onClose,
                "data-ui": uiMarker ? `${uiMarker}-backdrop` : undefined
            }),
            jsx("div", {
                ...getModalDataAttributes({ cta, ctaCopy, ctaPosition }),
                className: getModalDialogClassName({ className, size, variant }),
                id: getModalDialogId(idBase),
                role: "dialog",
                "aria-modal": "true",
                "aria-labelledby": title != null ? titleId : undefined,
                tabIndex: -1,
                ref: dialogRef,
                "data-ui": uiMarker ? `${uiMarker}-dialog` : undefined,
                children: [
                    hasHeader ? jsx("div", {
                        className: `modal_header${headerRight ? " justify-between gap-4" : ""}`,
                        children: [
                            title != null ? jsx("h3", {
                                id: titleId,
                                className: "modal_title",
                                children: title
                            }) : null,
                            headerRight != null ? jsx("div", {
                                className: "modal_headerRight",
                                children: headerRight
                            }) : null
                        ]
                    }) : null,
                    jsx("div", {
                        className: "modal_body",
                        children
                    }),
                    footer ? jsx("div", {
                        className: "modal_footer",
                        children: footer
                    }) : null
                ]
            })
        ]
    }), document.body);
};
type LocalTabOption = TabOptionBase & {
    ariaLabel?: string;
    icon?: (props: { size?: number }) => ReactNode;
    label: ReactNode;
};
type LocalTabsProps = Omit<HTMLAttributes<HTMLDivElement>, "onChange"> & {
    className?: string;
    controlsPanels?: boolean;
    dataUi?: string;
    groupLabel?: string;
    hoverPreview?: boolean;
    idBase?: string;
    itemClassName?: string;
    keyboardActivation?: KeyboardActivation;
    onChange?: (nextValue: TabValue) => void;
    options?: LocalTabOption[];
    panelIdBase?: string;
    panelIdMode?: PanelIdMode;
    size?: TabSize;
    testId?: string;
    value?: TabValue;
};
const Tabs = ({ className = "", controlsPanels = false, dataUi, groupLabel, hoverPreview = true, idBase, itemClassName = "", keyboardActivation = "auto", onChange, options = [], panelIdBase, panelIdMode = "scoped", size = "md", testId, value, ...restProps }: LocalTabsProps) => {
    const reactId = useId();
    const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const [hoveredValue, setHoveredValue] = useState<TabValue | null>(null);
    const safeOptions = useMemo(() => (Array.isArray(options) ? options : []), [options]);
    const instanceId = getTabsInstanceId(idBase, reactId);
    const uiMarker = getTabsUiMarker(dataUi);
    const normalizedOptions = useMemo<NormalizedTabOption<LocalTabOption>[]>(() => normalizeTabsOptions({
        idBase,
        instanceId,
        options: safeOptions,
        panelIdBase,
        panelIdMode,
        shouldLinkPanels: controlsPanels,
    }), [controlsPanels, idBase, instanceId, panelIdBase, panelIdMode, safeOptions]);
    const selectedIndex = useMemo(() => normalizedOptions.findIndex((option) => option.value === value), [normalizedOptions, value]);
    const firstEnabledIndex = useMemo(() => normalizedOptions.findIndex((option) => !option.__disabled), [normalizedOptions]);
    const focusIndex = selectedIndex >= 0 && !normalizedOptions[selectedIndex]?.__disabled ? selectedIndex : firstEnabledIndex;
    const focusAtIndex = (index: number) => buttonRefs.current[index]?.focus();
    const findNextEnabledIndex = (fromIndex: number, direction: -1 | 1): number => {
        const length = normalizedOptions.length;
        if (length <= 0)
            return -1;
        for (let index = 0; index < length; index++) {
            const nextIndex = (fromIndex + direction * (index + 1) + length) % length;
            if (!normalizedOptions[nextIndex]?.__disabled)
                return nextIndex;
        }
        return -1;
    };
    const activateAtIndex = (index: number) => {
        const option = normalizedOptions[index];
        if (!option || option.__disabled || option.value === undefined)
            return;
        onChange?.(option.value);
        setHoveredValue(null);
    };
    const moveSelection = (index: number, direction: -1 | 1) => {
        const nextIndex = findNextEnabledIndex(index, direction);
        if (nextIndex < 0)
            return;
        focusAtIndex(nextIndex);
        if (keyboardActivation !== "manual")
            activateAtIndex(nextIndex);
    };
    if (normalizedOptions.length === 0)
        return null;
    return jsx("div", {
        role: "tablist",
        "aria-label": groupLabel,
        "data-tabs": "menu",
        "data-ui": uiMarker,
        "data-testid": getTabsDevTestId(testId),
        className: getTabsMenuClassName(className),
        ...restProps,
        children: normalizedOptions.map((option, index) => {
            const Icon = option.icon;
            const isSelected = value === option.value;
            const visualValue = hoverPreview && hoveredValue !== null ? hoveredValue : value;
            const isVisuallyActive = option.value !== undefined && visualValue === option.value;
            const isDisabled = option.__disabled;
            return jsx("button", {
                ...getTabDataAttributes(option),
                type: "button",
                role: "tab",
                id: option.__tabId,
                "aria-label": option.ariaLabel,
                title: option.title,
                "aria-selected": isSelected,
                "aria-controls": option.__panelId,
                tabIndex: index === focusIndex ? 0 : -1,
                disabled: isDisabled,
                "data-icon": Icon ? "with" : "without",
                "data-tabs": "tab",
                "data-ui": uiMarker ? `${uiMarker}-tab-${option.__token}` : undefined,
                "data-testid": getTabsDevTestId(option.testId),
                className: getTabsButtonClassName({ className: itemClassName, isActive: isVisuallyActive, size }),
                ref: (element: HTMLButtonElement | null) => {
                    buttonRefs.current[index] = element;
                },
                onClick: () => activateAtIndex(index),
                onMouseEnter: () => {
                    if (!isDisabled && hoverPreview)
                        setHoveredValue(option.value ?? null);
                },
                onMouseLeave: () => {
                    if (hoverPreview)
                        setHoveredValue(null);
                },
                onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
                    if (event.key === "ArrowLeft") {
                        event.preventDefault();
                        moveSelection(index, -1);
                    }
                    else if (event.key === "ArrowRight") {
                        event.preventDefault();
                        moveSelection(index, 1);
                    }
                    else if (event.key === "Home") {
                        event.preventDefault();
                        const nextIndex = firstEnabledIndex;
                        if (nextIndex >= 0) {
                            focusAtIndex(nextIndex);
                            if (keyboardActivation !== "manual")
                                activateAtIndex(nextIndex);
                        }
                    }
                    else if (event.key === "End") {
                        event.preventDefault();
                        let nextIndex = -1;
                        for (let candidateIndex = normalizedOptions.length - 1; candidateIndex >= 0; candidateIndex--) {
                            if (!normalizedOptions[candidateIndex]?.__disabled) {
                                nextIndex = candidateIndex;
                                break;
                            }
                        }
                        if (nextIndex >= 0) {
                            focusAtIndex(nextIndex);
                            if (keyboardActivation !== "manual")
                                activateAtIndex(nextIndex);
                        }
                    }
                    else if (keyboardActivation === "manual" && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        activateAtIndex(index);
                    }
                },
                children: [
                    Icon ? jsx("span", {
                        className: "tab_btn_icon",
                        children: jsx(Icon, { size: 16 })
                    }, "icon") : null,
                    jsx("span", {
                        className: "tab_btn_text",
                        children: option.label
                    }, "label")
                ]
            }, option.__key);
        })
    });
};
type LocalButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
    children?: ReactNode;
    contentClassName?: string;
    cta?: string;
    ctaCopy?: string;
    ctaPosition?: string;
    dataIcon?: string;
    fullWidth?: boolean;
    fx?: boolean;
    size?: ButtonSize;
    testId?: string;
    variant?: ButtonVariant;
};
const renderLocalButton = ({ children, className = "", contentClassName = "", cta, ctaCopy, ctaPosition, dataIcon, disabled = false, fullWidth = false, fx = false, size = "md", testId, type = "button", variant = "primary", ...props }: LocalButtonProps) => jsx("button", {
    ...props,
    ...getButtonDataAttributes({ cta, ctaCopy, ctaPosition, dataIcon, fx, testId }),
    type,
    disabled,
    className: getButtonClassName({ className, disabled, fullWidth, size, variant }),
    children: jsx("span", {
        className: getButtonContentClassName(contentClassName),
        children
    })
});
type LocalCardProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
    children?: ReactNode;
    cta?: string;
    ctaCopy?: string;
    ctaPosition?: string;
    ref?: Ref<HTMLElement>;
    variant?: CardVariant;
};
const renderLocalCard = ({ children, className = "", cta, ctaCopy, ctaPosition, variant = "default", ...props }: LocalCardProps) => jsx("div", {
    ...props,
    ...getCardDataAttributes({ cta, ctaCopy, ctaPosition }),
    className: getCardClassName({ className, variant }),
    children
});
const renderLocalCheckbox = ({
    as = "span",
    checked = false,
    className = "",
    decorative = true,
    iconSize,
    iconStrokeWidth: _iconStrokeWidth,
    size = "sm",
}: {
    readonly as?: "span" | "div";
    readonly checked?: boolean;
    readonly className?: string;
    readonly decorative?: boolean;
    readonly iconSize?: number;
    readonly iconStrokeWidth?: number;
    readonly size?: CheckboxSize;
}) => jsx(as, {
    ...getCheckboxAriaAttributes({ checked, decorative }),
    className: getCheckboxClassName({ checked, className, size }),
    dangerouslySetInnerHTML: {
        __html: getCheckboxIconMarkup({ checked, iconSize, size }),
    },
});
type LocalInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "value" | "onChange"> & {
    allowAutoComplete?: boolean;
    error?: ReactNode;
    fieldClassName?: string;
    hideSpinner?: boolean;
    hint?: ReactNode;
    idBase?: string;
    inputClassName?: string;
    label?: ReactNode;
    labelPlacement?: LabelPlacement;
    onChange?: (nextValue: string) => void;
    ref?: Ref<HTMLInputElement>;
    rightSlot?: ReactNode;
    size?: InputSize;
    value?: string | number;
};
const renderLocalInput = ({ allowAutoComplete = false, autoComplete, className = "", disabled = false, error, fieldClassName = "", hideSpinner = false, hint, id, idBase, inputClassName = "", label, labelPlacement = "stack", onChange, ref, rightSlot, size = "md", value, ...props }: LocalInputProps) => {
    const inputId = id ?? (idBase ? slugifyInputId(idBase) : undefined);
    const errorId = inputId ? `${inputId}-error` : undefined;
    const hintId = inputId ? `${inputId}-hint` : undefined;
    const describedBy = mergeSpaceSeparatedIds(props["aria-describedby"], error ? errorId : hint ? hintId : undefined);
    const labelNode = label ? jsx("label", {
        htmlFor: inputId,
        className: "input_label",
        children: label
    }) : null;
    const fieldNode = jsx("div", {
        className: getInputFieldClassName({ fieldClassName, size }),
        "data-icon": "without",
        "data-state": getInputFieldState({ disabled, error: Boolean(error) }),
        ...getInputDataAttributes({}),
        children: [
            jsx("input", {
                ...props,
                ref,
                id: inputId,
                value: value ?? "",
                onChange: (event: ChangeEvent<HTMLInputElement>) => onChange?.(event.currentTarget.value),
                disabled,
                "aria-invalid": Boolean(error),
                "aria-describedby": describedBy,
                autoComplete: allowAutoComplete ? autoComplete : "off",
                className: getInputNativeClassName({ hideSpinner, inputClassName })
            }),
            rightSlot ? jsx("div", { className: "input_right", children: rightSlot }) : null
        ]
    });
    return jsx("div", {
        className: getInputWrapperClassName(className),
        "data-style": "input",
        children: [
            label && labelPlacement === "inline" ? jsx("div", { className: "flex items-center gap-2", children: [labelNode, fieldNode] }) : [labelNode, fieldNode],
            error ? jsx("div", { id: errorId, className: "input_error", children: error }) : null,
            !error && hint ? jsx("div", { id: hintId, className: "input_hint", children: hint }) : null
        ]
    });
};
export type TemplateManagerProps = {
    previewFile?: PreviewFileLike | null;
    previewStatus?: Partial<SessionPreviewStatus> | null;
    rawData?: RawDataEntry[];
    getPreviewRow?: (rowIndex: number) => unknown;
    ensurePreviewCells?: (fileId: string, cells: Array<{
        colIndex: number;
        rowIndex: number;
    }>) => Promise<unknown> | unknown;
    ensurePreviewRows?: (fileId: string, startRow: number, endRow: number) => Promise<unknown> | unknown;
    onTemplateApplied?: (config: Record<string, unknown>) => unknown;
    onTemplateAppliedIncremental?: (config: Record<string, unknown>) => unknown;
    subscribePreviewRowsVersion?: (onStoreChange: () => void) => () => void;
    getPreviewRowsVersion?: () => number;
    analysisSettings?: Record<string, unknown> | null;
    onUpdateSettings?: (updates: Record<string, unknown>) => Promise<unknown> | unknown;
};
const TemplateManagerPreviewFallback = ({ previewFile, previewStatus, t, }: {
    previewFile?: PreviewFileLike | null;
    previewStatus?: Partial<SessionPreviewStatus> | null;
    t: TranslateFn;
}) => {
    const title = previewStatus?.state === "loading"
        ? previewStatus.message || t("da_preview_loading")
        : previewStatus?.state === "error"
            ? previewStatus.message || t("da_preview_error")
            : undefined;
    const hint = previewStatus?.state === "loading"
        ? t("da_preview_loading_hint")
        : previewStatus?.state === "error"
            ? t("da_preview_error_hint")
            : t("da_preview_select_file_hint");
    return (jsx(TemplateManagerPreviewSurface, {
        previewFile: previewFile,
        previewStatus: previewStatus,
        t: t,
        children: jsx(TemplateManagerPreviewEmptyState, {
            id: "analysis-template-preview-fallback",
            title: title,
            hint: hint
        })
    }));
};
const X_AUTO_SUGGESTION_MAX_SCAN_ROWS = 5000;
const AUTO_EXTRACTION_PREVIEW_MAX_ROWS = 512;
const FILE_NAME_TEMPLATE_RULE_PREFIX = "rule";
const TEMPLATE_CREATE_OPTION_VALUE = "__template-create__";
const TEMPLATE_LOADING_OPTION_VALUE = "__template-loading__";
const TEMPLATE_EMPTY_OPTION_VALUE = "__template-empty__";
type FileNameTemplateRuleDraft = {
    id: string;
    matchMode: "field" | "phrase";
    pattern: string;
    templateName: string;
};
type FileNameTemplateRuleRuntimeConfig = {
    id: string;
    matchMode: "field" | "phrase";
    pattern: string;
    templateName: string;
    templateConfig: TemplateConfig;
};
type FileNameTemplateRulePayload = {
    matchMode: "field" | "phrase";
    pattern: string;
    templateName: string;
    templateConfig: TemplateConfig;
    caseSensitive: boolean;
};
const TemplateManager = ({ previewFile, previewStatus, rawData = [], getPreviewRow, ensurePreviewCells, ensurePreviewRows, onTemplateApplied, onTemplateAppliedIncremental, subscribePreviewRowsVersion, getPreviewRowsVersion, analysisSettings, onUpdateSettings, }: TemplateManagerProps) => {
    const { t, language } = useLanguage();
    const templateService = useMemo(() => new BrowserTemplateService(), []);
    const { processedData, selectedTemplateId, setSelectedTemplateId, selectedPreviewFileId, setSelectedPreviewFileId, } = useSession();
    const tLoose = useCallback((key: string, params?: Record<string, unknown>) => t(key, params as TranslationVars | undefined), [t]);
    const sanitizeFileNamePrefixInput = useCallback((value: unknown) => joinFileNameMatchInput(splitFileNameMatchInput(value, true)), []);
    const importFileInputRef = useRef<HTMLInputElement | null>(null);
    const [toast, setToast] = useState({
        isVisible: false,
        message: "",
        type: "success" as ToastType,
    });
    const [previewRowsVersionSnapshot, setPreviewRowsVersionSnapshot] = useState(0);
    const showToast = useCallback((message: string, type = "warning") => {
        const safeType: ToastType = type === "success" || type === "error" || type === "warning" || type === "info"
            ? type
            : "warning";
        setToast({ isVisible: true, message, type: safeType });
    }, []);
    const closeToast = useCallback(() => {
        setToast((prev) => ({ ...prev, isVisible: false }));
    }, []);
    const configPanelRef = useRef<HTMLDivElement | null>(null);
    const [configPanelWidth, setConfigPanelWidth] = useState<number>(0);
    const shouldCollapseTemplateModeTabs = configPanelWidth > 0 &&
        configPanelWidth < TEMPLATE_MODE_ICON_ONLY_THRESHOLD_PX;
    const shouldCollapseTemplateTransferButtons = shouldCollapseTemplateModeTabs;
    const applyToAllShortLabel = language === "zh" ? "应用" : "Apply";
    const applyToNewShortLabel = language === "zh" ? "新增" : "New";
    const containerRef = useRef<HTMLElement | null>(null);
    const toastRef = useRef<Toast | null>(null);
    useEffect(() => {
        const toastController = new Toast();
        toastRef.current = toastController;
        return () => {
            toastRef.current = null;
            toastController.dispose();
        };
    }, []);
    useEffect(() => {
        const toastController = toastRef.current;
        if (!toastController)
            return;
        if (!toast.isVisible) {
            toastController.hide();
            return;
        }
        toastController.show({
            container: containerRef.current,
            message: toast.message,
            onClose: closeToast,
            position: "absolute",
            type: toast.type,
        });
    }, [closeToast, toast.isVisible, toast.message, toast.type]);
    useEffect(() => {
        const panelEl = configPanelRef.current;
        if (!panelEl || typeof ResizeObserver === "undefined")
            return undefined;
        const updateWidth = () => {
            setConfigPanelWidth(panelEl.getBoundingClientRect().width);
        };
        updateWidth();
        const observer = new ResizeObserver(() => {
            updateWidth();
        });
        observer.observe(panelEl);
        return () => {
            observer.disconnect();
        };
    }, []);
    const yUnitOptions = useMemo(() => Y_UNIT_VALUES.map((unit) => ({
        label: unit,
        value: unit,
    })), []);
    const xUnitOptions = useMemo(() => ["V", "mV"].map((unit) => ({
        label: unit,
        value: unit,
    })), []);
    const xSegmentationModeOptions = useMemo(() => [
        { label: t("da_save_segmentation_mode_auto"), value: "auto" },
        { label: t("da_save_segmentation_mode_points"), value: "points" },
        { label: t("da_save_segmentation_mode_segments"), value: "segments" },
    ], [t]);
    const legendMappingOptions = useMemo(() => [
        { label: t("da_save_legend_mapping_auto"), value: "auto" },
        { label: t("da_save_legend_mapping_y_column"), value: "yColumn" },
        { label: t("da_save_legend_mapping_x_group"), value: "group" },
    ], [t]);
    const fileNameRuleModeOptions = useMemo(() => [
        { label: t("da_match_mode_field"), value: "field" },
        { label: t("da_match_mode_phrase"), value: "phrase" },
    ], [t]);
    const { applyConfigurationWithExternalConfig, applyNewFilesConfigurationWithExternalConfig, closeDiscardConfirm, config, confirmDiscardAndSwitch, createTemplateExportBundle, ensureTemplatesLoaded, handleCreateNewTemplate, handleDeleteTemplate, importTemplatesFromPayload, handleSaveTemplate, handleTemplateModeChange, isDiscardConfirmOpen, isSelectMode, loadTemplate, markFieldSource, markSaveDraftTouched, setConfig, templateTransferBusy, templateMode, templates, templatesLoading, writeFieldFromPreview, selectAutoTemplate, } = useTemplateManagerState({
        analysisSettings,
        onTemplateApplied,
        onTemplateAppliedIncremental,
        onUpdateSettings,
        previewFile,
        previewStatus: previewStatus ?? undefined,
        showToast,
        t: tLoose,
    });
    const previewWorkspaceFallback = (jsx(TemplateManagerPreviewFallback, {
        previewFile: previewFile,
        previewStatus: previewStatus,
        t: t
    }));
    const shouldRenderPreviewWorkspace = Boolean(previewFile?.fileId) && previewStatus?.state === "ready";
    const availableTemplateNames = useMemo(() => (Array.isArray(templates) ? templates : [])
        .map((entry) => String(entry?.name ?? "").trim())
        .filter(Boolean), [templates]);
    const availableTemplateOptions = useMemo(() => availableTemplateNames.map((name) => ({ label: name, value: name })), [availableTemplateNames]);
    const resolvedFileNameFieldSeparators = useMemo(() => normalizeFileNameFieldSeparators(analysisSettings?.fileNameFieldSeparators), [analysisSettings?.fileNameFieldSeparators]);
    const fileNameFieldSuggestions = useMemo(() => deriveFileNameFieldSuggestions((Array.isArray(rawData) ? rawData : []).map((entry) => entry?.fileName), {
        caseSensitive: Boolean(config?.fileNameMatchCaseSensitive),
        separators: resolvedFileNameFieldSeparators,
    }), [
        config?.fileNameMatchCaseSensitive,
        rawData,
        resolvedFileNameFieldSeparators,
    ]);
    const lowConfidenceReviewFiles = useMemo(() => {
        const processedById = new Map((Array.isArray(processedData) ? processedData : [])
            .filter((entry) => typeof entry?.fileId === "string" && entry.fileId)
            .map((entry) => [String(entry.fileId), entry]));
        const reviewFiles: RawDataEntry[] = [];
        for (const entry of Array.isArray(processedData) ? processedData : []) {
            if (!entry?.fileId)
                continue;
            if (entry.curveTypeNeedsTemplate === true ||
                entry.curveTypeConfidence === "low") {
                reviewFiles.push(entry);
            }
        }
        for (const entry of Array.isArray(rawData) ? rawData : []) {
            const fileId = String(entry?.fileId ?? "").trim();
            if (!fileId || processedById.has(fileId))
                continue;
            if (entry.curveTypeNeedsTemplate === true ||
                entry.curveTypeConfidence === "low") {
                reviewFiles.push(entry);
            }
        }
        return reviewFiles;
    }, [processedData, rawData]);
    const activeLowConfidenceFile = useMemo(() => {
        if (!lowConfidenceReviewFiles.length)
            return null;
        return (lowConfidenceReviewFiles.find((entry) => entry?.fileId === selectedPreviewFileId) || lowConfidenceReviewFiles[0]);
    }, [lowConfidenceReviewFiles, selectedPreviewFileId]);
    const activeLowConfidenceReasons = useMemo(() => Array.isArray(activeLowConfidenceFile?.curveTypeReasons)
        ? activeLowConfidenceFile.curveTypeReasons
            .map((entry) => String(entry ?? "").trim())
            .filter(Boolean)
            .slice(0, 3)
        : [], [activeLowConfidenceFile]);
    const translateLowConfidenceReason = useCallback((reason: string) => {
        const normalized = String(reason ?? "").trim();
        if (!normalized)
            return normalized;
        switch (normalized) {
            case "Shape only exposes generic CH1/CH2 sweep columns, so the gate/drain meaning is not reliable without a template.":
                return t("da_low_confidence_reason_shape_generic_channels");
            case "No reliable transfer/output metadata was found.":
                return t("da_low_confidence_reason_no_reliable_metadata");
            case "Metadata signals disagree on whether VAR1/X belongs to Vg or Vd.":
                return t("da_low_confidence_reason_metadata_conflict");
            default:
                return normalized;
        }
    }, [t]);
    const translateLowConfidenceCurveType = useCallback((value: unknown) => {
        const normalized = String(value ?? "").trim().toLowerCase();
        if (normalized.startsWith("transfer")) {
            return t("da_low_confidence_type_transfer");
        }
        if (normalized.startsWith("output")) {
            return t("da_low_confidence_type_output");
        }
        switch (normalized) {
            case "transfer":
                return t("da_low_confidence_type_transfer");
            case "output":
                return t("da_low_confidence_type_output");
            case "unknown":
            default:
                return t("da_low_confidence_type_unknown");
        }
    }, [t]);
    const translateLowConfidenceConfidence = useCallback((value: unknown) => {
        const normalized = String(value ?? "").trim().toLowerCase();
        switch (normalized) {
            case "high":
                return t("da_low_confidence_confidence_high");
            case "medium":
                return t("da_low_confidence_confidence_medium");
            case "low":
            default:
                return t("da_low_confidence_confidence_low");
        }
    }, [t]);
    const isAutoTemplateSelected = selectedTemplateId === AUTO_TEMPLATE_ID;
    const resolveTemplateByName = useCallback((name: string) => {
        const target = String(name ?? "").trim();
        if (!target)
            return null;
        return ((Array.isArray(templates) ? templates : []).find((entry) => String(entry?.name ?? "").trim() === target) || null);
    }, [templates]);
    const cloneTemplateConfigFromRecord = useCallback((template: Record<string, unknown>): TemplateConfig => {
        return normalizeTemplateConfigRecord({
            ...template,
            xSegmentationMode: resolveXSegmentationMode(template?.xSegmentationMode),
            xDataEnd: normalizeXDataEndValue(template?.xDataEnd),
        });
    }, []);
    const focusLowConfidenceFile = useCallback((fileId: unknown) => {
        const nextFileId = String(fileId ?? "").trim();
        if (!nextFileId)
            return;
        setSelectedPreviewFileId(nextFileId);
    }, [setSelectedPreviewFileId]);
    const handleReviewLowConfidenceFile = useCallback(() => {
        const targetFileId = String(activeLowConfidenceFile?.fileId ?? "").trim();
        if (targetFileId) {
            focusLowConfidenceFile(targetFileId);
        }
        handleTemplateModeChange("save");
    }, [
        activeLowConfidenceFile?.fileId,
        focusLowConfidenceFile,
        handleTemplateModeChange,
    ]);
    const handleFocusNextLowConfidenceFile = useCallback(() => {
        if (!lowConfidenceReviewFiles.length)
            return;
        const currentIndex = lowConfidenceReviewFiles.findIndex((entry) => entry?.fileId === activeLowConfidenceFile?.fileId);
        const nextIndex = currentIndex >= 0
            ? (currentIndex + 1) % lowConfidenceReviewFiles.length
            : 0;
        const nextFile = lowConfidenceReviewFiles[nextIndex];
        if (!nextFile?.fileId)
            return;
        focusLowConfidenceFile(nextFile.fileId);
    }, [
        activeLowConfidenceFile?.fileId,
        focusLowConfidenceFile,
        lowConfidenceReviewFiles,
    ]);
    const varPairValidation = validateVarPair(config?.bottomTitle, config?.legendPrefix, tLoose);
    const [fileNameTemplateRules, setFileNameTemplateRules] = useState<FileNameTemplateRuleDraft[]>([]);
    const [fileNameTemplateRuleIdSeed, setFileNameTemplateRuleIdSeed,] = useState(1);
    const addFileNameTemplateRule = useCallback(() => {
        setFileNameTemplateRules((prev) => [
            ...prev,
            {
                id: `${FILE_NAME_TEMPLATE_RULE_PREFIX}-${fileNameTemplateRuleIdSeed}`,
                matchMode: "field",
                pattern: "",
                templateName: "",
            },
        ]);
        setFileNameTemplateRuleIdSeed((prev) => prev + 1);
    }, [fileNameTemplateRuleIdSeed]);
    const removeFileNameTemplateRule = useCallback((id: string) => {
        setFileNameTemplateRules((prev) => prev.filter((rule) => rule.id !== id));
    }, []);
    const updateFileNameTemplateRule = useCallback((id: string, updates: Partial<FileNameTemplateRuleDraft>) => {
        setFileNameTemplateRules((prev) => prev.map((rule) => {
            const nextMatchMode = updates.matchMode === "phrase" || updates.matchMode === "field"
                ? updates.matchMode
                : rule.matchMode;
            return rule.id === id
                ? {
                    ...rule,
                    ...(nextMatchMode !== rule.matchMode
                        ? {
                            matchMode: nextMatchMode,
                            pattern: nextMatchMode === "field"
                                ? sanitizeFileNamePrefixInput(rule.pattern)
                                : String(rule.pattern ?? "").trim(),
                        }
                        : {}),
                    ...(typeof updates.pattern === "string"
                        ? {
                            pattern: nextMatchMode === "field"
                                ? sanitizeFileNamePrefixInput(updates.pattern)
                                : String(updates.pattern).trim(),
                        }
                        : {}),
                    ...(typeof updates.templateName === "string"
                        ? { templateName: String(updates.templateName) }
                        : {}),
                }
                : rule;
        }));
    }, [sanitizeFileNamePrefixInput]);
    const getRulePatternTokens = useCallback((pattern: string) => splitFileNameMatchInput(pattern, true), []);
    const addPatternTokenToRule = useCallback((id: string, token: string) => {
        const normalizedToken = String(token ?? "").trim();
        if (!normalizedToken)
            return;
        setFileNameTemplateRules((prev) => prev.map((rule) => {
            if (rule.id !== id)
                return rule;
            const existingTokens = getRulePatternTokens(rule.pattern);
            const comparisonToken = Boolean(config?.fileNameMatchCaseSensitive)
                ? normalizedToken
                : normalizedToken.toLowerCase();
            const hasToken = existingTokens.some((entry) => (Boolean(config?.fileNameMatchCaseSensitive)
                ? entry
                : entry.toLowerCase()) === comparisonToken);
            if (hasToken)
                return rule;
            return {
                ...rule,
                pattern: joinFileNameMatchInput([...existingTokens, normalizedToken]),
            };
        }));
    }, [config?.fileNameMatchCaseSensitive, getRulePatternTokens]);
    const removePatternTokenFromRule = useCallback((id: string, token: string) => {
        const normalizedToken = String(token ?? "").trim();
        if (!normalizedToken)
            return;
        setFileNameTemplateRules((prev) => prev.map((rule) => {
            if (rule.id !== id)
                return rule;
            const nextTokens = getRulePatternTokens(rule.pattern).filter((entry) => {
                const left = Boolean(config?.fileNameMatchCaseSensitive)
                    ? entry
                    : entry.toLowerCase();
                const right = Boolean(config?.fileNameMatchCaseSensitive)
                    ? normalizedToken
                    : normalizedToken.toLowerCase();
                return left !== right;
            });
            return {
                ...rule,
                pattern: joinFileNameMatchInput(nextTokens),
            };
        }));
    }, [config?.fileNameMatchCaseSensitive, getRulePatternTokens]);
    const normalizedRuleRuntimeConfigs = useMemo(() => fileNameTemplateRules
        .map((rule) => {
        const pattern = sanitizeFileNamePrefixInput(rule.pattern);
        const phrasePattern = String(rule.pattern ?? "").trim();
        const templateName = String(rule.templateName ?? "").trim();
        if (!templateName)
            return null;
        if (rule.matchMode === "field" && !pattern)
            return null;
        if (rule.matchMode === "phrase" && !phrasePattern)
            return null;
        const templateRecord = resolveTemplateByName(templateName);
        if (!templateRecord)
            return null;
        return {
            id: rule.id,
            matchMode: rule.matchMode,
            pattern: rule.matchMode === "phrase" ? phrasePattern : pattern,
            templateName,
            templateConfig: cloneTemplateConfigFromRecord(templateRecord as Record<string, unknown>),
        } as FileNameTemplateRuleRuntimeConfig;
    })
        .filter(Boolean) as FileNameTemplateRuleRuntimeConfig[], [
        cloneTemplateConfigFromRecord,
        fileNameTemplateRules,
        resolveTemplateByName,
        sanitizeFileNamePrefixInput,
    ]);
    const getRuleMatchCount = useCallback((rule: FileNameTemplateRuleDraft) => {
        if (rule.matchMode === "phrase") {
            const phrase = String(rule.pattern ?? "").trim();
            if (!phrase)
                return 0;
            return (Array.isArray(rawData) ? rawData : []).reduce((count, entry) => {
                return count +
                    (matchFileNameAgainstPhrase(entry?.fileName, phrase, {
                        caseSensitive: Boolean(config?.fileNameMatchCaseSensitive),
                    })
                        ? 1
                        : 0);
            }, 0);
        }
        const patternTokens = splitFileNameMatchInput(rule.pattern, Boolean(config?.fileNameMatchCaseSensitive));
        if (!patternTokens.length)
            return 0;
        return (Array.isArray(rawData) ? rawData : []).reduce((count, entry) => {
            return count +
                (matchFileNameAgainstPatternTokens(entry?.fileName, patternTokens, {
                    caseSensitive: Boolean(config?.fileNameMatchCaseSensitive),
                    separators: resolvedFileNameFieldSeparators,
                })
                    ? 1
                    : 0);
        }, 0);
    }, [
        config?.fileNameMatchCaseSensitive,
        rawData,
        resolvedFileNameFieldSeparators,
    ]);
    const buildRuleSuggestionOptions = useCallback((rule: FileNameTemplateRuleDraft) => {
        if (rule.matchMode !== "field")
            return [];
        const caseSensitive = Boolean(config?.fileNameMatchCaseSensitive);
        const minimumPinnedSuggestionCount = 5;
        const defaultSuggestionLimit = 10;
        const normalizedPatternTokens = new Set(splitFileNameMatchInput(rule.pattern, caseSensitive));
        const rankedSuggestions = fileNameFieldSuggestions.reduce<Array<{
            count: number;
            label: ReactElement;
            score: number;
            value: string;
        }>>((entries, suggestion) => {
            const comparisonValue = caseSensitive
                ? suggestion.value
                : suggestion.normalizedValue;
            if (normalizedPatternTokens.has(comparisonValue))
                return entries;
            entries.push({
                count: suggestion.count,
                label: (jsxs("div", {
                    className: "flex min-w-0 flex-col",
                    children: [
                        jsx("span", {
                            className: "truncate font-medium text-text-primary",
                            children: suggestion.value
                        }),
                        jsx("span", {
                            className: "truncate text-xs text-text-secondary",
                            children: t("da_match_field_suggestion_matches", {
                                count: suggestion.count,
                            })
                        })
                    ]
                })),
                score: suggestion.score,
                value: suggestion.value,
            });
            return entries;
        }, []);
        return rankedSuggestions
            .sort((left, right) => right.score - left.score)
            .filter((entry, index) => index < defaultSuggestionLimit ||
            entry.count >= minimumPinnedSuggestionCount)
            .map((entry) => ({
            label: entry.label,
            value: entry.value,
        }));
    }, [
        config?.fileNameMatchCaseSensitive,
        fileNameFieldSuggestions,
        t,
    ]);
    const applyFileNameTemplateRules = useCallback((incremental: boolean) => {
        const applyHandler = incremental
            ? applyNewFilesConfigurationWithExternalConfig
            : applyConfigurationWithExternalConfig;
        if (!normalizedRuleRuntimeConfigs.length) {
            applyHandler(config as unknown as Record<string, unknown>);
            return;
        }
        const rulePayload = normalizedRuleRuntimeConfigs.map((rule) => ({
            matchMode: rule.matchMode,
            pattern: rule.pattern,
            templateName: rule.templateName,
            caseSensitive: Boolean(config?.fileNameMatchCaseSensitive),
            templateConfig: {
                ...rule.templateConfig,
                fileNameVgKeywords: "",
                fileNameVdKeywords: "",
            },
        })) as FileNameTemplateRulePayload[];
        const ruleConfig: Record<string, unknown> = {
            fileNameFieldSeparators: resolvedFileNameFieldSeparators,
            fileNameTemplateRules: rulePayload,
            fallbackTemplateConfig: { ...config },
            stopOnError: Boolean(config?.stopOnError),
        };
        applyHandler(ruleConfig);
    }, [
        applyConfigurationWithExternalConfig,
        applyNewFilesConfigurationWithExternalConfig,
        config,
        resolvedFileNameFieldSeparators,
        normalizedRuleRuntimeConfigs,
    ]);
    useEffect(() => {
        if (templateMode === "select") {
            void ensureTemplatesLoaded().catch(() => { });
        }
    }, [ensureTemplatesLoaded, templateMode]);
    useEffect(() => {
        if (!availableTemplateNames.length) {
            setFileNameTemplateRules((prev) => prev.map((rule) => ({ ...rule, templateName: "" })));
            return;
        }
        setFileNameTemplateRules((prev) => prev.map((rule) => {
            const templateName = String(rule.templateName ?? "").trim();
            if (!templateName)
                return rule;
            if (availableTemplateNames.includes(templateName))
                return rule;
            return { ...rule, templateName: "" };
        }));
    }, [availableTemplateNames]);
    useEffect(() => {
        if (templateMode !== "save") {
        }
    }, [templateMode]);
    const lastVarPairToastRef = useRef("");
    const xSegmentationMode = resolveXSegmentationMode(config?.xSegmentationMode);
    const xRangeForPreview = useMemo(() => resolveXRangeForPreview({
        xDataStart: config?.xDataStart,
        xDataEnd: config?.xDataEnd,
        previewRowCount: previewFile?.rowCount,
    }), [config?.xDataEnd, config?.xDataStart, previewFile?.rowCount]);
    const parsePreviewCellRef = useCallback((value: unknown) => {
        const text = String(value ?? "").trim().toUpperCase();
        const match = text.match(/^([A-Z]+)([1-9]\d*)$/);
        if (!match)
            return null;
        let colIndex = 0;
        for (const char of match[1]) {
            colIndex = colIndex * 26 + (char.charCodeAt(0) - 64);
        }
        return {
            colIndex: colIndex - 1,
            rowIndex: Number(match[2]) - 1,
        };
    }, []);
    useEffect(() => {
        if (typeof subscribePreviewRowsVersion !== "function")
            return undefined;
        const syncPreviewRowsVersion = () => {
            if (typeof getPreviewRowsVersion === "function") {
                setPreviewRowsVersionSnapshot(getPreviewRowsVersion());
                return;
            }
            setPreviewRowsVersionSnapshot((prev) => prev + 1);
        };
        syncPreviewRowsVersion();
        const unsubscribe = subscribePreviewRowsVersion(syncPreviewRowsVersion);
        return () => {
            if (typeof unsubscribe === "function")
                unsubscribe();
        };
    }, [getPreviewRowsVersion, subscribePreviewRowsVersion]);
    useEffect(() => {
        if (!isAutoTemplateSelected)
            return;
        if (typeof ensurePreviewRows !== "function")
            return;
        const fileId = String(previewFile?.fileId ?? "").trim();
        if (!fileId)
            return;
        const targetRows = Math.min(Math.max(0, Number(previewFile?.rowCount) || 0), AUTO_EXTRACTION_PREVIEW_MAX_ROWS);
        if (targetRows <= 0)
            return;
        void ensurePreviewRows(fileId, 0, targetRows);
    }, [
        ensurePreviewRows,
        isAutoTemplateSelected,
        previewFile?.fileId,
        previewFile?.rowCount,
    ]);
    useEffect(() => {
        if (typeof ensurePreviewRows !== "function")
            return;
        const fileId = String(previewFile?.fileId ?? "").trim();
        if (!fileId || !xRangeForPreview)
            return;
        const startRow = Math.max(0, xRangeForPreview.startRow);
        const endRowExclusive = Math.min(xRangeForPreview.endRow + 1, startRow + X_AUTO_SUGGESTION_MAX_SCAN_ROWS);
        if (endRowExclusive <= startRow)
            return;
        void ensurePreviewRows(fileId, startRow, endRowExclusive);
    }, [
        ensurePreviewRows,
        previewFile?.fileId,
        xRangeForPreview?.endRow,
        xRangeForPreview?.startRow,
    ]);
    useEffect(() => {
        if (typeof ensurePreviewCells !== "function")
            return;
        const fileId = String(previewFile?.fileId ?? "").trim();
        if (!fileId)
            return;
        const cells = [
            config?.xPointsPerGroup,
            config?.yLegendStart,
            config?.yLegendCount,
            config?.yLegendStep,
        ]
            .map(parsePreviewCellRef)
            .filter((cell): cell is {
            colIndex: number;
            rowIndex: number;
        } => cell !== null);
        if (!cells.length)
            return;
        void ensurePreviewCells(fileId, cells);
    }, [
        config?.xPointsPerGroup,
        config?.yLegendCount,
        config?.yLegendStart,
        config?.yLegendStep,
        ensurePreviewCells,
        parsePreviewCellRef,
        previewFile?.fileId,
    ]);
    const xAutoSuggestion = useMemo(() => inferXSegmentationSuggestionFromPreview({
        xDataStart: config?.xDataStart,
        xDataEnd: config?.xDataEnd,
        previewRowCount: previewFile?.rowCount,
        getPreviewRow,
        maxScanRows: X_AUTO_SUGGESTION_MAX_SCAN_ROWS,
    }), [
        config?.xDataEnd,
        config?.xDataStart,
        getPreviewRow,
        previewFile?.rowCount,
        previewRowsVersionSnapshot,
    ]);
    const xAutoSuggestionText = xAutoSuggestion && xAutoSuggestion.groupSize > 0
        ? t("da_save_x_auto_suggestion", {
            groups: xAutoSuggestion.groups,
            points: xAutoSuggestion.groupSize,
        })
        : t("da_save_x_auto_suggestion_none");
    const autoPreviewRows = useMemo(() => {
        if (!isAutoTemplateSelected)
            return [];
        if (typeof getPreviewRow !== "function")
            return [];
        const targetRows = Math.min(Math.max(0, Number(previewFile?.rowCount) || 0), AUTO_EXTRACTION_PREVIEW_MAX_ROWS);
        if (targetRows <= 0)
            return [];
        const rows: Array<Array<unknown> | null | undefined> = [];
        for (let rowIndex = 0; rowIndex < targetRows; rowIndex += 1) {
            const row = getPreviewRow(rowIndex);
            if (!Array.isArray(row))
                break;
            rows.push(row);
        }
        return rows;
    }, [
        getPreviewRow,
        isAutoTemplateSelected,
        previewFile?.rowCount,
        previewRowsVersionSnapshot,
    ]);
    const autoExtractionPreviewResult = useMemo<AutoExtractionResult | null>(() => {
        if (!isAutoTemplateSelected)
            return null;
        if (!autoPreviewRows.length)
            return null;
        return inferAutoExtraction({
            fileName: previewFile?.fileName || previewFile?.fileId || "preview",
            rows: autoPreviewRows,
            totalRowCount: previewFile?.rowCount,
        });
    }, [
        autoPreviewRows,
        isAutoTemplateSelected,
        previewFile?.fileId,
        previewFile?.fileName,
        previewFile?.rowCount,
    ]);
    const autoTemplateConfig = useMemo(() => {
        if (!isAutoTemplateSelected)
            return null;
        const baseConfig = createEmptyTemplateConfig({
            fileNameMatchCaseSensitive: Boolean(config?.fileNameMatchCaseSensitive),
            stopOnError: Boolean(config?.stopOnError),
        });
        if (!autoExtractionPreviewResult?.ok) {
            return baseConfig;
        }
        return normalizeTemplateConfigRecord({
            ...baseConfig,
            ...buildAutoTemplateConfig(autoExtractionPreviewResult.plan),
        });
    }, [
        autoExtractionPreviewResult,
        config?.fileNameMatchCaseSensitive,
        config?.stopOnError,
        isAutoTemplateSelected,
    ]);
    useEffect(() => {
        if (!isAutoTemplateSelected || !autoTemplateConfig)
            return;
        setConfig((prev) => {
            const next = {
                ...prev,
                ...autoTemplateConfig,
                name: "",
            };
            return stableStringify(next) === stableStringify(prev) ? prev : next;
        });
    }, [autoTemplateConfig, isAutoTemplateSelected, setConfig]);
    const autoPreviewHeaders = useMemo(() => {
        if (!autoExtractionPreviewResult?.ok)
            return [];
        const headerRowIndex = Math.max(0, autoExtractionPreviewResult.plan.dataStartRowIndex - 1);
        const headerRow = autoPreviewRows[headerRowIndex];
        return Array.isArray(headerRow)
            ? headerRow.map((value) => String(value ?? "").trim())
            : [];
    }, [autoExtractionPreviewResult, autoPreviewRows]);
    const autoGroupingSummary = useMemo(() => {
        if (!autoExtractionPreviewResult?.ok) {
            return t("da_auto_template_summary_none");
        }
        const explicitPoints = Number(autoExtractionPreviewResult.plan.xPointsPerGroup);
        const points = Number.isInteger(explicitPoints) && explicitPoints > 0
            ? explicitPoints
            : Number.isInteger(Number(previewFile?.rowCount)) &&
                Number(previewFile?.rowCount) > autoExtractionPreviewResult.plan.dataStartRowIndex
                ? Number(previewFile?.rowCount) - autoExtractionPreviewResult.plan.dataStartRowIndex
                : null;
        const explicitGroups = Number(autoExtractionPreviewResult.plan.groups);
        const groups = Number.isInteger(explicitGroups) && explicitGroups > 0
            ? explicitGroups
            : points !== null
                ? 1
                : null;
        if (points === null) {
            return t("da_auto_template_summary_none");
        }
        return groups !== null
            ? t("da_auto_template_summary_points_groups", {
                groups,
                points,
            })
            : t("da_auto_template_summary_points_only", {
                points,
            });
    }, [autoExtractionPreviewResult, previewFile?.rowCount, t]);
    const resolveAutoColumnLabel = useCallback((colIndex: number | null) => {
        if (!Number.isInteger(colIndex) || Number(colIndex) < 0) {
            return t("da_auto_template_summary_none");
        }
        const header = String(autoPreviewHeaders[Number(colIndex)] ?? "").trim();
        return header || getExcelColumnLabel(Number(colIndex));
    }, [autoPreviewHeaders, t]);
    const formatAutoSummaryNumber = useCallback((value: number | null | undefined) => {
        if (!Number.isFinite(value))
            return "";
        return `${Number(Number(value).toPrecision(12))}`;
    }, []);
    const formatAutoLegendValue = useCallback((value: unknown) => {
        const text = String(value ?? "").trim();
        if (!text)
            return "";
        const numeric = Number(text);
        return Number.isFinite(numeric) ? formatAutoSummaryNumber(numeric) : text;
    }, [formatAutoSummaryNumber]);
    const resolveAutoLegendSummary = useCallback((result: AutoExtractionResult | null) => {
        if (!result?.ok) {
            return t("da_auto_template_summary_none");
        }
        const { plan } = result;
        const prefix = String(plan.legendPrefix ?? "").trim() ||
            t("da_auto_template_summary_legend");
        if (Number(plan.legendCount) === 1) {
            if (Number.isInteger(plan.legendStartRowIndex) &&
                Number(plan.legendStartRowIndex) >= 0 &&
                Number.isInteger(plan.legendStartColIndex) &&
                Number(plan.legendStartColIndex) >= 0) {
                const rawValue = autoPreviewRows[Number(plan.legendStartRowIndex)]?.[Number(plan.legendStartColIndex)];
                const value = formatAutoLegendValue(rawValue);
                if (value) {
                    return t("da_auto_template_summary_legend_fixed", {
                        prefix,
                        value,
                    });
                }
            }
            const value = formatAutoLegendValue(plan.legendStartValue);
            if (value) {
                return t("da_auto_template_summary_legend_fixed", {
                    prefix,
                    value,
                });
            }
        }
        if (Number.isInteger(plan.legendStartColIndex) &&
            Number(plan.legendStartColIndex) >= 0) {
            return resolveAutoColumnLabel(plan.legendStartColIndex);
        }
        const start = String(plan.legendStartValue ?? "").trim();
        const count = Number(plan.legendCount);
        const step = Number(plan.legendStep);
        if (start && Number.isInteger(count) && count > 0) {
            if (Number.isFinite(step) && step > 0) {
                return t("da_auto_template_summary_legend_generated", {
                    count,
                    prefix,
                    start,
                    step: formatAutoSummaryNumber(step),
                });
            }
            return t("da_auto_template_summary_legend_generated_no_step", {
                count,
                prefix,
                start,
            });
        }
        return t("da_auto_template_summary_none");
    }, [autoPreviewRows, formatAutoLegendValue, formatAutoSummaryNumber, resolveAutoColumnLabel, t]);
    const autoApplyConfig = useMemo(() => ({
        autoExtractionMode: true,
        stopOnError: Boolean(config?.stopOnError),
    }), [config?.stopOnError]);
    const applyAutoTemplate = useCallback((incremental: boolean) => {
        const applyHandler = incremental
            ? applyNewFilesConfigurationWithExternalConfig
            : applyConfigurationWithExternalConfig;
        applyHandler(autoApplyConfig);
    }, [
        applyConfigurationWithExternalConfig,
        applyNewFilesConfigurationWithExternalConfig,
        autoApplyConfig,
    ]);
    const handleSelectAutoTemplate = useCallback(() => {
        selectAutoTemplate();
        setSelectedTemplateId(AUTO_TEMPLATE_ID);
    }, [selectAutoTemplate, setSelectedTemplateId]);
    const toastVarPairIfInvalid = useCallback(() => {
        if (varPairValidation.ok) {
            lastVarPairToastRef.current = "";
            return;
        }
        const message = varPairValidation.message || t("da_invalidVarPair");
        if (lastVarPairToastRef.current === message)
            return;
        lastVarPairToastRef.current = message;
        showToast(message, "warning");
    }, [showToast, t, varPairValidation.ok, varPairValidation.message]);
    const handleExportTemplates = useCallback(async () => {
        const bundle = await createTemplateExportBundle();
        if (!bundle)
            return;
        try {
            templateService.downloadTemplateBundle(bundle);
            showToast(t("da_template_export_success", {
                count: 1,
            }), "success");
        }
        catch (error) {
            showToast(t("da_template_export_failed", {
                error: error instanceof Error ? error.message : t("unknownError"),
            }), "warning");
        }
    }, [createTemplateExportBundle, showToast, t, templateService]);
    const handleImportTemplatesClick = useCallback(() => {
        importFileInputRef.current?.click();
    }, []);
    const handleImportTemplatesFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        if (!file)
            return;
        try {
            await templateService.importTemplateFile(file, importTemplatesFromPayload);
        }
        catch (error) {
            showToast(t("da_template_import_read_failed", {
                error: error instanceof Error ? error.message : t("unknownError"),
            }), "warning");
        }
        finally {
            input.value = "";
        }
    }, [importTemplatesFromPayload, showToast, t, templateService]);
    const renderSavePanel = ({ includeIds = true, selectModeForDisabled = false, } = {}) => {
        const saveIsSelectMode = Boolean(selectModeForDisabled);
        const setConfigFromSave = (updater: Parameters<StateSetter<TemplateConfig>>[0]) => {
            markSaveDraftTouched();
            setConfig(updater);
        };
        const isXAutoMode = xSegmentationMode === "auto";
        const isXSegmentsMode = xSegmentationMode === "segments";
        const xSegmentationInputValue = isXAutoMode
            ? ""
            : isXSegmentsMode
                ? String(config.xSegmentCount ?? "")
                : String(config.xPointsPerGroup ?? "");
        const xSegmentationInputPlaceholder = isXAutoMode
            ? t("da_save_segmentation_mode_auto")
            : isXSegmentsMode
                ? t("da_save_segments")
                : t("da_save_points");
        return (jsxs("div", {
            className: "space-y-4",
            children: [
                jsxs("div", {
                    children: [
                        jsxs("div", {
                            className: "mb-2 flex items-center justify-between gap-2",
                            children: [
                                jsx("label", {
                                    className: "block text-sm font-medium text-text-secondary",
                                    children: t("da_save_x_data_label")
                                }),
                                jsx("span", {
                                    className: "text-xs text-text-secondary text-right",
                                    children: xAutoSuggestionText
                                })
                            ]
                        }),
                        jsxs("div", {
                            className: "grid grid-cols-2 gap-4",
                            children: [
                                jsx("div", {
                                    children: renderLocalInput( {
                                        id: includeIds
                                            ? "analysis-template-x-data-start"
                                            : undefined,
                                        name: "xDataStart",
                                        value: config.xDataStart,
                                        disabled: saveIsSelectMode,
                                        onChange: (next: string) => {
                                            setConfigFromSave((prev) => ({ ...prev, xDataStart: next }));
                                            markFieldSource("xDataStart", "manual");
                                        },
                                        placeholder: t("da_save_start")
                                    })
                                }),
                                jsx("div", {
                                    children: renderLocalInput( {
                                        id: includeIds ? "analysis-template-x-data-end" : undefined,
                                        name: "xDataEnd",
                                        value: config.xDataEnd,
                                        disabled: saveIsSelectMode,
                                        onChange: (next: string) => {
                                            setConfigFromSave((prev) => ({ ...prev, xDataEnd: next }));
                                            markFieldSource("xDataEnd", "manual");
                                        },
                                        onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
                                            const value = String(e?.target?.value ?? "").trim();
                                            const normalizedEnd = normalizeXDataEndValue(value);
                                            if (!value) {
                                                const startCell = String(config.xDataStart ?? "").trim();
                                                setConfigFromSave((prev) => ({
                                                    ...prev,
                                                    xDataEnd: startCell ? "End" : "",
                                                }));
                                                return;
                                            }
                                            if (normalizedEnd === "End" && value !== "End") {
                                                setConfigFromSave((prev) => ({ ...prev, xDataEnd: "End" }));
                                            }
                                        },
                                        placeholder: t("da_save_end")
                                    })
                                }),
                                jsx("div", {
                                    children: renderLocalInput( {
                                        id: includeIds ? "analysis-template-x-points" : undefined,
                                        name: isXSegmentsMode ? "xSegmentCount" : "xPointsPerGroup",
                                        value: xSegmentationInputValue,
                                        disabled: saveIsSelectMode || isXAutoMode,
                                        onChange: (next: string) => {
                                            if (isXAutoMode)
                                                return;
                                            if (isXSegmentsMode) {
                                                setConfigFromSave((prev) => ({ ...prev, xSegmentCount: next }));
                                                markFieldSource("xSegmentCount", "manual");
                                                return;
                                            }
                                            setConfigFromSave((prev) => ({ ...prev, xPointsPerGroup: next }));
                                            markFieldSource("xPointsPerGroup", "manual");
                                        },
                                        placeholder: xSegmentationInputPlaceholder,
                                        hideSpinner: true
                                    })
                                }),
                                jsx("div", {
                                    className: "relative min-w-0",
                                    children: jsx(DropdownField, {
                                        id: includeIds
                                            ? "analysis-template-x-segmentation-mode"
                                            : undefined,
                                        menuId: includeIds
                                            ? "analysis-template-x-segmentation-mode-menu"
                                            : undefined,
                                        size: "md",
                                        className: "w-full",
                                        value: xSegmentationMode,
                                        options: xSegmentationModeOptions,
                                        onChange: (value: unknown) => {
                                            const nextMode = resolveXSegmentationMode(value);
                                            setConfigFromSave((prev) => ({
                                                ...prev,
                                                xSegmentationMode: nextMode,
                                            }));
                                            markFieldSource("xSegmentationMode", "manual");
                                        },
                                        placeholder: t("da_save_segmentation_mode"),
                                        disabled: saveIsSelectMode,
                                        stableWidth: false
                                    })
                                }),
                                jsx("div", {
                                    className: "col-span-2 relative min-w-0",
                                    children: jsx(DropdownField, {
                                        id: includeIds ? "analysis-template-x-unit" : undefined,
                                        menuId: includeIds ? "analysis-template-x-unit-menu" : undefined,
                                        size: "md",
                                        className: "w-full",
                                        value: String(config.xUnit || "V"),
                                        options: xUnitOptions,
                                        onChange: (value: unknown) => {
                                            setConfigFromSave((prev) => ({
                                                ...prev,
                                                xUnit: String(value || "V"),
                                            }));
                                            markFieldSource("xUnit", "manual");
                                        },
                                        placeholder: t("da_save_x_unit"),
                                        disabled: saveIsSelectMode,
                                        stableWidth: false
                                    })
                                })
                            ]
                        })
                    ]
                }),
                jsxs("div", {
                    children: [
                        jsx("label", {
                            className: "block text-sm font-medium text-text-secondary mb-2",
                            children: t("da_save_y_data_label")
                        }),
                        jsxs("div", {
                            className: "space-y-4",
                            children: [
                                jsx("div", {
                                    className: "grid grid-cols-1 gap-4",
                                    children: jsx("div", {
                                        className: "min-w-0",
                                        children: renderLocalInput( {
                                            id: includeIds
                                                ? "analysis-template-y-columns"
                                                : undefined,
                                            value: config.yColumns.length > 0
                                                ? config.yColumns
                                                    .slice()
                                                    .sort((a, b) => a - b)
                                                    .map((col) => getExcelColumnLabel(col))
                                                    .join(", ")
                                                : "",
                                            placeholder: t("da_save_check_columns"),
                                            disabled: true,
                                            readOnly: true
                                        })
                                    })
                                }),
                                jsx("div", {
                                    children: jsx("label", {
                                        className: "block text-sm font-medium text-text-secondary mb-2",
                                        children: t("da_save_curve_legend_label")
                                    })
                                }),
                                jsxs("div", {
                                    className: "grid grid-cols-2 gap-4",
                                    children: [
                                        jsx("div", {
                                            className: "min-w-0",
                                            children: renderLocalInput( {
                                                id: includeIds
                                                    ? "analysis-template-legend-start"
                                                    : undefined,
                                                value: config.yLegendStart,
                                                name: "yLegendStart",
                                                disabled: saveIsSelectMode,
                                                onChange: (next: string) => {
                                                    setConfigFromSave((prev) => ({
                                                        ...prev,
                                                        yLegendStart: next,
                                                    }));
                                                    markFieldSource("yLegendStart", "manual");
                                                },
                                                placeholder: t("da_save_start")
                                            })
                                        }),
                                        jsx("div", {
                                            className: "min-w-0",
                                            children: renderLocalInput( {
                                                id: includeIds ? "analysis-template-legend-count" : undefined,
                                                value: config.yLegendCount,
                                                name: "yLegendCount",
                                                disabled: saveIsSelectMode,
                                                onChange: (next: string) => {
                                                    setConfigFromSave((prev) => ({ ...prev, yLegendCount: next }));
                                                    markFieldSource("yLegendCount", "manual");
                                                },
                                                placeholder: t("da_save_count"),
                                                hideSpinner: true
                                            })
                                        }),
                                        jsx("div", {
                                            className: "min-w-0",
                                            children: renderLocalInput( {
                                                id: includeIds ? "analysis-template-legend-step" : undefined,
                                                value: config.yLegendStep,
                                                name: "yLegendStep",
                                                disabled: saveIsSelectMode,
                                                onChange: (next: string) => {
                                                    setConfigFromSave((prev) => ({ ...prev, yLegendStep: next }));
                                                    markFieldSource("yLegendStep", "manual");
                                                },
                                                placeholder: t("da_save_step"),
                                                hideSpinner: true
                                            })
                                        }),
                                        jsx("div", {
                                            className: "min-w-0 relative",
                                            children: jsx(DropdownField, {
                                                id: includeIds
                                                    ? "analysis-template-legend-mapping"
                                                    : undefined,
                                                menuId: includeIds
                                                    ? "analysis-template-legend-mapping-menu"
                                                    : undefined,
                                                size: "md",
                                                className: "w-full",
                                                value: config.yLegendTarget,
                                                options: legendMappingOptions,
                                                onChange: (value: unknown) => {
                                                    const next = value === "yColumn" || value === "group" || value === "auto"
                                                        ? value
                                                        : "auto";
                                                    setConfigFromSave((prev) => ({
                                                        ...prev,
                                                        yLegendTarget: next,
                                                    }));
                                                    markFieldSource("yLegendTarget", "manual");
                                                },
                                                placeholder: t("da_save_legend_mapping"),
                                                disabled: saveIsSelectMode,
                                                stableWidth: false
                                            })
                                        }),
                                        jsx("div", {
                                            className: "min-w-0",
                                            children: renderLocalInput( {
                                                id: includeIds
                                                    ? "analysis-template-legend-prefix"
                                                    : undefined,
                                                value: config.legendPrefix || "",
                                                name: "legendPrefix",
                                                disabled: saveIsSelectMode,
                                                onChange: (next: string) => {
                                                    setConfigFromSave((prev) => ({ ...prev, legendPrefix: next }));
                                                    markFieldSource("legendPrefix", "manual");
                                                },
                                                onBlur: toastVarPairIfInvalid,
                                                placeholder: t("da_save_legend")
                                            })
                                        }),
                                        jsx("div", {
                                            className: "min-w-0 relative",
                                            children: jsx(DropdownField, {
                                                id: includeIds ? "analysis-template-y-unit" : undefined,
                                                menuId: includeIds ? "analysis-template-y-unit-menu" : undefined,
                                                size: "md",
                                                className: "w-full",
                                                value: String(config.yUnit || "A"),
                                                options: yUnitOptions,
                                                onChange: (value: unknown) => {
                                                    setConfigFromSave((prev) => ({
                                                        ...prev,
                                                        yUnit: String(value || "A"),
                                                    }));
                                                    markFieldSource("yUnit", "manual");
                                                },
                                                placeholder: t("da_save_y_unit"),
                                                disabled: saveIsSelectMode,
                                                stableWidth: false
                                            })
                                        })
                                    ]
                                })
                            ]
                        })
                    ]
                }),
                jsx("div", {
                    children: renderLocalInput( {
                        id: includeIds
                            ? "analysis-template-var1-bottom-title"
                            : undefined,
                        label: t("da_save_curve_type"),
                        value: config.bottomTitle || "",
                        name: "bottomTitle",
                        onChange: (next: string) => {
                            setConfigFromSave((prev) => ({ ...prev, bottomTitle: next }));
                            markFieldSource("bottomTitle", "manual");
                        },
                        onBlur: toastVarPairIfInvalid,
                        placeholder: t("da_save_var1")
                    })
                }),
                jsx("div", {
                    className: "min-w-0",
                    children: renderLocalInput( {
                        id: includeIds
                            ? "analysis-template-var3-left-title"
                            : undefined,
                        label: t("da_save_left_title"),
                        value: config.leftTitle || "",
                        name: "leftTitle",
                        onChange: (next: string) => {
                            setConfigFromSave((prev) => ({ ...prev, leftTitle: next }));
                            markFieldSource("leftTitle", "manual");
                        },
                        placeholder: t("da_save_var3")
                    })
                })
            ]
        }));
    };
    const renderSavePane = ({ includeIds = true, selectModeForDisabled = false, } = {}) => (jsxs("div", {
        className: "space-y-4 px-1",
        children: [
            jsxs("div", {
                children: [
                    jsx("label", {
                        className: "block text-sm font-medium text-text-secondary mb-2",
                        children: t("da_general_template")
                    }),
                    jsx("div", {
                        id: includeIds ? "analysis-template-name-row" : undefined,
                        className: "relative flex-1 min-w-0",
                        children: jsx("div", {
                            className: "input_field input_field--xl relative flex-1 min-w-0 pr-1",
                            "data-state": "enable",
                            children: jsxs("div", {
                                className: "relative flex items-center w-full h-full",
                                children: [
                                    jsx("input", {
                                        id: includeIds ? "analysis-template-name" : undefined,
                                        type: "text",
                                        name: "templateName",
                                        autoComplete: "off",
                                        spellCheck: false,
                                        value: config.name,
                                        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                                            const next = e.target.value;
                                            markSaveDraftTouched();
                                            setConfig((prev) => ({ ...prev, name: next }));
                                            markFieldSource("name", "manual");
                                        },
                                        placeholder: t("da_template_name"),
                                        className: "input_native no-focus-outline"
                                    }),
                                    renderLocalButton( {
                                        id: includeIds ? "analysis-template-save-btn" : undefined,
                                        type: "button",
                                        onClick: handleSaveTemplate,
                                        disabled: !config.name.trim(),
                                        variant: "primary",
                                        size: "md",
                                        title: t("da_save_template"),
                                        children: [
                                            t("da_template_mode_save"),
                                            renderLocalCogIcon({
                                                icon: lxArrowUp,
                                                size: 16
                                            })
                                        ]
                                    })
                                ]
                            })
                        })
                    })
                ]
            }),
            renderSavePanel({ includeIds, selectModeForDisabled })
        ]
    }));
    const renderSelectPane = ({ includeIds = true, measureOnly = false, } = {}) => {
        const resolvedInputId = includeIds
            ? "analysis-template-dropdown-btn"
            : undefined;
        const displayName = isAutoTemplateSelected
            ? t("da_auto_template")
            : String(config.name ?? "").trim();
        const hasDisplayName = Boolean(displayName);
        const templateSelectOptions = [
            {
                label: t("da_auto_template"),
                value: AUTO_TEMPLATE_ID,
                onSelect: handleSelectAutoTemplate,
            },
            {
                label: t("da_new_template"),
                value: TEMPLATE_CREATE_OPTION_VALUE,
                tone: "accent" as const,
                onSelect: handleCreateNewTemplate,
                secondaryAction: {
                    ariaLabel: t("da_new_template"),
                    title: t("da_new_template"),
                    icon: TemplateOptionAddIcon,
                    visible: "hover" as const,
                    onClick: () => handleCreateNewTemplate(),
                },
            },
            ...(templatesLoading
                ? [
                    {
                        label: t("da_settings_storage_loading"),
                        value: TEMPLATE_LOADING_OPTION_VALUE,
                        disabled: true,
                    },
                ]
                : templates.length > 0
                    ? templates.map((template) => {
                        const templateId = typeof template.id === "string" ? template.id : "";
                        return {
                            label: template.name,
                            value: templateId,
                            onSelect: () => loadTemplate(template),
                            secondaryAction: templateId
                                ? {
                                    ariaLabel: t("da_delete_template"),
                                    title: t("da_delete_template"),
                                    icon: TemplateOptionTrashIcon,
                                    visible: "hover" as const,
                                    onClick: () => handleDeleteTemplate(templateId),
                                }
                                : undefined,
                        };
                    })
                    : [
                        {
                            label: t("da_no_saved_templates"),
                            value: TEMPLATE_EMPTY_OPTION_VALUE,
                            disabled: true,
                        },
                    ]),
        ];
        const lowConfidenceReviewCard = activeLowConfidenceFile ? (jsx("div", {
            role: "status",
            "aria-live": "polite",
            className: "rounded-xl border border-border-200 px-3 py-3 text-sm",
            children: jsxs("div", {
                className: "flex items-start gap-2",
                children: [
                    renderLocalCogIcon({
                        icon: lxAlertTriangle,
                        size: 16,
                        className: "mt-0.5 shrink-0 text-amber-500",
                        "aria-hidden": "true"
                    }),
                    jsxs("div", {
                        className: "min-w-0 flex-1",
                        children: [
                            jsx("div", {
                                className: "text-xs font-medium text-text-tertiary",
                                children: lowConfidenceReviewFiles.length > 1
                                    ? t("da_low_confidence_review_title_count", {
                                        count: lowConfidenceReviewFiles.length,
                                    })
                                    : t("da_low_confidence_review_title")
                            }),
                            jsx("div", {
                                className: "mt-1 text-sm text-text-primary break-words",
                                children: String(activeLowConfidenceFile.fileName ?? "").trim() ||
                                    t("da_low_confidence_unnamed_file")
                            }),
                            jsx("div", {
                                className: "mt-1 text-sm text-text-primary",
                                children: t("da_low_confidence_auto_result", {
                                    type: translateLowConfidenceCurveType(activeLowConfidenceFile.curveType),
                                    confidence: translateLowConfidenceConfidence(activeLowConfidenceFile.curveTypeConfidence),
                                })
                            }),
                            activeLowConfidenceReasons.length ? (jsx("ul", {
                                className: "mt-2 list-disc space-y-1 pl-4 text-sm text-text-primary",
                                children: activeLowConfidenceReasons.map((reason, index) => (jsx("li", {
                                    key: `${String(activeLowConfidenceFile.fileId ?? "file")}-${index}`,
                                    children: translateLowConfidenceReason(reason)
                                })))
                            })) : null,
                            jsxs("div", {
                                className: "mt-3 flex flex-wrap gap-2",
                                children: [
                                    renderLocalButton( {
                                        variant: "secondary",
                                        size: "sm",
                                        onClick: handleReviewLowConfidenceFile,
                                        cta: "Device Analysis",
                                        ctaPosition: "template-low-confidence",
                                        ctaCopy: "review file",
                                        children: t("da_low_confidence_review_in_save_mode")
                                    }),
                                    lowConfidenceReviewFiles.length > 1 ? (renderLocalButton( {
                                        variant: "ghost",
                                        size: "sm",
                                        onClick: handleFocusNextLowConfidenceFile,
                                        cta: "Device Analysis",
                                        ctaPosition: "template-low-confidence",
                                        ctaCopy: "next flagged file",
                                        children: t("da_low_confidence_next_flagged")
                                    })) : null
                                ]
                            })
                        ]
                    })
                ]
            })
        })) : null;
        const autoSummaryCard = isAutoTemplateSelected ? (jsxs("div", {
            className: "rounded-xl border border-border-primary/40 px-3 py-3 space-y-3",
            children: [
                jsx("div", {
                    className: "space-y-1",
                    children: jsx("div", {
                        className: "text-xs font-medium text-text-tertiary",
                        children: t("da_auto_template_summary_title")
                    })
                }),
                !previewFile?.fileId ? (jsx("p", {
                    className: "text-sm text-text-secondary",
                    children: t("da_preview_select_file_hint")
                })) : !autoExtractionPreviewResult ? (jsx("p", {
                    className: "text-sm text-text-secondary",
                    children: t("da_auto_template_summary_pending")
                })) : autoExtractionPreviewResult.ok ? (jsxs("div", {
                    className: "space-y-3",
                    children: [
                        jsxs("div", {
                            className: "grid grid-cols-1 gap-2 text-sm",
                            children: [
                                jsxs("div", {
                                    className: "flex items-start justify-between gap-3",
                                    children: [
                                        jsx("span", {
                                            className: "text-text-secondary",
                                            children: t("da_auto_template_summary_curve")
                                        }),
                                        jsx("span", {
                                            className: "text-right text-text-primary",
                                            children: `${String(autoExtractionPreviewResult.plan.curveTypeLabel ??
                                                autoExtractionPreviewResult.plan.curveType ??
                                                "").trim()} (${translateLowConfidenceConfidence(autoExtractionPreviewResult.plan.confidence)})`
                                        })
                                    ]
                                }),
                                jsxs("div", {
                                    className: "flex items-start justify-between gap-3",
                                    children: [
                                        jsx("span", {
                                            className: "text-text-secondary",
                                            children: t("da_auto_template_summary_x")
                                        }),
                                        jsx("span", {
                                            className: "text-right text-text-primary",
                                            children: resolveAutoColumnLabel(autoExtractionPreviewResult.plan.xCol)
                                        })
                                    ]
                                }),
                                jsxs("div", {
                                    className: "flex items-start justify-between gap-3",
                                    children: [
                                        jsx("span", {
                                            className: "text-text-secondary",
                                            children: t("da_auto_template_summary_y")
                                        }),
                                        jsx("span", {
                                            className: "text-right text-text-primary",
                                            children: autoExtractionPreviewResult.plan.yCols.length
                                                ? autoExtractionPreviewResult.plan.yCols
                                                    .map((colIndex) => resolveAutoColumnLabel(colIndex))
                                                    .join(", ")
                                                : t("da_auto_template_summary_none")
                                        })
                                    ]
                                }),
                                jsxs("div", {
                                    className: "flex items-start justify-between gap-3",
                                    children: [
                                        jsx("span", {
                                            className: "text-text-secondary",
                                            children: t("da_auto_template_summary_grouping")
                                        }),
                                        jsx("span", {
                                            className: "text-right text-text-primary",
                                            children: autoGroupingSummary
                                        })
                                    ]
                                }),
                                jsxs("div", {
                                    className: "flex items-start justify-between gap-3",
                                    children: [
                                        jsx("span", {
                                            className: "text-text-secondary",
                                            children: t("da_auto_template_summary_legend")
                                        }),
                                        jsx("span", {
                                            className: "text-right text-text-primary",
                                            children: resolveAutoLegendSummary(autoExtractionPreviewResult)
                                        })
                                    ]
                                })
                            ]
                        }),
                        autoExtractionPreviewResult.plan.reasons.length ? (jsx("ul", {
                            className: "list-disc space-y-1 pl-4 text-sm text-text-primary",
                            children: autoExtractionPreviewResult.plan.reasons.slice(0, 3).map((reason, index) => (jsx("li", {
                                key: `auto-reason-${index}`,
                                children: translateLowConfidenceReason(reason)
                            })))
                        })) : null
                    ]
                })) : (jsxs("div", {
                    className: "space-y-2",
                    children: [
                        jsx("p", {
                            className: "text-sm text-text-primary",
                            children: t("da_auto_template_summary_failed")
                        }),
                        jsx("p", {
                            className: "text-sm text-text-secondary break-words",
                            children: autoExtractionPreviewResult.message
                        }),
                        autoExtractionPreviewResult.reasons.length ? (jsx("ul", {
                            className: "list-disc space-y-1 pl-4 text-sm text-text-primary",
                            children: autoExtractionPreviewResult.reasons.slice(0, 3).map((reason, index) => (jsx("li", {
                                key: `auto-reason-${index}`,
                                children: translateLowConfidenceReason(reason)
                            })))
                        })) : null
                    ]
                }))
            ]
        })) : null;
        return (jsxs("div", {
            className: "space-y-4 px-1",
            children: [
                jsxs("div", {
                    children: [
                        jsx("label", {
                            className: "block text-sm font-medium text-text-secondary mb-2",
                            children: t("da_general_template")
                        }),
                        jsx("div", {
                            className: "relative flex-1 min-w-0",
                            children: jsx(DropdownField, {
                                id: resolvedInputId,
                                size: "md",
                                menuId: includeIds
                                    ? "analysis-template-dropdown-menu"
                                    : undefined,
                                value: isAutoTemplateSelected
                                    ? AUTO_TEMPLATE_ID
                                    : selectedTemplateId ?? "",
                                options: templateSelectOptions,
                                formatDisplay: () => (hasDisplayName ? displayName : ""),
                                placeholder: t("da_template_name"),
                                "aria-label": includeIds ? t("da_template_name") : undefined,
                                className: "w-full",
                                contentViewClassName: "min-w-full !bg-bg-surface !backdrop-blur-none",
                                triggerClassName: "pr-8",
                                disabled: measureOnly,
                                emptyLabel: t("da_no_saved_templates"),
                                onOpenChange: measureOnly
                                    ? undefined
                                    : (nextOpen: boolean) => {
                                        if (nextOpen) {
                                            void ensureTemplatesLoaded().catch(() => { });
                                        }
                                    },
                                onMouseDown: measureOnly
                                    ? undefined
                                    : (e: React.MouseEvent<HTMLElement>) => {
                                        if (e.detail > 1)
                                            e.preventDefault();
                                    },
                                onDoubleClick: measureOnly ? undefined : (e: React.MouseEvent<HTMLElement>) => e.preventDefault(),
                                ...(includeIds
                                    ? {
                                        "data-cta": "Device Analysis",
                                        "data-cta-position": "template-dropdown",
                                        "data-cta-copy": "template name",
                                    }
                                    : {})
                            })
                        })
                    ]
                }),
                jsxs("div", {
                    className: "flex items-center gap-3",
                    children: [
                        renderLocalButton( {
                            id: includeIds ? "analysis-template-export-config" : undefined,
                            variant: "secondary",
                            size: "sm",
                            className: shouldCollapseTemplateTransferButtons
                                ? "min-w-0 px-2"
                                : "flex-1 min-w-0",
                            contentClassName: shouldCollapseTemplateTransferButtons
                                ? "w-full min-w-0 justify-center"
                                : "w-full min-w-0 justify-between",
                            onClick: measureOnly ? undefined : handleExportTemplates,
                            disabled: templateTransferBusy,
                            title: t("da_template_export_btn"),
                            "aria-label": t("da_template_export_btn"),
                            children: [
                                renderLocalCogIcon({
                                    icon: lxExportTray,
                                    size: 14,
                                    className: "shrink-0"
                                }),
                                !shouldCollapseTemplateTransferButtons ? (jsx("span", {
                                    className: "block min-w-0 flex-1 truncate text-left",
                                    children: t("da_template_export_btn")
                                })) : null
                            ]
                        }),
                        renderLocalButton( {
                            id: includeIds ? "analysis-template-import-config" : undefined,
                            variant: "secondary",
                            size: "sm",
                            className: shouldCollapseTemplateTransferButtons
                                ? "min-w-0 px-2"
                                : "flex-1 min-w-0",
                            contentClassName: shouldCollapseTemplateTransferButtons
                                ? "w-full min-w-0 justify-center"
                                : "w-full min-w-0 justify-between",
                            onClick: measureOnly ? undefined : handleImportTemplatesClick,
                            disabled: templateTransferBusy,
                            title: t("da_template_import_btn"),
                            "aria-label": t("da_template_import_btn"),
                            children: [
                                renderLocalCogIcon({
                                    icon: lxDownloadTray,
                                    size: 14,
                                    className: "shrink-0"
                                }),
                                !shouldCollapseTemplateTransferButtons ? (jsx("span", {
                                    className: "block min-w-0 flex-1 truncate text-left",
                                    children: t("da_template_import_btn")
                                })) : null
                            ]
                        })
                    ]
                }),
                includeIds && !measureOnly ? (jsx("input", {
                    id: "analysis-template-import-file-input",
                    ref: importFileInputRef,
                    type: "file",
                    accept: "application/json,.json",
                    className: "sr-only",
                    onChange: handleImportTemplatesFileChange
                })) : null,
                isAutoTemplateSelected ? (jsx("div", {
                    className: "space-y-3",
                    children: jsxs("div", {
                        className: "mt-3 grid grid-cols-2 gap-3",
                        children: [
                            renderLocalButton( {
                                id: includeIds
                                    ? "analysis-template-output-rule-apply-to-all"
                                    : undefined,
                                variant: "primary",
                                size: "sm",
                                className: "w-full min-w-0",
                                contentClassName: "w-full min-w-0 justify-center",
                                onClick: measureOnly ? undefined : () => applyAutoTemplate(false),
                                disabled: measureOnly,
                                title: t("da_apply_to_all_files"),
                                children: jsx("span", {
                                    className: "block min-w-0 truncate",
                                    children: shouldCollapseTemplateTransferButtons
                                        ? applyToAllShortLabel
                                        : t("da_apply_to_all_files")
                                })
                            }),
                            renderLocalButton( {
                                id: includeIds
                                    ? "analysis-template-output-rule-apply-to-new"
                                    : undefined,
                                variant: "secondary",
                                size: "sm",
                                className: "w-full min-w-0",
                                contentClassName: "w-full min-w-0 justify-center",
                                onClick: measureOnly ? undefined : () => applyAutoTemplate(true),
                                disabled: measureOnly ||
                                    typeof onTemplateAppliedIncremental !== "function",
                                title: t("da_apply_to_new_files"),
                                children: jsx("span", {
                                    className: "block min-w-0 truncate",
                                    children: shouldCollapseTemplateTransferButtons
                                        ? applyToNewShortLabel
                                        : t("da_apply_to_new_files")
                                })
                            })
                        ]
                    })
                })) : (jsxs("div", {
                    children: [
                        jsxs("div", {
                            className: "flex items-center justify-between gap-2 mb-2",
                            children: [
                                jsx("label", {
                                    className: "block text-sm font-medium text-text-secondary",
                                    children: t("da_match_by_file_name")
                                }),
                                renderLocalButton( {
                                    id: includeIds ? "analysis-template-add-rule" : undefined,
                                    variant: "secondary",
                                    size: "md",
                                    className: "min-w-0 max-w-full",
                                    contentClassName: "w-full min-w-0 justify-between",
                                    onClick: measureOnly ? undefined : addFileNameTemplateRule,
                                    disabled: measureOnly || templatesLoading,
                                    title: t("da_add_rule"),
                                    children: [
                                        jsx("span", {
                                            className: "block min-w-0 flex-1 truncate text-left",
                                            children: t("da_add_rule")
                                        }),
                                        renderLocalCogIcon({
                                            icon: lxAddSmall,
                                            size: 14,
                                            className: "shrink-0"
                                        })
                                    ]
                                })
                            ]
                        }),
                        jsx("div", {
                            className: "mt-3 space-y-3",
                            children: fileNameTemplateRules.map((rule, index) => {
                                const suggestionOptions = buildRuleSuggestionOptions(rule);
                                const matchedFilesCount = getRuleMatchCount(rule);
                                const selectedPatternTokens = getRulePatternTokens(rule.pattern);
                                const isPhraseMode = rule.matchMode === "phrase";
                                const hasMatchCondition = isPhraseMode
                                    ? Boolean(String(rule.pattern ?? "").trim())
                                    : selectedPatternTokens.length > 0;
                                return (jsxs("div", {
                                    key: rule.id,
                                    className: "group border border-border-primary/40 rounded-xl p-3 space-y-3",
                                    children: [
                                        jsxs("div", {
                                            className: "flex items-center justify-between gap-2",
                                            children: [
                                                jsx("span", {
                                                    className: "text-xs text-text-secondary",
                                                    children: t("da_rule_item_index", { index: index + 1 })
                                                }),
                                                renderLocalButton( {
                                                    id: includeIds
                                                        ? `analysis-template-remove-rule-${index + 1}`
                                                        : undefined,
                                                    variant: "icon",
                                                    size: "icon",
                                                    "aria-label": t("da_remove_rule"),
                                                    title: t("da_remove_rule"),
                                                    onClick: measureOnly
                                                        ? undefined
                                                        : () => removeFileNameTemplateRule(rule.id),
                                                    disabled: measureOnly,
                                                    className: "hover:text-red-500 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus:opacity-100 focus:pointer-events-auto",
                                                    children: renderLocalCogIcon({
                                                        icon: lxTrash,
                                                        size: 14
                                                    })
                                                })
                                            ]
                                        }),
                                        jsx(DropdownField, {
                                            id: includeIds
                                                ? `analysis-template-rule-mode-${index + 1}`
                                                : undefined,
                                            size: "md",
                                            value: rule.matchMode,
                                            options: fileNameRuleModeOptions,
                                            onChange: (value: unknown) => {
                                                updateFileNameTemplateRule(rule.id, {
                                                    matchMode: value === "phrase" ? "phrase" : "field",
                                                });
                                            },
                                            placeholder: t("da_match_mode_label"),
                                            disabled: measureOnly,
                                            stableWidth: false,
                                            contentViewClassName: "min-w-full !bg-bg-surface !backdrop-blur-none"
                                        }),
                                        jsx("div", {
                                            className: "space-y-2",
                                            children: isPhraseMode ? (jsxs(Fragment, {
                                                children: [
                                                    renderLocalInput( {
                                                        id: includeIds
                                                            ? `analysis-template-rule-phrase-${index + 1}`
                                                            : undefined,
                                                        value: rule.pattern,
                                                        name: `fileNameTemplateRulePhrase-${rule.id}`,
                                                        disabled: measureOnly,
                                                        onChange: (next: string) => {
                                                            updateFileNameTemplateRule(rule.id, { pattern: next });
                                                        },
                                                        placeholder: t("da_match_phrase_placeholder")
                                                    }),
                                                    jsx("p", {
                                                        className: "text-xs text-text-secondary",
                                                        children: t("da_match_phrase_hint")
                                                    })
                                                ]
                                            })) : (jsxs(Fragment, {
                                                children: [
                                                    jsx("div", {
                                                        className: "flex flex-wrap gap-2 min-h-[2rem]",
                                                        children: selectedPatternTokens.length ? (selectedPatternTokens.map((token) => (jsxs("span", {
                                                            key: `${rule.id}-${token}`,
                                                            className: "inline-flex items-center gap-1 rounded-full border border-border bg-bg-page px-2.5 py-1 text-xs text-text-primary",
                                                            children: [
                                                                jsx("span", {
                                                                    children: token
                                                                }),
                                                                jsx("button", {
                                                                    type: "button",
                                                                    className: "rounded-full p-0.5 text-text-secondary transition-colors hover:text-text-primary",
                                                                    onClick: measureOnly
                                                                        ? undefined
                                                                        : () => removePatternTokenFromRule(rule.id, token),
                                                                    disabled: measureOnly,
                                                                    "aria-label": t("da_remove_rule"),
                                                                    title: t("da_remove_rule"),
                                                                    children: renderLocalCogIcon({
                                                                        icon: lxClose,
                                                                        size: 12
                                                                    })
                                                                })
                                                            ]
                                                        })))) : (jsx("p", {
                                                            className: "text-xs text-text-secondary",
                                                            children: t("da_match_field_selected_none")
                                                        }))
                                                    }),
                                                    jsx(DropdownField, {
                                                        id: includeIds
                                                            ? `analysis-template-rule-suggestions-${index + 1}`
                                                            : undefined,
                                                        size: "md",
                                                        value: undefined,
                                                        options: suggestionOptions,
                                                        onChange: (value: unknown) => {
                                                            addPatternTokenToRule(rule.id, String(value ?? ""));
                                                        },
                                                        placeholder: suggestionOptions.length
                                                            ? t("da_match_field_suggestions")
                                                            : t("da_match_field_suggestion_none"),
                                                        disabled: measureOnly || suggestionOptions.length === 0,
                                                        stableWidth: false,
                                                        contentViewClassName: "min-w-full !bg-bg-surface !backdrop-blur-none"
                                                    })
                                                ]
                                            }))
                                        }),
                                        hasMatchCondition ? (jsx("p", {
                                            className: "text-xs text-text-secondary",
                                            children: t("da_match_field_rule_matches", {
                                                count: matchedFilesCount,
                                            })
                                        })) : null,
                                        jsx(DropdownField, {
                                            id: includeIds
                                                ? `analysis-template-rule-template-${index + 1}`
                                                : undefined,
                                            size: "md",
                                            value: rule.templateName,
                                            options: availableTemplateOptions,
                                            onChange: (value: unknown) => {
                                                updateFileNameTemplateRule(rule.id, {
                                                    templateName: String(value ?? ""),
                                                });
                                            },
                                            placeholder: t("da_template_name"),
                                            disabled: measureOnly || templatesLoading,
                                            stableWidth: false,
                                            contentViewClassName: "min-w-full !bg-bg-surface !backdrop-blur-none"
                                        })
                                    ]
                                }));
                            })
                        }),
                        jsxs("div", {
                            className: "mt-3 grid grid-cols-2 gap-3",
                            children: [
                                renderLocalButton( {
                                    id: includeIds
                                        ? "analysis-template-output-rule-apply-to-all"
                                        : undefined,
                                    variant: "primary",
                                    size: "md",
                                    className: "w-full min-w-0",
                                    contentClassName: "w-full min-w-0 justify-center",
                                    onClick: measureOnly
                                        ? undefined
                                        : () => applyFileNameTemplateRules(false),
                                    disabled: measureOnly,
                                    title: t("da_apply_to_all_files"),
                                    children: jsx("span", {
                                        className: "block min-w-0 truncate",
                                        children: shouldCollapseTemplateTransferButtons
                                            ? applyToAllShortLabel
                                            : t("da_apply_to_all_files")
                                    })
                                }),
                                renderLocalButton( {
                                    id: includeIds
                                        ? "analysis-template-output-rule-apply-to-new"
                                        : undefined,
                                    variant: "secondary",
                                    size: "md",
                                    className: "w-full min-w-0",
                                    contentClassName: "w-full min-w-0 justify-center",
                                    onClick: measureOnly
                                        ? undefined
                                        : () => applyFileNameTemplateRules(true),
                                    disabled: measureOnly ||
                                        typeof onTemplateAppliedIncremental !== "function",
                                    title: t("da_apply_to_new_files"),
                                    children: jsx("span", {
                                        className: "block min-w-0 truncate",
                                        children: shouldCollapseTemplateTransferButtons
                                            ? applyToNewShortLabel
                                            : t("da_apply_to_new_files")
                                    })
                                })
                            ]
                        })
                    ]
                })),
                jsxs("div", {
                    id: includeIds
                        ? "analysis-stop-on-first-invalid-toggle"
                        : undefined,
                    onClick: measureOnly
                        ? undefined
                        : () => setConfig((prev) => {
                            const nextStopOnError = !prev.stopOnError;
                            if (typeof onUpdateSettings === "function") {
                                void onUpdateSettings({
                                    stopOnErrorDefault: nextStopOnError,
                                });
                            }
                            return {
                                ...prev,
                                stopOnError: nextStopOnError,
                            };
                        }),
                    className: "flex items-center gap-2 text-sm text-text-secondary select-none cursor-pointer group w-fit",
                    children: [
                        config.stopOnError ? (renderLocalCheckbox( {
                            checked: true,
                            as: "div",
                            size: "md",
                            iconSize: 12,
                            iconStrokeWidth: 3
                        })) : (renderLocalCheckbox( {
                            as: "div",
                            size: "md"
                        })),
                        jsx("span", {
                            children: t("da_stop_on_first_invalid_file")
                        })
                    ]
                }),
                jsxs("div", {
                    id: includeIds
                        ? "analysis-rule-case-sensitive-toggle"
                        : undefined,
                    onClick: measureOnly
                        ? undefined
                        : () => setConfig((prev) => ({
                            ...prev,
                            fileNameMatchCaseSensitive: !prev.fileNameMatchCaseSensitive,
                        })),
                    className: "flex items-center gap-2 text-sm text-text-secondary select-none cursor-pointer group w-fit",
                    children: [
                        config.fileNameMatchCaseSensitive ? (renderLocalCheckbox( {
                            checked: true,
                            as: "div",
                            size: "md",
                            iconSize: 12,
                            iconStrokeWidth: 3
                        })) : (renderLocalCheckbox( {
                            as: "div",
                            size: "md"
                        })),
                        jsx("span", {
                            children: t("da_match_field_case_sensitive")
                        })
                    ]
                }),
                autoSummaryCard ? (jsx("div", {
                    className: "pt-1",
                    children: autoSummaryCard
                })) : null,
                lowConfidenceReviewCard
            ]
        }));
    };
    return (jsx("section", {
        "aria-label": t("da_data_extraction_template"),
        className: "flex flex-col flex-1 w-full h-full min-h-0",
        children: renderLocalCard( {
            ref: containerRef,
            id: "analysis-template-manager",
            className: "flex h-full flex-1 min-h-0 flex-col pt-4 pr-4 pb-4 pl-0",
            style: {
                "--da-template-stack-panel-h": "clamp(24rem, 52dvh, 40rem)",
            } as CSSProperties,
            children: [
                jsx(DataPreviewArea, {
                    tabPanel: jsx("div", {
                        ref: configPanelRef,
                        className: "flex h-full min-h-0 flex-col self-stretch overflow-hidden",
                        children: jsxs("div", {
                            className: "flex flex-col gap-3 flex-1 min-h-0 pl-4 pr-4",
                            id: "analysis-template-config-panel-content",
                            children: [
                                jsx("div", {
                                    className: "pb-2 shrink-0",
                                    children: jsx("div", {
                                        className: "flex items-center justify-start gap-3",
                                        children: jsx(Tabs, {
                                            value: templateMode,
                                            onChange: handleTemplateModeChange,
                                            size: "sm",
                                            className: shouldCollapseTemplateModeTabs
                                                ? "da-template-mode-tabs da-template-mode-tabs--icon-only"
                                                : "da-template-mode-tabs",
                                            itemClassName: shouldCollapseTemplateModeTabs
                                                ? "da-template-mode-tabs__item"
                                                : "",
                                            controlsPanels: true,
                                            idBase: "analysis-template-mode",
                                            groupLabel: t("da_template_mode"),
                                            options: [
                                                {
                                                    value: "select",
                                                    label: t("da_template_mode_select"),
                                                    ariaLabel: t("da_template_mode_select"),
                                                    title: t("da_template_mode_select"),
                                                    icon: TemplateModeSelectIcon,
                                                    cta: "Device Analysis",
                                                    ctaPosition: "template-mode",
                                                    ctaCopy: "select",
                                                },
                                                {
                                                    value: "save",
                                                    label: t("da_template_mode_save"),
                                                    ariaLabel: t("da_template_mode_save"),
                                                    title: t("da_template_mode_save"),
                                                    icon: TemplateModeSaveIcon,
                                                    cta: "Device Analysis",
                                                    ctaPosition: "template-mode",
                                                    ctaCopy: "save",
                                                },
                                            ]
                                        })
                                    })
                                }),
                                jsx("div", {
                                    id: "analysis-template-mode-panel-select",
                                    role: "tabpanel",
                                    "aria-labelledby": "analysis-template-mode-tab-select",
                                    hidden: templateMode !== "select",
                                    className: "flex-1 min-h-0",
                                    children: templateMode === "select" ? (jsx(ScrollArea, {
                                        className: "da-template-config-scroll-area h-full min-h-0",
                                        axis: "y",
                                        viewportClassName: "pr-1",
                                        children: renderSelectPane({ includeIds: true, measureOnly: false })
                                    })) : null
                                }),
                                jsx("div", {
                                    id: "analysis-template-mode-panel-save",
                                    role: "tabpanel",
                                    "aria-labelledby": "analysis-template-mode-tab-save",
                                    hidden: templateMode !== "save",
                                    className: "flex-1 min-h-0",
                                    children: templateMode === "save" ? (jsx(ScrollArea, {
                                        className: "da-template-config-scroll-area h-full min-h-0",
                                        axis: "y",
                                        viewportClassName: "pr-1",
                                        children: renderSavePane({
                                            includeIds: true,
                                            selectModeForDisabled: isSelectMode,
                                        })
                                    })) : null
                                })
                            ]
                        })
                    }),
                    tablePreview: shouldRenderPreviewWorkspace ? (jsx(TemplateManagerPreviewWorkspace, {
                        containerRef: containerRef,
                        config: config,
                        ensurePreviewRows: ensurePreviewRows,
                        getPreviewRow: getPreviewRow,
                        getPreviewRowsVersion: getPreviewRowsVersion,
                        interactive: !isAutoTemplateSelected,
                        previewFile: previewFile,
                        previewStatus: previewStatus,
                        setConfig: setConfig,
                        subscribePreviewRowsVersion: subscribePreviewRowsVersion,
                        t: t,
                        writeFieldFromPreview: writeFieldFromPreview
                    })) : (previewWorkspaceFallback)
                }),
                jsx(Modal, {
                    isOpen: isDiscardConfirmOpen,
                    onClose: closeDiscardConfirm,
                    idBase: "analysis-template-discard-confirm",
                    title: t("da_template_discard_changes_title"),
                    footer: jsxs(Fragment, {
                        children: [
                            renderLocalButton( {
                                id: "analysis-template-discard-confirm-keep-editing",
                                variant: "ghost",
                                onClick: closeDiscardConfirm,
                                children: t("da_template_discard_changes_keep_editing")
                            }),
                            renderLocalButton( {
                                id: "analysis-template-discard-confirm-discard",
                                variant: "primary",
                                onClick: confirmDiscardAndSwitch,
                                children: t("da_template_discard_changes_discard")
                            })
                        ]
                    }),
                    size: "sm",
                    children: jsx("p", {
                        className: "text-sm text-text-secondary",
                        children: t("da_template_discard_changes_desc")
                    })
                })
            ]
        })
    }));
};
export default React.memo(TemplateManager);








