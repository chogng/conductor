import { lxCheck, lxChevronDown } from "cogicon";
import { Fragment, jsx } from "react/jsx-runtime";
import { forwardRef, isValidElement, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ComponentType, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type MutableRefObject, type ReactNode, type Ref, type RefCallback, type RefObject, } from "react";
import { createPortal } from "react-dom";
import { getClientArea, getContentWidth, getDomRect, getElementSize } from "src/cs/base/browser/dom";
import { addDisposableListener, combinedDisposable, EventType } from "src/cs/base/browser/event";
import { anchoredLayout, rectFromDomRect } from "src/cs/base/common/layout";
import { cx } from "src/utils/cx";
import { getCogIconClassName, getCogIconMarkup, getCogIconStyle, type CogIconRenderer, type CogIconStyle } from "src/cs/base/browser/ui/cogIcon/cogIcon";
import { type ContentViewAlign } from "src/cs/base/browser/ui/contentView/contentView";

import "src/cs/base/browser/ui/dropdownField/dropdownField.css";

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

const hasWidthConstraintClass = (className: string): boolean => {
    if (!className.trim())
        return false;
    return className
        .split(/\s+/)
        .map((token) => token.split(":").pop() ?? token)
        .some((baseToken) => {
        if (baseToken.startsWith("min-w-") ||
            baseToken.startsWith("max-w-") ||
            baseToken.startsWith("basis-")) {
            return true;
        }
        if (!baseToken.startsWith("w-"))
            return false;
        if (baseToken === "w-fit" ||
            baseToken === "w-auto" ||
            baseToken === "w-min" ||
            baseToken === "w-max") {
            return false;
        }
        return true;
    });
};
type DropdownFieldValue = string | number;
type DropdownFieldSize = "sm" | "md" | "xl";
type DropdownFieldIconComponent = ComponentType<{
    style?: CSSProperties;
    className?: string;
}>;
type DropdownFieldOptionAction = {
    ariaLabel: string;
    title?: string;
    icon: DropdownFieldIconComponent;
    onClick: (option: DropdownFieldOption, event: ReactMouseEvent<HTMLButtonElement>) => void;
    className?: string;
    visible?: "always" | "hover";
};
type DropdownFieldOption = {
    label?: ReactNode;
    value: DropdownFieldValue;
    icon?: DropdownFieldIconComponent;
    group?: string;
    tone?: "default" | "accent";
    disabled?: boolean;
    closeOnSelect?: boolean;
    onSelect?: (option: DropdownFieldOption) => void;
    secondaryAction?: DropdownFieldOptionAction;
};
type IndexedGroup = {
    group: string;
    options: Array<{
        option: DropdownFieldOption;
        index: number;
    }>;
};
type DropdownFieldProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "value" | "size"> & {
    options?: DropdownFieldOption[];
    value?: DropdownFieldValue;
    onChange?: (nextValue: DropdownFieldValue) => void;
    placeholder?: ReactNode;
    title?: ReactNode;
    disabled?: boolean;
    size?: DropdownFieldSize;
    className?: string;
    formatDisplay?: (selected: DropdownFieldOption | null) => ReactNode;
    align?: ContentViewAlign;
    zIndex?: number;
    id?: string;
    menuId?: string;
    contentViewClassName?: string;
    triggerClassName?: string;
    testId?: string;
    stableWidth?: boolean;
    hideChevron?: boolean;
    loading?: boolean;
    loadingLabel?: ReactNode;
    emptyLabel?: ReactNode;
    onOpenChange?: (nextOpen: boolean) => void;
};
type ResolvedContentViewSide = "top" | "bottom" | "right" | "left";
type ContentViewChildren = ReactNode | (() => ReactNode);
type LegacyContentViewProps = {
    isOpen: boolean;
    align?: ContentViewAlign;
    zIndex?: number;
    className?: string;
    children?: ContentViewChildren;
    triggerId?: string;
    menuId?: string;
    anchorRef?: RefObject<HTMLElement | null>;
    contentRef?: RefCallback<HTMLDivElement | null>;
    matchAnchorWidth?: boolean;
    side?: "bottom" | "right";
    variant?: "surface" | "menu";
    role?: string;
    "aria-orientation"?: "vertical" | "horizontal";
};
type LegacyMenuProps = {
    children?: ReactNode;
    className?: string;
    role?: string;
    withScrollArea?: boolean;
};
type LegacyMenuItemProps = {
    ["aria-checked"]?: boolean;
    ["data-highlighted"]?: boolean;
    ["data-selected"]?: boolean;
    ["data-value"]?: string;
    children?: ReactNode;
    className?: string;
    disabled?: boolean;
    left?: ReactNode;
    onClick?: (event: ReactMouseEvent<HTMLDivElement>) => void;
    onKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
    onMouseEnter?: (event: ReactMouseEvent<HTMLDivElement>) => void;
    right?: ReactNode;
    role?: string;
    tabIndex?: number;
};
type LegacyDropdownRenderProps = {
    isOpen: boolean;
    open: () => void;
    close: () => void;
    toggle: () => void;
    anchorRef: RefObject<HTMLElement | null>;
    setAnchorRef: RefCallback<HTMLElement | null>;
    contentRef: RefObject<HTMLDivElement | null>;
    setContentRef: RefCallback<HTMLDivElement | null>;
};
type LegacyDropdownProps = {
    isOpen: boolean;
    onOpenChange: (nextOpen: boolean) => void;
    anchorRef?: RefObject<HTMLElement | null>;
    closeOnClickOutside?: boolean;
    closeOnEscape?: boolean;
    children: ReactNode | ((props: LegacyDropdownRenderProps) => ReactNode);
};
type LegacyDropdownTriggerProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
    isOpen: boolean;
    menuId?: string;
    fieldRef?: Ref<HTMLDivElement | null>;
    fieldClassName?: string;
    indicatorClassName?: string;
    indicator?: ReactNode;
    hideIndicator?: boolean;
};

