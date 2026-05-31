import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode, type Ref, type RefCallback, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { MutableRef } from "src/cs/base/common/ref";
import { lxCheck, lxChevronDown, lxChevronRight } from "cogicon";
import { getButtonClassName, getButtonContentClassName } from "cs/base/browser/ui/button/button";
import { getCogIconClassName, getCogIconMarkup, getCogIconStyle, type CogIconRenderer, type CogIconStyle } from "src/cs/base/browser/ui/cogIcon/cogIcon";
import { lxAlertTriangle } from "src/cs/base/browser/ui/cogIcon/icons";
import { getClientArea, getContentWidth, getDomRect, getElementSize } from "src/cs/base/browser/dom";
import { addDisposableListener, combinedDisposable, EventType } from "src/cs/base/browser/event";
import { anchoredLayout, rectFromDomRect } from "src/cs/base/common/layout";
import DropdownField from "src/cs/workbench/browser/components/DropdownField";
import { isOriginExportMode, type OriginExportContentKey, type OriginExportMode, } from "src/cs/workbench/contrib/export/common/originSelectionExport";
import type { OriginCanvasExportScope, OriginCurveExportMode, OriginFilteredCanvasKind, } from "src/cs/workbench/contrib/export/browser/originCanvasExport";
type LocalCogIconProps = {
    className?: string;
    icon: CogIconRenderer;
    size?: number | string;
    style?: CogIconStyle;
    [key: string]: unknown;
};
const renderLocalCogIcon = ({ className, icon, size = 16, style, ...props }: LocalCogIconProps) => jsx("span", {
    ...props,
    className: getCogIconClassName(className),
    style: getCogIconStyle({ size, style }),
    dangerouslySetInnerHTML: {
        __html: getCogIconMarkup(icon)
    }
});
export type OriginExportContentOption = {
    group: "basic" | "derived";
    key: OriginExportContentKey;
    labelKey: string;
};
export type OriginCurveExportSeriesOption = {
    key: string;
    label: string;
    sourceFileId: string;
    sourceSeriesId: string;
};
export type OriginExportContentTranslateFn = (key: string, params?: Record<string, string | number | boolean | null | undefined>) => string;
type OriginExportContentMenuGroup = {
    key: OriginExportContentOption["group"];
    labelKey: string;
    options: OriginExportContentOption[];
};
type StateSetter<T> = (value: T | ((previous: T) => T)) => void;
export type ReplaceMatchingOriginSeriesAcrossFilesFn = (options: {
    fileIds?: unknown[];
    sourceSeriesRefs?: Array<{
        fileId?: unknown;
        seriesId?: unknown;
    }>;
}) => {
    matchedFileCount: number;
    matchedSeriesCount: number;
};
type OriginExportToolbarProps = {
    curveOptions: OriginCurveExportSeriesOption[];
    hasMixedExportYScales: boolean;
    mode: OriginExportMode;
    onExportOriginZip: () => void | Promise<void>;
    onModeChange: (next: OriginExportMode) => void;
    onOpenInOrigin: () => void | Promise<void>;
    onSelectedCurveOptionKeysChange: (nextKeys: string[]) => void;
    originCanvasExportScope: OriginCanvasExportScope;
    originExportContentOptions: OriginExportContentOption[];
    originFilteredCanvasKind: OriginFilteredCanvasKind;
    replaceMatchingOriginSeriesAcrossFiles: ReplaceMatchingOriginSeriesAcrossFilesFn;
    resolvedCurveExportMode: OriginCurveExportMode;
    scopedFileIds: string[];
    selectedContentKeys: OriginExportContentKey[];
    selectedCurveOptionKeySet: Set<string>;
    setContentKeys: StateSetter<OriginExportContentKey[]>;
    setOriginCanvasExportScope: StateSetter<OriginCanvasExportScope>;
    setOriginFilteredCanvasKind: StateSetter<OriginFilteredCanvasKind>;
    setResolvedCurveExportMode: (next: OriginCurveExportMode) => void;
    showFilteredCanvasKindSelect: boolean;
    t: OriginExportContentTranslateFn;
};
const DEFAULT_ORIGIN_EXPORT_CONTENT_KEYS: OriginExportContentKey[] = ["iv"];
const ORIGIN_EXPORT_CONTENT_OPTION_GROUPS: Array<Pick<OriginExportContentMenuGroup, "key" | "labelKey">> = [
    { key: "basic", labelKey: "da_origin_export_content_group_basic" },
    { key: "derived", labelKey: "da_origin_export_content_group_derived" },
];
type ContentViewAlign = "left" | "center" | "right";
type ResolvedContentViewSide = "top" | "bottom" | "right" | "left";
type LocalContentViewProps = {
    align?: ContentViewAlign;
    anchorRef?: RefObject<HTMLElement | null>;
    children?: ReactNode | (() => ReactNode);
    contentRef?: RefCallback<HTMLDivElement | null>;
    isOpen: boolean;
    matchAnchorWidth?: boolean;
    menuId?: string;
    role?: string;
    side?: "bottom" | "right";
    triggerId?: string;
    variant?: "surface" | "menu";
    zIndex?: number;
};
type DropdownRenderProps = {
    isOpen: boolean;
    open: () => void;
    close: () => void;
    toggle: () => void;
    anchorRef: RefObject<HTMLElement | null>;
    setAnchorRef: RefCallback<HTMLElement | null>;
    contentRef: RefObject<HTMLDivElement | null>;
    setContentRef: RefCallback<HTMLDivElement | null>;
};
type DropdownProps = {
    anchorRef?: RefObject<HTMLElement | null>;
    children: ReactNode | ((props: DropdownRenderProps) => ReactNode);
    closeOnClickOutside?: boolean;
    closeOnEscape?: boolean;
    isOpen: boolean;
    onOpenChange: (nextOpen: boolean) => void;
};
type DropdownTriggerProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
    fieldClassName?: string;
    fieldRef?: Ref<HTMLDivElement | null>;
    hideIndicator?: boolean;
    indicator?: ReactNode;
    indicatorClassName?: string;
    isOpen: boolean;
    menuId?: string;
};
const CONTENT_VIEW_GAP_PX = 8;
const VIEWPORT_PADDING_PX = 8;
const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");
const assignRef = <T,>(ref: Ref<T> | undefined, value: T) => {
    if (!ref)
        return;
    if (typeof ref === "function") {
        ref(value);
        return;
    }
    (ref as MutableRef<T>).current = value;
};
const Dropdown = ({ anchorRef, children, closeOnClickOutside = true, closeOnEscape = true, isOpen, onOpenChange }: DropdownProps) => {
    const internalAnchorRef = useRef<HTMLElement | null>(null);
    const internalContentRef = useRef<HTMLDivElement | null>(null);
    const resolvedAnchorRef = anchorRef ?? internalAnchorRef;
    const open = () => onOpenChange(true);
    const close = () => onOpenChange(false);
    const toggle = () => onOpenChange(!isOpen);
    const setAnchorRef: RefCallback<HTMLElement | null> = (node) => {
        assignRef(internalAnchorRef, node);
        if (anchorRef)
            assignRef(anchorRef, node);
    };
    const setContentRef: RefCallback<HTMLDivElement | null> = (node) => {
        assignRef(internalContentRef, node);
    };
    useEffect(() => {
        if (!isOpen || !closeOnEscape)
            return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape")
                close();
        };
        return addDisposableListener(document, EventType.KEY_DOWN, handleKeyDown).dispose;
    }, [closeOnEscape, isOpen]);
    useEffect(() => {
        if (!isOpen || !closeOnClickOutside)
            return;
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target;
            if (!(target instanceof Node))
                return;
            if (resolvedAnchorRef.current?.contains(target))
                return;
            if (internalContentRef.current?.contains(target))
                return;
            close();
        };
        return addDisposableListener(document, EventType.MOUSE_DOWN, handleClickOutside).dispose;
    }, [closeOnClickOutside, isOpen, resolvedAnchorRef]);
    const renderProps: DropdownRenderProps = {
        isOpen,
        open,
        close,
        toggle,
        anchorRef: resolvedAnchorRef,
        setAnchorRef,
        contentRef: internalContentRef,
        setContentRef,
    };
    return typeof children === "function" ? children(renderProps) : children;
};
const DropdownTrigger = React.forwardRef<HTMLButtonElement, DropdownTriggerProps>(({ children, className = "", disabled = false, fieldClassName = "", fieldRef, hideIndicator = false, id, indicator, indicatorClassName = "", isOpen, menuId, ...props }, ref) => (jsxs("div", {
    ref: fieldRef,
    className: fieldClassName,
    "data-state": disabled ? "disabled" : "enable",
    children: [
        jsx("button", {
            ...props,
            ref: ref,
            id: id,
            type: "button",
            "aria-haspopup": "menu",
            "aria-expanded": isOpen,
            "aria-controls": menuId,
            disabled: disabled,
            "data-state": isOpen ? "open" : "closed",
            className: className,
            children: children
        }),
        !hideIndicator ? (jsx("span", {
            className: indicatorClassName,
            children: indicator ?? (renderLocalCogIcon({
                icon: lxChevronDown,
                size: 16,
                className: cx("transition-transform duration-200", isOpen && "rotate-180")
            }))
        })) : null
    ]
})));
const ContentView = ({ align = "left", anchorRef, children, contentRef, isOpen, matchAnchorWidth = false, menuId, role = "menu", side: preferredSide = "bottom", triggerId, variant = "surface", zIndex = 20, }: LocalContentViewProps) => {
    const contentViewRef = useRef<HTMLDivElement | null>(null);
    const [portalStyle, setPortalStyle] = useState<CSSProperties | null>(null);
    const [side, setSide] = useState<ResolvedContentViewSide>("bottom");
    const setContentViewNode = (node: HTMLDivElement | null) => {
        contentViewRef.current = node;
        contentRef?.(node);
    };
    useLayoutEffect(() => {
        if (!isOpen) {
            setPortalStyle(null);
            setSide("bottom");
            return;
        }
        const updatePosition = () => {
            const anchorEl = anchorRef?.current;
            const contentViewEl = contentViewRef.current;
            if (!anchorEl || !contentViewEl)
                return;
            const anchorRect = rectFromDomRect(getDomRect(anchorEl));
            const anchorWidth = Math.max(0, anchorRect.width);
            const viewportDimension = getClientArea(window);
            const maxWidth = Math.max(0, viewportDimension.width - VIEWPORT_PADDING_PX * 2);
            const surfaceEl = contentViewEl.firstElementChild;
            const contentViewSize = getElementSize(contentViewEl);
            const contentWidth = Math.max(surfaceEl instanceof HTMLElement ? getContentWidth(surfaceEl) || 0 : 0, contentViewEl.scrollWidth || 0, contentViewEl.offsetWidth || 0);
            const contentViewWidth = matchAnchorWidth
                ? Math.min(Math.max(contentWidth, anchorWidth), maxWidth)
                : Math.min(contentWidth, maxWidth);
            const layout = anchoredLayout({
                viewport: {
                    top: 0,
                    left: 0,
                    width: viewportDimension.width,
                    height: viewportDimension.height,
                },
                anchor: anchorRect,
                view: {
                    width: contentViewWidth,
                    height: contentViewSize.height,
                },
                gap: CONTENT_VIEW_GAP_PX,
                padding: VIEWPORT_PADDING_PX,
                align,
                side: preferredSide,
            });
            setPortalStyle({
                position: "fixed",
                top: layout.top,
                left: layout.left,
                width: layout.width,
                minWidth: matchAnchorWidth ? Math.min(anchorWidth, maxWidth) : undefined,
                maxWidth: layout.maxWidth,
                zIndex,
            });
            setSide(layout.side);
        };
        updatePosition();
        return combinedDisposable(addDisposableListener(window, EventType.RESIZE, updatePosition), addDisposableListener(window, EventType.SCROLL, updatePosition, true)).dispose;
    }, [align, anchorRef, isOpen, matchAnchorWidth, preferredSide, zIndex]);
    if (typeof document === "undefined")
        return null;
    const content = typeof children === "function" ? (isOpen ? children() : null) : children;
    return createPortal(jsx("div", {
        ref: setContentViewNode,
        id: menuId,
        role: role,
        "aria-orientation": "vertical",
        "aria-labelledby": triggerId,
        "aria-hidden": isOpen ? undefined : true,
        "data-style": "contentview",
        "data-state": isOpen ? "open" : "closed",
        "data-side": side,
        "data-align": align,
        tabIndex: -1,
        className: isOpen ? "content-view__portal--open" : "content-view__portal--closed",
        style: portalStyle ?? { position: "fixed", zIndex },
        children: jsx("div", {
            className: cx("content-view__surface", isOpen ? "content-view__surface--open" : "content-view__surface--closed", variant === "menu" && "content-view__surface--menu"),
            children: content
        })
    }), document.body);
};
const MenuScrollArea = ({ children }: {
    children?: ReactNode;
}) => (jsx("div", {
    className: "ui-menu__scroll-area max-h-60 -mr-1 pr-1",
    children: jsx("div", {
        className: "max-h-60",
        style: { height: "auto", maxHeight: "15rem", overflowY: "auto" },
        children: children
    })
}));
const Menu = ({ children, role = "menu", withScrollArea = true }: {
    children?: ReactNode;
    role?: string;
    withScrollArea?: boolean;
}) => (jsx("div", {
    role: role,
    className: "ui-menu",
    children: withScrollArea ? jsx(MenuScrollArea, {
        children: children
    }) : children
}));
const MenuItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & {
    disabled?: boolean;
    left?: ReactNode;
    right?: ReactNode;
}>(({ className = "", left, right, children, disabled = false, role = "menuitem", tabIndex = -1, onClick, onKeyDown, ...props }, ref) => {
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || disabled)
            return;
        if (event.key !== "Enter" && event.key !== " ")
            return;
        event.preventDefault();
        onClick?.(event as unknown as React.MouseEvent<HTMLDivElement>);
    };
    return (jsxs("div", {
        ...props,
        ref: ref,
        role: role,
        tabIndex: disabled ? undefined : tabIndex,
        "aria-disabled": disabled || undefined,
        onClick: disabled ? undefined : onClick,
        onKeyDown: handleKeyDown,
        className: cx("ui-menu__item select-none outline-none", className),
        children: [
            left ?? children,
            right ?? null
        ]
    }));
});
const normalizeOriginExportContentKeysForOptions = (keys: readonly OriginExportContentKey[] | null | undefined, options: readonly OriginExportContentOption[]): OriginExportContentKey[] => {
    const allowedKeys = new Set(options.map((option) => option.key));
    const normalized = (Array.isArray(keys) ? keys : DEFAULT_ORIGIN_EXPORT_CONTENT_KEYS).filter((key): key is OriginExportContentKey => allowedKeys.has(key));
    return normalized.length ? Array.from(new Set(normalized)) : DEFAULT_ORIGIN_EXPORT_CONTENT_KEYS;
};
const OriginExportContentMenu = ({ options, selectedKeys, setSelectedKeys, t, }: {
    options: OriginExportContentOption[];
    selectedKeys: OriginExportContentKey[];
    setSelectedKeys: StateSetter<OriginExportContentKey[]>;
    t: OriginExportContentTranslateFn;
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const anchorRef = useRef<HTMLDivElement | null>(null);
    const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
    const selectedLabels = options
        .filter((option) => selectedSet.has(option.key))
        .map((option) => t(option.labelKey));
    const summary = selectedLabels.join(" + ");
    const toggleContentKey = (key: OriginExportContentKey) => {
        setSelectedKeys((prev) => {
            const current = Array.isArray(prev) && prev.length
                ? normalizeOriginExportContentKeysForOptions(prev, options)
                : DEFAULT_ORIGIN_EXPORT_CONTENT_KEYS;
            if (current.includes(key)) {
                if (current.length <= 1)
                    return current;
                return current.filter((item) => item !== key);
            }
            return [...current, key];
        });
    };
    const groupedOptions: OriginExportContentMenuGroup[] = ORIGIN_EXPORT_CONTENT_OPTION_GROUPS
        .map((group) => ({
        key: group.key,
        labelKey: group.labelKey,
        options: options.filter((option) => option.group === group.key),
    }))
        .filter((group) => group.options.length > 0);
    return (jsx("div", {
        className: "ui-select_warp w-fit da-neutral-select",
        "data-style": "select",
        children: jsx(Dropdown, {
            isOpen: isOpen,
            onOpenChange: setIsOpen,
            anchorRef: anchorRef,
            children: ({ setContentRef }: DropdownRenderProps) => (jsxs(Fragment, {
                children: [
                    jsx(DropdownTrigger, {
                        fieldRef: anchorRef,
                        id: "analysis-origin-export-content-select",
                        isOpen: isOpen,
                        menuId: "analysis-origin-export-content-menu",
                        "data-size": "sm",
                        onClick: () => setIsOpen((prev) => !prev),
                        fieldClassName: "input_field ui-select_field--sm pr-1",
                        className: "input_native no-focus-outline p-0 text-left cursor-pointer select-none pr-6",
                        indicatorClassName: "absolute right-1 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none",
                        indicator: renderLocalCogIcon({
                            icon: lxChevronDown,
                            size: 14,
                            className: `transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`
                        }),
                        children: jsx("span", {
                            className: "block truncate text-text-primary",
                            children: summary
                        })
                    }),
                    jsx(ContentView, {
                        isOpen: isOpen,
                        align: "left",
                        zIndex: 80,
                        matchAnchorWidth: true,
                        triggerId: "analysis-origin-export-content-select",
                        menuId: "analysis-origin-export-content-menu",
                        anchorRef: anchorRef,
                        contentRef: setContentRef,
                        variant: "menu",
                        children: () => (jsx(Menu, {
                            withScrollArea: false,
                            children: jsx("div", {
                                className: "ui-menu__list",
                                children: groupedOptions.map((group) => (jsx("div", {
                                    key: group.key,
                                    role: "group",
                                    "aria-label": t(group.labelKey),
                                    className: "ui-menu__group",
                                    children: group.options.map((option) => {
                                        const checked = selectedSet.has(option.key);
                                        return (jsx(MenuItem, {
                                            key: option.key,
                                            role: "menuitemcheckbox",
                                            "aria-checked": checked,
                                            "data-selected": checked || undefined,
                                            onClick: () => toggleContentKey(option.key),
                                            className: "group",
                                            left: jsx("span", {
                                                className: "ui-menu__item-left",
                                                children: jsx("span", {
                                                    className: "whitespace-nowrap",
                                                    children: t(option.labelKey)
                                                })
                                            }),
                                            right: jsx("span", {
                                                className: "ui-menu__item-right",
                                                children: checked ? renderLocalCogIcon({
                                                    icon: lxCheck,
                                                    size: 14,
                                                    className: "text-accent"
                                                }) : null
                                            })
                                        }));
                                    })
                                })))
                            })
                        }))
                    })
                ]
            }))
        })
    }));
};
export const OriginCurveExportMenu = ({ curveOptions, selectedCurveOptionKeySet, mode, onSelectedCurveOptionKeysChange, scopedFileIds, setMode, replaceMatchingOriginSeriesAcrossFiles, t, }: {
    curveOptions: OriginCurveExportSeriesOption[];
    selectedCurveOptionKeySet: Set<string>;
    mode: OriginCurveExportMode;
    onSelectedCurveOptionKeysChange: (nextKeys: string[]) => void;
    scopedFileIds: string[];
    setMode: (next: OriginCurveExportMode) => void;
    replaceMatchingOriginSeriesAcrossFiles: ReplaceMatchingOriginSeriesAcrossFilesFn;
    t: OriginExportContentTranslateFn;
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [showPicker, setShowPicker] = useState(false);
    const anchorRef = useRef<HTMLDivElement | null>(null);
    const menuContentRef = useRef<HTMLDivElement | null>(null);
    const selectItemRef = useRef<HTMLDivElement | null>(null);
    const submenuContentRef = useRef<HTMLDivElement | null>(null);
    const selectedSourceIds = useMemo(() => {
        if (mode === "all") {
            return curveOptions.map((option) => option.key).filter(Boolean);
        }
        return curveOptions
            .map((option) => option.key)
            .filter((key) => selectedCurveOptionKeySet.has(key));
    }, [curveOptions, mode, selectedCurveOptionKeySet]);
    const selectedSourceSet = useMemo(() => new Set(selectedSourceIds), [selectedSourceIds]);
    const displayLabel = mode === "all"
        ? t("da_origin_curve_export_mode_all")
        : selectedSourceIds.length
            ? t("da_origin_curve_export_mode_select_count", { count: selectedSourceIds.length })
            : t("da_origin_curve_export_mode_select");
    const applySourceSelection = (sourceIds: string[]) => {
        setMode("select");
        onSelectedCurveOptionKeysChange(sourceIds);
        const selectedKeySet = new Set(sourceIds);
        replaceMatchingOriginSeriesAcrossFiles({
            fileIds: scopedFileIds,
            sourceSeriesRefs: curveOptions
                .filter((option) => selectedKeySet.has(option.key))
                .map((option) => ({
                fileId: option.sourceFileId,
                seriesId: option.sourceSeriesId,
            })),
        });
    };
    const toggleSourceSeries = (seriesKey: string) => {
        const next = selectedSourceSet.has(seriesKey)
            ? selectedSourceIds.filter((item) => item !== seriesKey)
            : [...selectedSourceIds, seriesKey];
        applySourceSelection(next);
    };
    useEffect(() => {
        if (!isOpen)
            return;
        const handleMouseDown = (event: MouseEvent) => {
            const target = event.target;
            if (!(target instanceof Node))
                return;
            if (anchorRef.current?.contains(target))
                return;
            if (menuContentRef.current?.contains(target))
                return;
            if (submenuContentRef.current?.contains(target))
                return;
            setIsOpen(false);
            setShowPicker(false);
        };
        document.addEventListener("mousedown", handleMouseDown);
        return () => document.removeEventListener("mousedown", handleMouseDown);
    }, [isOpen]);
    return (jsx("div", {
        className: "ui-select_warp w-fit da-neutral-select",
        "data-style": "select",
        children: jsx(Dropdown, {
            isOpen: isOpen,
            onOpenChange: (next: boolean) => {
                setIsOpen(next);
                if (next)
                    setShowPicker(mode === "select");
                else
                    setShowPicker(false);
            },
            anchorRef: anchorRef,
            closeOnClickOutside: false,
            children: ({ setContentRef }: DropdownRenderProps) => (jsxs(Fragment, {
                children: [
                    jsx(DropdownTrigger, {
                        fieldRef: anchorRef,
                        id: "analysis-origin-curve-export-mode-select",
                        isOpen: isOpen,
                        menuId: "analysis-origin-curve-export-mode-menu",
                        "data-size": "sm",
                        onClick: () => setIsOpen((prev) => !prev),
                        fieldClassName: "input_field ui-select_field--sm pr-1",
                        className: "input_native no-focus-outline p-0 text-left cursor-pointer select-none pr-6",
                        indicatorClassName: "absolute right-1 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none",
                        indicator: renderLocalCogIcon({
                            icon: lxChevronDown,
                            size: 14,
                            className: `transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`
                        }),
                        children: jsx("span", {
                            className: "block truncate text-text-primary",
                            children: displayLabel
                        })
                    }),
                    jsx(ContentView, {
                        isOpen: isOpen,
                        align: "left",
                        zIndex: 80,
                        triggerId: "analysis-origin-curve-export-mode-select",
                        menuId: "analysis-origin-curve-export-mode-menu",
                        anchorRef: anchorRef,
                        contentRef: (node: HTMLDivElement | null) => {
                            menuContentRef.current = node;
                            setContentRef(node);
                        },
                        variant: "menu",
                        children: () => (jsx(Menu, {
                            withScrollArea: false,
                            children: jsxs("div", {
                                className: "ui-menu__list",
                                children: [
                                    jsx(MenuItem, {
                                        "data-selected": mode === "all" || undefined,
                                        onClick: () => {
                                            setMode("all");
                                            setShowPicker(false);
                                            setIsOpen(false);
                                        },
                                        onMouseEnter: () => setShowPicker(false),
                                        left: jsx("span", {
                                            className: "ui-menu__item-left whitespace-nowrap",
                                            children: t("da_origin_curve_export_mode_all")
                                        }),
                                        right: jsx("span", {
                                            className: "ui-menu__item-right",
                                            children: mode === "all" ? renderLocalCogIcon({
                                                icon: lxCheck,
                                                size: 14,
                                                className: "text-accent"
                                            }) : null
                                        })
                                    }),
                                    jsx(MenuItem, {
                                        ref: selectItemRef,
                                        "data-selected": mode === "select" || undefined,
                                        onClick: () => {
                                            setMode("select");
                                            setShowPicker(true);
                                        },
                                        onMouseEnter: () => setShowPicker(true),
                                        left: jsx("span", {
                                            className: "ui-menu__item-left whitespace-nowrap",
                                            children: t("da_origin_curve_export_mode_select")
                                        }),
                                        right: jsx("span", {
                                            className: "ui-menu__item-right",
                                            children: renderLocalCogIcon({
                                                icon: lxChevronRight,
                                                size: 14
                                            })
                                        })
                                    })
                                ]
                            })
                        }))
                    }),
                    isOpen && showPicker && curveOptions.length > 0 && selectItemRef.current ? (jsx(ContentView, {
                        isOpen: true,
                        align: "left",
                        side: "right",
                        zIndex: 90,
                        triggerId: "analysis-origin-curve-export-mode-menu-select",
                        menuId: "analysis-origin-curve-export-picker-menu",
                        anchorRef: selectItemRef,
                        contentRef: (node: HTMLDivElement | null) => {
                            submenuContentRef.current = node;
                        },
                        variant: "menu",
                        children: () => (jsx(Menu, {
                            withScrollArea: false,
                            children: jsx(MenuScrollArea, {
                                children: jsx("div", {
                                    className: "ui-menu__list",
                                    children: curveOptions.map((option) => {
                                        const key = String(option?.key ?? "");
                                        const checked = selectedSourceSet.has(key);
                                        return (jsx(MenuItem, {
                                            key: key,
                                            role: "menuitemcheckbox",
                                            "aria-checked": checked,
                                            "data-selected": checked || undefined,
                                            onClick: () => toggleSourceSeries(key),
                                            left: jsx("span", {
                                                className: "ui-menu__item-left min-w-0",
                                                children: jsx("span", {
                                                    className: "truncate",
                                                    children: option.label
                                                })
                                            }),
                                            right: jsx("span", {
                                                className: "ui-menu__item-right",
                                                children: checked ? renderLocalCogIcon({
                                                    icon: lxCheck,
                                                    size: 14,
                                                    className: "text-accent"
                                                }) : null
                                            })
                                        }));
                                    })
                                })
                            })
                        }))
                    })) : null
                ]
            }))
        })
    }));
};
const OriginExportToolbar = ({ curveOptions, hasMixedExportYScales, mode, onExportOriginZip, onModeChange, onOpenInOrigin, onSelectedCurveOptionKeysChange, originCanvasExportScope, originExportContentOptions, originFilteredCanvasKind, replaceMatchingOriginSeriesAcrossFiles, resolvedCurveExportMode, scopedFileIds, selectedContentKeys, selectedCurveOptionKeySet, setContentKeys, setOriginCanvasExportScope, setOriginFilteredCanvasKind, setResolvedCurveExportMode, showFilteredCanvasKindSelect, t, }: OriginExportToolbarProps) => (jsxs("div", {
    className: "rounded-xl border border-border bg-bg-page/40 px-4 py-3",
    children: [
        jsxs("div", {
            className: "flex items-center justify-between gap-3 flex-wrap",
            children: [
                jsxs("div", {
                    role: "toolbar",
                    "aria-label": t("da_analysis_results_tab_export"),
                    className: "flex items-center gap-2 flex-wrap",
                    children: [
                        jsx("span", {
                            className: "text-xs text-text-secondary whitespace-nowrap",
                            children: t("da_origin_export_mode_label")
                        }),
                        jsx(DropdownField, {
                            id: "analysis-origin-export-mode-select",
                            size: "sm",
                            value: mode,
                            onChange: (next: any) => onModeChange(isOriginExportMode(next) ? next : "merged"),
                            options: [
                                {
                                    value: "merged",
                                    label: t("da_origin_export_mode_merged"),
                                },
                                {
                                    value: "workbookSheets",
                                    label: t("da_origin_export_mode_workbook_sheets"),
                                },
                                {
                                    value: "workbookBooks",
                                    label: t("da_origin_export_mode_workbook_books"),
                                },
                                {
                                    value: "separate",
                                    label: t("da_origin_export_mode_separate"),
                                },
                            ],
                            className: "w-fit da-neutral-select",
                            stableWidth: true,
                            "data-cta": "Device Analysis",
                            "data-cta-position": "export-pane",
                            "data-cta-copy": "origin export mode"
                        }),
                        jsx("span", {
                            className: "text-xs text-text-secondary whitespace-nowrap",
                            children: t("da_origin_canvas_scope_label")
                        }),
                        jsx(DropdownField, {
                            id: "analysis-origin-canvas-scope-select",
                            size: "sm",
                            value: originCanvasExportScope,
                            onChange: (next: any) => {
                                const normalizedScope = next === "current" || next === "filtered" || next === "selected" || next === "all"
                                    ? next
                                    : "selected";
                                setOriginCanvasExportScope(normalizedScope);
                            },
                            options: [
                                {
                                    value: "all",
                                    label: t("da_origin_canvas_scope_all"),
                                },
                                {
                                    value: "current",
                                    label: t("da_origin_canvas_scope_current"),
                                },
                                {
                                    value: "filtered",
                                    label: t("da_origin_canvas_scope_filtered"),
                                },
                                {
                                    value: "selected",
                                    label: t("da_origin_canvas_scope_selected"),
                                },
                            ],
                            className: "w-fit da-neutral-select",
                            stableWidth: true,
                            "data-cta": "Device Analysis",
                            "data-cta-position": "export-pane",
                            "data-cta-copy": "origin canvas export scope"
                        }),
                        showFilteredCanvasKindSelect ? (jsxs(Fragment, {
                            children: [
                                jsx("span", {
                                    className: "text-xs text-text-secondary whitespace-nowrap",
                                    children: t("da_origin_filtered_canvas_kind_label")
                                }),
                                jsx(DropdownField, {
                                    id: "analysis-origin-filtered-canvas-kind-select",
                                    size: "sm",
                                    value: originFilteredCanvasKind,
                                    onChange: (next: any) => {
                                        setOriginFilteredCanvasKind(next === "transfer" ? "transfer" : "output");
                                    },
                                    options: [
                                        {
                                            value: "transfer",
                                            label: t("da_origin_filtered_canvas_kind_transfer"),
                                        },
                                        {
                                            value: "output",
                                            label: t("da_origin_filtered_canvas_kind_output"),
                                        },
                                    ],
                                    className: "w-fit da-neutral-select",
                                    stableWidth: true,
                                    "data-cta": "Device Analysis",
                                    "data-cta-position": "export-pane",
                                    "data-cta-copy": "origin filtered canvas kind"
                                })
                            ]
                        })) : null,
                        jsx("span", {
                            className: "text-xs text-text-secondary whitespace-nowrap",
                            children: t("da_origin_curve_export_mode_label")
                        }),
                        jsx(OriginCurveExportMenu, {
                            curveOptions: curveOptions,
                            selectedCurveOptionKeySet: selectedCurveOptionKeySet,
                            mode: resolvedCurveExportMode,
                            onSelectedCurveOptionKeysChange: onSelectedCurveOptionKeysChange,
                            scopedFileIds: scopedFileIds,
                            setMode: setResolvedCurveExportMode,
                            replaceMatchingOriginSeriesAcrossFiles: replaceMatchingOriginSeriesAcrossFiles,
                            t: t
                        }),
                        jsx("span", {
                            className: "text-xs text-text-secondary whitespace-nowrap",
                            children: t("da_origin_export_content_label")
                        }),
                        jsx(OriginExportContentMenu, {
                            options: originExportContentOptions,
                            selectedKeys: selectedContentKeys,
                            setSelectedKeys: setContentKeys,
                            t: t
                        })
                    ]
                }),
                jsxs("div", {
                    className: "flex items-center gap-2 flex-wrap",
                    children: [
                        renderToolbarButton({
                            id: "analysis-origin-open-btn",
                            variant: "primary",
                            onClick: () => {
                                void onOpenInOrigin();
                            },
                            label: t("da_open_in_origin")
                        }),
                        renderToolbarButton({
                            variant: "secondary",
                            onClick: () => {
                                void onExportOriginZip();
                            },
                            label: t("da_export_origin_zip")
                        })
                    ]
                })
            ]
        }),
        mode === "merged" && hasMixedExportYScales ? (jsx("div", {
            className: "mt-3 space-y-2",
            children: jsx("div", {
                className: "rounded-lg border border-border bg-bg-page/60 px-3 py-2 text-xs text-text-secondary",
                children: jsxs("div", {
                    className: "flex items-start gap-2",
                    children: [
                        renderLocalCogIcon({
                            icon: lxAlertTriangle,
                            size: 14,
                            className: "mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500",
                            "aria-hidden": "true"
                        }),
                        jsx("span", {
                            children: t("da_origin_export_mode_mixed_y_scale_split_hint")
                        })
                    ]
                })
            })
        })) : null
    ]
}));
export default OriginExportToolbar;

const renderToolbarButton = ({
    id,
    label,
    onClick,
    variant,
}: {
    readonly id?: string;
    readonly label: string;
    readonly onClick: () => void;
    readonly variant: "primary" | "secondary";
}) => jsx("button", {
    id,
    type: "button",
    className: getButtonClassName({
        size: "sm",
        variant,
    }),
    onClick,
    children: jsx("span", {
        className: getButtonContentClassName(),
        children: label
    })
});


