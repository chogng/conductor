import { jsx } from "react/jsx-runtime";
import { useLayoutEffect, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode, type Ref, type RefObject, } from "react";
import { createPortal } from "react-dom";
import { cx } from "src/utils/cx";
import "./contentview.css";
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
            const rect = anchorEl.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const anchorWidth = Math.max(0, rect.width);
            const maxWidth = Math.max(0, viewportWidth - VIEWPORT_PADDING_PX * 2);
            const surfaceEl = contentViewEl.firstElementChild;
            const contentWidth = Math.max(surfaceEl instanceof HTMLElement ? surfaceEl.scrollWidth || 0 : 0, contentViewEl.scrollWidth || 0, contentViewEl.offsetWidth || 0);
            const contentViewWidth = matchAnchorWidth
                ? Math.min(Math.max(contentWidth, anchorWidth), maxWidth)
                : Math.min(contentWidth, maxWidth);
            const minWidth = matchAnchorWidth
                ? Math.min(anchorWidth, maxWidth)
                : undefined;
            const contentViewHeight = contentViewEl.offsetHeight || 0;
            let left = rect.left;
            let top = rect.bottom + CONTENT_VIEW_GAP_PX;
            let nextSide: ResolvedContentViewSide = "bottom";
            if (preferredSide === "right") {
                const preferredLeft = rect.right + CONTENT_VIEW_GAP_PX;
                const leftIfFlipped = rect.left - CONTENT_VIEW_GAP_PX - contentViewWidth;
                const canOpenRight = preferredLeft + contentViewWidth <= viewportWidth - VIEWPORT_PADDING_PX;
                const canOpenLeft = leftIfFlipped >= VIEWPORT_PADDING_PX;
                left = canOpenRight
                    ? preferredLeft
                    : canOpenLeft
                        ? leftIfFlipped
                        : Math.min(Math.max(VIEWPORT_PADDING_PX, preferredLeft), Math.max(VIEWPORT_PADDING_PX, viewportWidth - VIEWPORT_PADDING_PX - contentViewWidth));
                top = Math.min(Math.max(VIEWPORT_PADDING_PX, rect.top), Math.max(VIEWPORT_PADDING_PX, viewportHeight - VIEWPORT_PADDING_PX - contentViewHeight));
                nextSide = canOpenRight || !canOpenLeft ? "right" : "left";
            }
            else {
                if (align === "center") {
                    left = rect.left + rect.width / 2 - contentViewWidth / 2;
                }
                else if (align === "right") {
                    left = rect.right - contentViewWidth;
                }
                const maxLeft = Math.max(VIEWPORT_PADDING_PX, viewportWidth - VIEWPORT_PADDING_PX - contentViewWidth);
                left = Math.min(Math.max(left, VIEWPORT_PADDING_PX), maxLeft);
                const preferredTop = rect.bottom + CONTENT_VIEW_GAP_PX;
                const topIfFlipped = rect.top - CONTENT_VIEW_GAP_PX - contentViewHeight;
                const canOpenDown = preferredTop + contentViewHeight <= viewportHeight - VIEWPORT_PADDING_PX;
                const canOpenUp = topIfFlipped >= VIEWPORT_PADDING_PX;
                top = canOpenDown
                    ? preferredTop
                    : canOpenUp
                        ? topIfFlipped
                        : Math.min(Math.max(VIEWPORT_PADDING_PX, preferredTop), Math.max(VIEWPORT_PADDING_PX, viewportHeight - VIEWPORT_PADDING_PX - contentViewHeight));
                nextSide = canOpenDown || !canOpenUp ? "bottom" : "top";
            }
            setPortalStyle({
                position: "fixed",
                top,
                left,
                width: contentViewWidth,
                minWidth,
                maxWidth,
                zIndex,
            });
            setSide(nextSide);
        };
        updatePosition();
        window.addEventListener("resize", updatePosition);
        window.addEventListener("scroll", updatePosition, true);
        return () => {
            window.removeEventListener("resize", updatePosition);
            window.removeEventListener("scroll", updatePosition, true);
        };
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
