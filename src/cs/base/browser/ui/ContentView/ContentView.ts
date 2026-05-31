import { jsx } from "react/jsx-runtime";
import { useLayoutEffect, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode, type Ref, type RefObject, } from "react";
import { createPortal } from "react-dom";
import { getClientArea, getContentWidth, getDomRect, getElementSize } from "src/cs/base/browser/dom";
import { anchoredLayout, rectFromDomRect } from "src/cs/base/common/layout";
import { addDisposableListener, combinedDisposable, EventType } from "src/cs/base/browser/event";
import { cx } from "src/utils/cx";
export type ContentViewAlign = "left" | "center" | "right";
export type ContentViewSide = "bottom" | "right";
type ResolvedContentViewSide = "top" | "bottom" | "right" | "left";
type ContentViewVariant = "surface" | "menu";
type ContentViewChildren = ReactNode | (() => ReactNode);
type ContentViewProps = {
    isOpen: boolean;
    align?: ContentViewAlign;
    zIndex?: number;
    className?: string;
    children?: ContentViewChildren;
    triggerId?: string;
    menuId?: string;
    anchorRef?: RefObject<HTMLElement | null>;
    contentRef?: Ref<HTMLDivElement | null>;
    matchAnchorWidth?: boolean;
    side?: ContentViewSide;
    variant?: ContentViewVariant;
    role?: string;
    "aria-orientation"?: "vertical" | "horizontal";
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
const ContentView = ({ isOpen, align = "left", zIndex = 20, className = "", children, triggerId, menuId, anchorRef, contentRef, matchAnchorWidth = false, side: preferredSide = "bottom", variant = "surface", role = "menu", "aria-orientation": ariaOrientation = "vertical", }: ContentViewProps) => {
    const contentViewRef = useRef<HTMLDivElement | null>(null);
    const [portalStyle, setPortalStyle] = useState<CSSProperties | null>(null);
    const [side, setSide] = useState<ResolvedContentViewSide>("bottom");
    const setContentViewNode = (node: HTMLDivElement | null) => {
        contentViewRef.current = node;
        assignRef(contentRef, node);
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
    const resolvedChildren = typeof children === "function" ? (isOpen ? children() : null) : children;
    if (typeof document === "undefined")
        return null;
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
export default ContentView;
