import { Range } from "src/cs/base/common/range";

export interface IAnchor {
    x: number;
    y: number;
    width?: number;
    height?: number;
}

export interface IPosition {
    readonly top: number;
    readonly left: number;
}

export interface ISize {
    readonly width: number;
    readonly height: number;
}

export interface IRect extends IPosition, ISize {}

export const enum AnchorAlignment {
    LEFT,
    CENTER,
    RIGHT,
}

export const enum AnchorPosition {
    BELOW,
    ABOVE,
    RIGHT,
    LEFT,
}

export const enum AnchorAxisAlignment {
    VERTICAL,
    HORIZONTAL,
}

export const enum LayoutAnchorPosition {
    Before,
    After,
}

export enum LayoutAnchorMode {
    AVOID,
    ALIGN,
}

export interface ILayoutAnchor {
    readonly offset: number;
    readonly size: number;
    mode?: LayoutAnchorMode;
    readonly position: LayoutAnchorPosition;
}

export interface ILayoutResult {
    readonly position: number;
    readonly result: "ok" | "flipped" | "overlap";
}

export interface ILayout2DOptions {
    readonly anchorAlignment?: AnchorAlignment;
    readonly anchorPosition?: AnchorPosition;
    readonly anchorAxisAlignment?: AnchorAxisAlignment;
}

export interface ILayout2DResult extends IPosition {
    readonly bottom: number;
    readonly right: number;
    readonly anchorAlignment: AnchorAlignment;
    readonly anchorPosition: AnchorPosition;
}

export interface IAnchoredLayoutOptions {
    readonly viewport: IRect;
    readonly anchor: IRect;
    readonly view: ISize;
    readonly gap?: number;
    readonly padding?: number;
    readonly align?: "left" | "center" | "right";
    readonly side?: "bottom" | "right";
}

export interface IAnchoredLayoutResult extends IPosition {
    readonly width: number;
    readonly maxWidth: number;
    readonly minWidth?: number;
    readonly side: "top" | "bottom" | "right" | "left";
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

export function rectFromBounds(left: number, top: number, right: number, bottom: number): IRect {
    return {
        left,
        top,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
    };
}

export function rectFromDomRect(rect: Pick<DOMRect, "left" | "top" | "width" | "height">): IRect {
    return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
    };
}

export function layout(viewportSize: number, viewSize: number, anchor: ILayoutAnchor): ILayoutResult {
    const afterBoundary = anchor.mode === LayoutAnchorMode.ALIGN ? anchor.offset : anchor.offset + anchor.size;
    const beforeBoundary = anchor.mode === LayoutAnchorMode.ALIGN ? anchor.offset + anchor.size : anchor.offset;

    if (anchor.position === LayoutAnchorPosition.Before) {
        if (viewSize <= viewportSize - afterBoundary) {
            return { position: afterBoundary, result: "ok" };
        }

        if (viewSize <= beforeBoundary) {
            return { position: beforeBoundary - viewSize, result: "flipped" };
        }

        return { position: Math.max(viewportSize - viewSize, 0), result: "overlap" };
    }

    if (viewSize <= beforeBoundary) {
        return { position: beforeBoundary - viewSize, result: "ok" };
    }

    if (viewSize <= viewportSize - afterBoundary && beforeBoundary < viewSize / 2) {
        return { position: afterBoundary, result: "flipped" };
    }

    return { position: 0, result: "overlap" };
}