const CONTENT_VIEW_GAP_PX = 8;
const VIEWPORT_PADDING_PX = 8;

const assignRef = <T,>(ref: Ref<T> | undefined, value: T) => {
    if (!ref)
        return;
    if (typeof ref === "function") {
        ref(value);
        return;
    }
    (ref as MutableRefObject<T>).current = value;
};

const LegacyDropdown = ({ isOpen, onOpenChange, anchorRef, closeOnClickOutside = true, closeOnEscape = true, children, }: LegacyDropdownProps) => {
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
            const anchorEl = resolvedAnchorRef.current;
            const target = event.target;
            if (!(target instanceof Node))
                return;
            if (anchorEl?.contains(target))
                return;
            const popupEl = internalContentRef.current;
            if (popupEl?.contains(target))
                return;
            close();
        };
        return addDisposableListener(document, EventType.MOUSE_DOWN, handleClickOutside).dispose;
    }, [closeOnClickOutside, isOpen, resolvedAnchorRef]);
    const renderProps: LegacyDropdownRenderProps = {
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

const LegacyDropdownTrigger = forwardRef<HTMLButtonElement, LegacyDropdownTriggerProps>(({ id, isOpen, menuId, fieldRef, disabled = false, className = "", fieldClassName = "", indicatorClassName = "", indicator, hideIndicator = false, children, ...props }, ref) => jsx("div", {
    ref: fieldRef,
    className: fieldClassName,
    "data-state": disabled ? "disabled" : "enable",
    children: [
        jsx("button", {
            ...props,
            ref,
            id,
            type: "button",
            "aria-haspopup": "menu",
            "aria-expanded": isOpen,
            "aria-controls": menuId,
            disabled,
            "data-state": isOpen ? "open" : "closed",
            className,
            children
        }),
        !hideIndicator ? jsx("span", {
            className: indicatorClassName,
            children: indicator ?? renderLocalCogIcon({
                icon: lxChevronDown,
                size: 16,
                className: cx("transition-transform duration-200", isOpen ? "rotate-180" : "")
            })
        }) : null
    ]
}));

const LegacyContentView = ({ isOpen, align = "left", zIndex = 20, className = "", children, triggerId, menuId, anchorRef, contentRef, matchAnchorWidth = false, side: preferredSide = "bottom", variant = "surface", role = "menu", "aria-orientation": ariaOrientation = "vertical", }: LegacyContentViewProps) => {
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
            const minWidth = matchAnchorWidth
                ? Math.min(anchorWidth, maxWidth)
                : undefined;
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
                minWidth,
                maxWidth: layout.maxWidth,
                zIndex,
            });
            setSide(layout.side);
        };
        updatePosition();
        return combinedDisposable(
            addDisposableListener(window, EventType.RESIZE, updatePosition),
            addDisposableListener(window, EventType.SCROLL, updatePosition, true),
        ).dispose;
    }, [align, anchorRef, isOpen, matchAnchorWidth, preferredSide, zIndex]);

    if (typeof document === "undefined")
        return null;
    const resolvedChildren = typeof children === "function" ? (isOpen ? children() : null) : children;
    return createPortal(jsx("div", {
        ref: setContentViewNode,
        id: menuId,
        role: role,
        "aria-orientation": ariaOrientation,
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
            className: cx("content-view__surface", isOpen
                ? "content-view__surface--open"
                : "content-view__surface--closed", variant === "menu" ? "content-view__surface--menu" : "", className),
            children: resolvedChildren
        })
    }), document.body);
};
const LegacyMenuScrollArea = ({ children }: { children?: ReactNode }) => jsx("div", {
    className: "ui-menu__scroll-area max-h-60 -mr-1 pr-1",
    children: jsx("div", {
        className: "max-h-60",
        style: {
            height: "auto",
            maxHeight: "15rem",
            overflowY: "auto",
        },
        children
    })
});
const LegacyMenu = ({ role = "menu", className = "", children, withScrollArea = true }: LegacyMenuProps) => jsx("div", {
    role,
    className: cx("ui-menu", className),
    children: withScrollArea ? jsx(LegacyMenuScrollArea, { children }) : children
});
const LegacyMenuItem = ({ className = "", left, right, children, disabled = false, role = "menuitem", tabIndex = -1, onClick, onKeyDown, ...props }: LegacyMenuItemProps) => {
    const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || disabled)
            return;
        if (event.key !== "Enter" && event.key !== " ")
            return;
        event.preventDefault();
        onClick?.(event as unknown as ReactMouseEvent<HTMLDivElement>);
    };
    return jsx("div", {
        ...props,
        role,
        tabIndex: disabled ? undefined : tabIndex,
        "aria-disabled": disabled || undefined,
        onClick: disabled ? undefined : onClick,
        onKeyDown: handleKeyDown,
        className: cx("ui-menu__item select-none outline-none", className),
        children: [
            left ?? children,
            right ?? null
        ]
    });
};
const isSelectableOption = (opt: unknown): opt is DropdownFieldOption => {
    if (!opt || typeof opt !== "object")
        return false;
    if (!Object.prototype.hasOwnProperty.call(opt, "value"))
        return false;
    const value = (opt as {
        value: unknown;
    }).value;
    return typeof value === "string" || typeof value === "number";
};
const slugify = (input: unknown): string => String(input ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
const getNodePlainText = (node: ReactNode): string => {
    if (node === null || node === undefined || typeof node === "boolean")
        return "";
    if (typeof node === "string" || typeof node === "number") {
        return String(node);
    }
    if (Array.isArray(node)) {
        return node.map((item) => getNodePlainText(item)).join("");
    }
    if (isValidElement(node)) {
        const children = (node.props as {
            children?: ReactNode;
        } | null)?.children;
        return getNodePlainText(children);
    }
    return "";
};
const DropdownField = ({ options = [], value, onChange, placeholder, title, disabled = false, size = "md", className = "", formatDisplay, align = "left", zIndex = 20, id, menuId, contentViewClassName, triggerClassName = "", testId, stableWidth, hideChevron = false, loading = false, loadingLabel, emptyLabel = "No options", onOpenChange, ...props }: DropdownFieldProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const [stableWidthPx, setStableWidthPx] = useState<number | undefined>(undefined);
    const internalTriggerId = useId();
    const internalMenuId = useId();
    const triggerId = id || `select-${slugify(internalTriggerId)}`;
    const resolvedMenuId = menuId || `select-menu-${slugify(internalMenuId)}`;
    const devTestId = import.meta.env.DEV && testId ? testId : undefined;
    const sizeClass = size === "sm"
        ? "ui-select_field--sm"
        : size === "xl"
            ? "ui-select_field--xl"
            : "ui-select_field--md";
    const itemSizeClass = size === "sm" ? "text-xs" : "text-sm";
    const chevronIconSizePx = size === "sm" ? 16 : 16;
    const checkIconSizePx = size === "sm" ? 14 : 16;
    const selectableOptions = useMemo(() => (Array.isArray(options) ? options.filter(isSelectableOption) : []), [options]);
    const selected = useMemo(() => selectableOptions.find((opt) => opt.value === value) ?? null, [selectableOptions, value]);
    const shouldStabilizeWidth = useMemo(() => stableWidth ?? !hasWidthConstraintClass(className), [stableWidth, className]);
    const resolvedContentViewClassName = contentViewClassName ?? "";
    const displayNode = useMemo(() => {
        if (typeof formatDisplay === "function") {
            const formatted = formatDisplay(selected);
            if (formatted !== undefined && formatted !== null)
                return formatted;
        }
        if (selected?.label !== undefined && selected?.label !== null) {
            return selected.label;
        }
        if (value !== undefined && value !== null)
            return String(value);
        return "";
    }, [formatDisplay, selected, value]);
    const grouped = useMemo(() => {
        const map = new Map<string, DropdownFieldOption[]>();
        for (const opt of selectableOptions) {
            const group = opt.group ? String(opt.group) : "";
            if (!map.has(group))
                map.set(group, []);
            map.get(group)?.push(opt);
        }
        return { map, groups: Array.from(map.keys()) };
    }, [selectableOptions]);
    const flatOptions = useMemo(() => {
        const flat: DropdownFieldOption[] = [];
        for (const group of grouped.groups) {
            for (const opt of grouped.map.get(group) ?? []) {
                flat.push(opt);
            }
        }
        return flat;
    }, [grouped]);
    const indexedGroups = useMemo<IndexedGroup[]>(() => {
        let nextIndex = 0;
        return grouped.groups.map((group) => ({
            group,
            options: (grouped.map.get(group) ?? []).map((opt) => ({
                option: opt,
                index: nextIndex++,
            })),
        }));
    }, [grouped]);
    const openMenu = () => {
        if (disabled)
            return;
        if (!isOpen)
            onOpenChange?.(true);
        setIsOpen(true);
        const selectedIdx = selected
            ? flatOptions.findIndex((opt) => opt.value === selected.value)
            : -1;
        setHighlightedIndex(selectedIdx >= 0 ? selectedIdx : 0);
    };
    const closeMenu = () => {
        if (isOpen)
            onOpenChange?.(false);
        setIsOpen(false);
        setHighlightedIndex(-1);
    };
    const selectOption = (opt: DropdownFieldOption | undefined) => {
        if (!opt || opt.disabled)
            return;
        if (typeof opt.onSelect === "function") {
            opt.onSelect(opt);
        }
        else {
            onChange?.(opt.value);
        }
        if (opt.closeOnSelect !== false)
            closeMenu();
    };
    const handleTriggerClick = () => {
        if (disabled)
            return;
        if (isOpen) {
            closeMenu();
            return;
        }
        openMenu();
    };
    const handleDropdownOpenChange = (nextOpen: boolean) => {
        if (isOpen !== nextOpen)
            onOpenChange?.(nextOpen);
        setIsOpen(nextOpen);
        if (!nextOpen)
            setHighlightedIndex(-1);
    };
    const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (disabled)
            return;
        if (!isOpen) {
            if (event.key === "ArrowDown" ||
                event.key === "ArrowUp" ||
                event.key === "Enter" ||
                event.key === " ") {
                event.preventDefault();
                openMenu();
            }
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            closeMenu();
            return;
        }
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlightedIndex((prev) => flatOptions.length
                ? (prev + 1 + flatOptions.length) % flatOptions.length
                : -1);
            return;
        }
        if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlightedIndex((prev) => flatOptions.length
                ? (prev - 1 + flatOptions.length) % flatOptions.length
                : -1);
            return;
        }
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            const opt = flatOptions[highlightedIndex];
            if (opt)
                selectOption(opt);
        }
    };
    // Keep highlight in-range if options change while open.
    useEffect(() => {
        if (!isOpen)
            return;
        if (!flatOptions.length) {
            setHighlightedIndex(-1);
            return;
        }
        setHighlightedIndex((prev) => prev < 0 ? 0 : Math.min(prev, flatOptions.length - 1));
    }, [flatOptions.length, isOpen]);
    const hasDisplayValue = (() => {
        if (displayNode === undefined || displayNode === null)
            return false;
        if (typeof displayNode === "string")
            return displayNode.trim().length > 0;
        return true;
    })();
    const stableWidthTextCandidates = useMemo(() => {
        if (!shouldStabilizeWidth)
            return [];
        const optionTexts = selectableOptions
            .map((opt) => getNodePlainText(opt.label ?? String(opt.value)).trim())
            .filter((text) => text.length > 0);
        const displayText = getNodePlainText(displayNode).trim();
        if (displayText.length > 0)
            optionTexts.push(displayText);
        const placeholderText = getNodePlainText(placeholder).trim();
        if (placeholderText.length > 0)
            optionTexts.push(placeholderText);
        return optionTexts;
    }, [shouldStabilizeWidth, selectableOptions, displayNode, placeholder]);
    useLayoutEffect(() => {
        if (!shouldStabilizeWidth) {
            setStableWidthPx(undefined);
            return;
        }
        const triggerEl = triggerRef.current;
        const fieldEl = triggerEl?.parentElement;
        if (!triggerEl || !fieldEl)
            return;
        const measure = () => {
            const triggerStyles = window.getComputedStyle(triggerEl);
            const fieldStyles = window.getComputedStyle(fieldEl);
            const triggerPaddingRight = Number.parseFloat(triggerStyles.paddingRight) || 0;
            const triggerPaddingLeft = Number.parseFloat(triggerStyles.paddingLeft) || 0;
            const fieldPaddingLeft = Number.parseFloat(fieldStyles.paddingLeft) || 0;
            const fieldPaddingRight = Number.parseFloat(fieldStyles.paddingRight) || 0;
            const fieldBorderLeft = Number.parseFloat(fieldStyles.borderLeftWidth) || 0;
            const fieldBorderRight = Number.parseFloat(fieldStyles.borderRightWidth) || 0;
            const font = triggerStyles.font ||
                `${triggerStyles.fontStyle} ${triggerStyles.fontVariant} ${triggerStyles.fontWeight} ${triggerStyles.fontSize}/${triggerStyles.lineHeight} ${triggerStyles.fontFamily}`;
            const letterSpacingRaw = triggerStyles.letterSpacing;
            const letterSpacing = letterSpacingRaw && letterSpacingRaw !== "normal"
                ? Number.parseFloat(letterSpacingRaw)
                : 0;
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx)
                return;
            ctx.font = font;
            const texts = stableWidthTextCandidates.length
                ? stableWidthTextCandidates
                : [" "];
            let maxTextWidth = 0;
            for (const text of texts) {
                const safeText = text.length > 0 ? text : " ";
                let nextWidth = ctx.measureText(safeText).width;
                if (letterSpacing && Number.isFinite(letterSpacing) && safeText.length > 1) {
                    nextWidth += letterSpacing * (safeText.length - 1);
                }
                maxTextWidth = Math.max(maxTextWidth, nextWidth);
            }
            const triggerWidthPx = maxTextWidth +
                triggerPaddingLeft +
                triggerPaddingRight +
                fieldPaddingLeft +
                fieldPaddingRight +
                fieldBorderLeft +
                fieldBorderRight;
            const popupShellHorizontalPx = 10;
            const menuItemHorizontalPaddingPx = 12;
            const menuItemRightAdornmentPx = 28;
            const menuWidthPx = maxTextWidth +
                popupShellHorizontalPx +
                menuItemHorizontalPaddingPx +
                menuItemRightAdornmentPx;
            const nextWidthPx = Math.ceil(Math.max(triggerWidthPx, menuWidthPx));
            setStableWidthPx((prev) => (prev === nextWidthPx ? prev : nextWidthPx));
        };
        measure();
        let cancelled = false;
        document.fonts?.ready
            .then(() => {
            if (!cancelled)
                measure();
        })
            .catch(() => { });
        return () => {
            cancelled = true;
        };
    }, [
        shouldStabilizeWidth,
        stableWidthTextCandidates,
        sizeClass,
        triggerClassName,
    ]);
    return (jsx("div", {
        ref: containerRef,
        className: cx("ui-select_warp", className),
        style: stableWidthPx !== undefined
            ? ({
                minWidth: `${stableWidthPx}px`,
            } as CSSProperties)
            : undefined,
        "data-style": "select",
        "data-disabled": disabled || undefined,
        children: [
            jsx(LegacyDropdownTrigger, {
                ...props,
                ref: triggerRef,
                fieldRef: containerRef,
                id: triggerId,
                isOpen: isOpen,
                menuId: resolvedMenuId,
                disabled: disabled,
                "data-size": size,
                "data-testid": devTestId,
                onClick: handleTriggerClick,
                onKeyDown: handleKeyDown,
                fieldClassName: cx("input_field", sizeClass, hideChevron ? "pr-2" : "pr-1"),
                className: cx("input_native no-focus-outline p-0 text-left cursor-pointer select-none", hideChevron ? "pr-0" : "pr-6", triggerClassName),
                hideIndicator: hideChevron,
                indicatorClassName: "absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none",
                indicator: renderLocalCogIcon({
                    icon: lxChevronDown,
                    size: chevronIconSizePx,
                    className: cx("transition-transform duration-200", isOpen ? "rotate-180" : "")
                }),
                children: jsx("span", {
                    className: cx("block truncate", hasDisplayValue ? "text-text-primary" : "text-text-tertiary"),
                    children: hasDisplayValue ? displayNode : placeholder ?? ""
                })
            }),
            jsx(LegacyDropdown, {
                isOpen: isOpen,
                onOpenChange: handleDropdownOpenChange,
                anchorRef: containerRef,
                children: ({ anchorRef, setContentRef }: {
                    anchorRef: RefObject<HTMLElement | null>;
                    setContentRef: RefCallback<HTMLDivElement | null>;
                }) => (jsx(LegacyContentView, {
                    isOpen: isOpen,
                    align: align,
                    zIndex: zIndex,
                    matchAnchorWidth: true,
                    triggerId: triggerId,
                    menuId: resolvedMenuId,
                    anchorRef: anchorRef,
                    contentRef: setContentRef,
                    variant: "menu",
                    className: resolvedContentViewClassName,
                    children: () => (jsx(LegacyMenu, {
                        withScrollArea: false,
                        children: [
                            title ? jsx("div", {
                                children: title
                            }, "title") : null,
                            jsx(LegacyMenuScrollArea, {
                                children: jsx("div", {
                                    className: "ui-menu__list",
                                    children: [
                                        loading ? (jsx("div", {
                                            className: "ui-menu__empty",
                                            children: loadingLabel ?? emptyLabel
                                        }, "loading")) : null,
                                        !loading
                                            ? indexedGroups.map(({ group, options: groupOptions }, groupIdx) => (jsx("div", {
                                                role: group ? "group" : undefined,
                                                className: "ui-menu__group",
                                                children: [
                                                    group ? (jsx(Fragment, {
                                                        children: [
                                                            groupIdx > 0 ? (jsx("div", {
                                                                role: "separator",
                                                                "aria-orientation": "horizontal",
                                                                className: "ui-menu__separator"
                                                            }, "separator")) : null,
                                                            jsx("div", {
                                                                className: "ui-menu__group-label",
                                                                children: group
                                                            }, "label")
                                                        ]
                                                    }, "group-label")) : null,
                                                    groupOptions.map(({ option, index: currentIndex }) => {
                                                        const isHighlighted = !option.disabled && highlightedIndex === currentIndex;
                                                        const isSelected = value === option.value;
                                                        const Icon = option.icon;
                                                        const action = option.secondaryAction;
                                                        const ActionIcon = action?.icon;
                                                        return (jsx(LegacyMenuItem, {
                                                            tabIndex: -1,
                                                            "data-highlighted": isHighlighted || undefined,
                                                            "data-selected": isSelected || undefined,
                                                            "data-value": String(option.value),
                                                            onClick: () => selectOption(option),
                                                            onMouseEnter: () => {
                                                                if (!option.disabled)
                                                                    setHighlightedIndex(currentIndex);
                                                            },
                                                            disabled: option.disabled,
                                                            className: cx("group", itemSizeClass, option.disabled
                                                                ? "cursor-default italic text-text-secondary"
                                                                : "", option.tone === "accent" ? "text-accent" : ""),
                                                            left: jsx("span", {
                                                                className: "ui-menu__item-left",
                                                                children: [
                                                                    Icon ? (jsx(Icon, {
                                                                        style: { width: "0.9rem", height: "0.9rem" }
                                                                    }, "icon")) : null,
                                                                    jsx("span", {
                                                                        className: "truncate",
                                                                        children: option.label ?? String(option.value)
                                                                    }, "label")
                                                                ]
                                                            }),
                                                            right: jsx("span", {
                                                                className: "ui-menu__item-right",
                                                                children: ActionIcon && action ? (jsx("button", {
                                                                    type: "button",
                                                                    "aria-label": action.ariaLabel,
                                                                    title: action.title,
                                                                    onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
                                                                        event.stopPropagation();
                                                                        action.onClick(option, event);
                                                                    },
                                                                    className: cx("inline-flex h-6 w-6 items-center justify-center rounded-md text-text-primary transition-colors hover:text-red-500", action.visible === "hover"
                                                                        ? "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus:opacity-100 focus:pointer-events-auto"
                                                                        : "", action.className),
                                                                    children: jsx(ActionIcon, {
                                                                        style: { width: "0.875rem", height: "0.875rem" }
                                                                    })
                                                                })) : isSelected ? (renderLocalCogIcon({
                                                                    icon: lxCheck,
                                                                    size: checkIconSizePx,
                                                                    className: "text-accent"
                                                                })) : null
                                                            })
                                                        }, String(option.value)));
                                                    })
                                                ]
                                            }, group || "default")))
                                            : null,
                                        !loading && flatOptions.length === 0 ? (jsx("div", {
                                            className: "ui-menu__empty",
                                            children: emptyLabel
                                        }, "empty")) : null
                                    ]
                                })
                            }, "scroll")
                        ]
                    }))
                }))
            })
        ]
    }));
};
export default DropdownField;

