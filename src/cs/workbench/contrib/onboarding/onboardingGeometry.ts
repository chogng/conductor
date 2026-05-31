import type { OnboardingCardAnchor, OnboardingStep } from "src/cs/workbench/contrib/onboarding/onboardingTypes";

export type OnboardingStyle = Record<string, string | number | undefined>;

export type RectLike = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type HighlightRect = RectLike & {
  radius: number;
};

export type CardSize = {
  width: number;
  height: number;
};

export type BoxOutsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export const CARD_WIDTH = 500;
export const CARD_MARGIN = 16;
export const RING_PADDING = 8;
export const SPOTLIGHT_PADDING = 12;
export const CARD_HEIGHT = 230;
const RECT_EPSILON = 0.5;

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const splitCssList = (value: string): string[] => {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of value) {
    if (char === "(") {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ")") {
      depth = Math.max(0, depth - 1);
      current += char;
      continue;
    }

    if (char === "," && depth === 0) {
      const nextPart = current.trim();
      if (nextPart) {
        parts.push(nextPart);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const tail = current.trim();
  if (tail) {
    parts.push(tail);
  }

  return parts;
};

export const getShadowOutsets = (boxShadowValue: string): BoxOutsets => {
  if (!boxShadowValue || boxShadowValue === "none") {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  return splitCssList(boxShadowValue).reduce<BoxOutsets>(
    (maxOutsets, shadow) => {
      if (!shadow || shadow.includes(" inset")) {
        return maxOutsets;
      }

      const values = [...shadow.matchAll(/-?\d*\.?\d+px/g)].map((match) =>
        Number.parseFloat(match[0]),
      );

      if (values.length < 2) {
        return maxOutsets;
      }

      const [offsetX, offsetY, blurRadius = 0, spreadRadius = 0] = values;
      const extent = blurRadius + spreadRadius;

      return {
        top: Math.max(maxOutsets.top, Math.max(0, extent - offsetY)),
        right: Math.max(maxOutsets.right, Math.max(0, extent + offsetX)),
        bottom: Math.max(maxOutsets.bottom, Math.max(0, extent + offsetY)),
        left: Math.max(maxOutsets.left, Math.max(0, extent - offsetX)),
      };
    },
    { top: 0, right: 0, bottom: 0, left: 0 },
  );
};

export const getBoundingRect = (rects: HighlightRect[]): RectLike | null => {
  if (rects.length === 0) return null;

  const top = Math.min(...rects.map((rect) => rect.top));
  const left = Math.min(...rects.map((rect) => rect.left));
  const right = Math.max(...rects.map((rect) => rect.left + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.top + rect.height));

  return {
    top,
    left,
    width: right - left,
    height: bottom - top,
  };
};

const isRectNumberEqual = (a: number, b: number): boolean =>
  Math.abs(a - b) < RECT_EPSILON;

export const areRectLikesEqual = (
  a: RectLike | null,
  b: RectLike | null,
): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;

  return (
    isRectNumberEqual(a.top, b.top) &&
    isRectNumberEqual(a.left, b.left) &&
    isRectNumberEqual(a.width, b.width) &&
    isRectNumberEqual(a.height, b.height)
  );
};

export const areHighlightRectsEqual = (
  currentRects: HighlightRect[],
  nextRects: HighlightRect[],
): boolean => {
  if (currentRects === nextRects) return true;
  if (currentRects.length !== nextRects.length) return false;

  return currentRects.every((rect, index) => {
    const nextRect = nextRects[index];
    return (
      isRectNumberEqual(rect.top, nextRect.top) &&
      isRectNumberEqual(rect.left, nextRect.left) &&
      isRectNumberEqual(rect.width, nextRect.width) &&
      isRectNumberEqual(rect.height, nextRect.height) &&
      isRectNumberEqual(rect.radius, nextRect.radius)
    );
  });
};

const clampRectToViewport = (
  rect: RectLike,
  viewportWidth: number,
  viewportHeight: number,
): RectLike | null => {
  const left = clamp(rect.left, 0, viewportWidth);
  const top = clamp(rect.top, 0, viewportHeight);
  const right = clamp(rect.left + rect.width, 0, viewportWidth);
  const bottom = clamp(rect.top + rect.height, 0, viewportHeight);

  if (right <= left || bottom <= top) {
    return null;
  }

  return {
    top,
    left,
    width: right - left,
    height: bottom - top,
  };
};

const isPointInsideRect = (x: number, y: number, rect: RectLike): boolean =>
  x >= rect.left &&
  x <= rect.left + rect.width &&
  y >= rect.top &&
  y <= rect.top + rect.height;

export const getInteractionBlockerRects = (
  viewportWidth: number,
  viewportHeight: number,
  passthroughRects: RectLike[],
): RectLike[] => {
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return [];
  }

  const clampedRects = passthroughRects
    .map((rect) => clampRectToViewport(rect, viewportWidth, viewportHeight))
    .filter((rect): rect is RectLike => Boolean(rect));

  if (clampedRects.length === 0) {
    return [
      {
        top: 0,
        left: 0,
        width: viewportWidth,
        height: viewportHeight,
      },
    ];
  }

  const xBoundaries = Array.from(
    new Set([
      0,
      viewportWidth,
      ...clampedRects.flatMap((rect) => [rect.left, rect.left + rect.width]),
    ]),
  ).sort((a, b) => a - b);
  const yBoundaries = Array.from(
    new Set([
      0,
      viewportHeight,
      ...clampedRects.flatMap((rect) => [rect.top, rect.top + rect.height]),
    ]),
  ).sort((a, b) => a - b);

  const blockerRects: RectLike[] = [];

  for (let yIndex = 0; yIndex < yBoundaries.length - 1; yIndex += 1) {
    const top = yBoundaries[yIndex];
    const bottom = yBoundaries[yIndex + 1];
    if (bottom <= top) continue;

    for (let xIndex = 0; xIndex < xBoundaries.length - 1; xIndex += 1) {
      const left = xBoundaries[xIndex];
      const right = xBoundaries[xIndex + 1];
      if (right <= left) continue;

      const centerX = left + (right - left) / 2;
      const centerY = top + (bottom - top) / 2;
      const isPassthroughCell = clampedRects.some((rect) =>
        isPointInsideRect(centerX, centerY, rect),
      );

      if (isPassthroughCell) {
        continue;
      }

      blockerRects.push({
        top,
        left,
        width: right - left,
        height: bottom - top,
      });
    }
  }

  return blockerRects;
};

export const computeCardPosition = (
  rect: RectLike | null,
  placement: OnboardingStep["placement"],
  cardSize: CardSize,
  offsetX = 0,
  offsetY = 0,
): OnboardingStyle => {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxLeft = Math.max(
    CARD_MARGIN,
    viewportWidth - cardSize.width - CARD_MARGIN,
  );
  const maxTop = Math.max(
    CARD_MARGIN,
    viewportHeight - cardSize.height - CARD_MARGIN,
  );

  if (!rect || placement === "center") {
    return {
      left: clamp(
        (viewportWidth - cardSize.width) / 2 + offsetX,
        CARD_MARGIN,
        maxLeft,
      ),
      top: clamp(
        (viewportHeight - cardSize.height) / 2 + offsetY,
        CARD_MARGIN,
        maxTop,
      ),
      width: cardSize.width,
    };
  }

  const defaultLeft = clamp(rect.left, CARD_MARGIN, maxLeft);
  const alignCenterLeft = clamp(
    rect.left + rect.width / 2 - cardSize.width / 2,
    CARD_MARGIN,
    maxLeft,
  );
  const topAbove = rect.top - cardSize.height - CARD_MARGIN;
  const topBelow = rect.top + rect.height + CARD_MARGIN;
  const centeredTop = clamp(
    rect.top + rect.height / 2 - cardSize.height / 2,
    CARD_MARGIN,
    maxTop,
  );

  if (placement === "left") {
    const preferredLeft = rect.left - cardSize.width - CARD_MARGIN;
    if (preferredLeft >= CARD_MARGIN) {
      return {
        left: clamp(preferredLeft + offsetX, CARD_MARGIN, maxLeft),
        top: clamp(centeredTop + offsetY, CARD_MARGIN, maxTop),
        width: cardSize.width,
      };
    }
  }

  if (placement === "right") {
    const preferredLeft = rect.left + rect.width + CARD_MARGIN;
    if (preferredLeft + cardSize.width <= viewportWidth - CARD_MARGIN) {
      return {
        left: clamp(preferredLeft + offsetX, CARD_MARGIN, maxLeft),
        top: clamp(centeredTop + offsetY, CARD_MARGIN, maxTop),
        width: cardSize.width,
      };
    }
  }

  if (placement === "top" && topAbove >= CARD_MARGIN) {
    return {
      left: clamp(alignCenterLeft + offsetX, CARD_MARGIN, maxLeft),
      top: clamp(topAbove + offsetY, CARD_MARGIN, maxTop),
      width: cardSize.width,
    };
  }

  if (placement === "bottom" || placement === "top") {
    return {
      left: clamp(alignCenterLeft + offsetX, CARD_MARGIN, maxLeft),
      top: clamp(topBelow + offsetY, CARD_MARGIN, maxTop),
      width: cardSize.width,
    };
  }

  return {
    left: clamp(defaultLeft + offsetX, CARD_MARGIN, maxLeft),
    top: clamp(topBelow + offsetY, CARD_MARGIN, maxTop),
    width: cardSize.width,
  };
};

export const computeAnchoredCardPosition = (
  rect: RectLike,
  anchor: OnboardingCardAnchor,
  cardSize: CardSize,
  offsetX = 0,
  offsetY = 0,
): OnboardingStyle => {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxLeft = Math.max(
    CARD_MARGIN,
    viewportWidth - cardSize.width - CARD_MARGIN,
  );
  const maxTop = Math.max(
    CARD_MARGIN,
    viewportHeight - cardSize.height - CARD_MARGIN,
  );

  const anchorLeft = (() => {
    if (anchor === "top-center" || anchor === "bottom-center") {
      return rect.left + rect.width / 2 - cardSize.width / 2;
    }
    if (anchor === "top-right" || anchor === "bottom-right") {
      return rect.left + rect.width - cardSize.width;
    }
    return rect.left;
  })();

  const anchorTop = (() => {
    if (anchor === "center") {
      return rect.top + rect.height / 2 - cardSize.height / 2;
    }
    if (
      anchor === "bottom-left" ||
      anchor === "bottom-center" ||
      anchor === "bottom-right"
    ) {
      return rect.top + rect.height - cardSize.height;
    }
    return rect.top;
  })();

  return {
    left: clamp(anchorLeft + offsetX, CARD_MARGIN, maxLeft),
    top: clamp(anchorTop + offsetY, CARD_MARGIN, maxTop),
    width: cardSize.width,
  };
};