export function layout2d(viewport: IRect, view: ISize, anchor: IRect, options?: ILayout2DOptions): ILayout2DResult {
    let anchorAlignment = options?.anchorAlignment ?? AnchorAlignment.LEFT;
    let anchorPosition = options?.anchorPosition ?? AnchorPosition.BELOW;
    const anchorAxisAlignment = options?.anchorAxisAlignment ?? AnchorAxisAlignment.VERTICAL;
    let top: number;
    let left: number;

    if (anchorAxisAlignment === AnchorAxisAlignment.VERTICAL) {
        const verticalAnchor: ILayoutAnchor = {
            offset: anchor.top - viewport.top,
            size: anchor.height,
            position: anchorPosition === AnchorPosition.BELOW ? LayoutAnchorPosition.Before : LayoutAnchorPosition.After,
        };
        const horizontalAnchor: ILayoutAnchor = {
            offset: anchor.left - viewport.left,
            size: anchor.width,
            position: anchorAlignment === AnchorAlignment.LEFT ? LayoutAnchorPosition.Before : LayoutAnchorPosition.After,
            mode: LayoutAnchorMode.ALIGN,
        };

        const verticalResult = layout(viewport.height, view.height, verticalAnchor);
        top = verticalResult.position + viewport.top;

        if (verticalResult.result === "flipped") {
            anchorPosition = anchorPosition === AnchorPosition.BELOW ? AnchorPosition.ABOVE : AnchorPosition.BELOW;
        }

        if (Range.intersects({ start: top, end: top + view.height }, { start: anchor.top, end: anchor.top + anchor.height })) {
            horizontalAnchor.mode = LayoutAnchorMode.AVOID;
        }

        const horizontalResult = layout(viewport.width, view.width, horizontalAnchor);
        left = horizontalResult.position + viewport.left;

        if (horizontalResult.result === "flipped") {
            anchorAlignment = anchorAlignment === AnchorAlignment.LEFT ? AnchorAlignment.RIGHT : AnchorAlignment.LEFT;
        }
    }
    else {
        const horizontalAnchor: ILayoutAnchor = {
            offset: anchor.left - viewport.left,
            size: anchor.width,
            position: anchorPosition === AnchorPosition.RIGHT ? LayoutAnchorPosition.Before : LayoutAnchorPosition.After,
        };
        const verticalAnchor: ILayoutAnchor = {
            offset: anchor.top - viewport.top,
            size: anchor.height,
            position: LayoutAnchorPosition.Before,
            mode: LayoutAnchorMode.ALIGN,
        };

        const horizontalResult = layout(viewport.width, view.width, horizontalAnchor);
        left = horizontalResult.position + viewport.left;

        if (horizontalResult.result === "flipped") {
            anchorPosition = anchorPosition === AnchorPosition.RIGHT ? AnchorPosition.LEFT : AnchorPosition.RIGHT;
        }

        if (Range.intersects({ start: left, end: left + view.width }, { start: anchor.left, end: anchor.left + anchor.width })) {
            verticalAnchor.mode = LayoutAnchorMode.AVOID;
        }

        const verticalResult = layout(viewport.height, view.height, verticalAnchor);
        top = verticalResult.position + viewport.top;
    }

    return {
        top,
        left,
        bottom: viewport.top + viewport.height - (top + view.height),
        right: viewport.left + viewport.width - (left + view.width),
        anchorAlignment,
        anchorPosition,
    };
}

export function anchoredLayout(options: IAnchoredLayoutOptions): IAnchoredLayoutResult {
    const gap = options.gap ?? 0;
    const padding = options.padding ?? 0;
    const viewport = options.viewport;
    const anchor = options.anchor;
    const maxWidth = Math.max(0, viewport.width - padding * 2);
    const width = Math.min(options.view.width, maxWidth);
    const height = options.view.height;
    const minLeft = viewport.left + padding;
    const maxLeft = Math.max(minLeft, viewport.left + viewport.width - padding - width);
    const minTop = viewport.top + padding;
    const maxTop = Math.max(minTop, viewport.top + viewport.height - padding - height);

    if (options.side === "right") {
        const preferredLeft = anchor.left + anchor.width + gap;
        const flippedLeft = anchor.left - gap - width;
        const canOpenRight = preferredLeft + width <= viewport.left + viewport.width - padding;
        const canOpenLeft = flippedLeft >= minLeft;
        const left = canOpenRight
            ? preferredLeft
            : canOpenLeft
                ? flippedLeft
                : clamp(preferredLeft, minLeft, maxLeft);

        return {
            top: clamp(anchor.top, minTop, maxTop),
            left,
            width,
            maxWidth,
            side: canOpenRight || !canOpenLeft ? "right" : "left",
        };
    }

    let left = anchor.left;
    if (options.align === "center") {
        left = anchor.left + anchor.width / 2 - width / 2;
    }
    else if (options.align === "right") {
        left = anchor.left + anchor.width - width;
    }
    left = clamp(left, minLeft, maxLeft);

    const preferredTop = anchor.top + anchor.height + gap;
    const flippedTop = anchor.top - gap - height;
    const canOpenDown = preferredTop + height <= viewport.top + viewport.height - padding;
    const canOpenUp = flippedTop >= minTop;

    return {
        top: canOpenDown
            ? preferredTop
            : canOpenUp
                ? flippedTop
                : clamp(preferredTop, minTop, maxTop),
        left,
        width,
        maxWidth,
        side: canOpenDown || !canOpenUp ? "bottom" : "top",
    };
}
