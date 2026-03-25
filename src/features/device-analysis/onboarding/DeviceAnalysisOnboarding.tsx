import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Button from "../../../components/ui/Button";
import type { TranslateFn } from "../../../context/language";
import type {
  OnboardingCardAnchor,
  OnboardingStep,
  OnboardingVirtualRingTarget,
  OnboardingVirtualSpotlightTarget,
} from "./onboardingTypes";

type DeviceAnalysisOnboardingProps = {
  isOpen: boolean;
  stepIndex: number;
  steps: OnboardingStep[];
  t: TranslateFn;
  canNext?: boolean;
  onBack: () => void;
  onClose: () => void;
  onNext: () => void;
};

type RectLike = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type HighlightRect = RectLike & {
  radius: number;
};

type CardSize = {
  width: number;
  height: number;
};

type BoxOutsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type HighlightTargets = {
  cardTargetIds?: string[];
  ringTargetIds?: string[];
  ringVirtualTargets?: OnboardingVirtualRingTarget[];
  spotlightTargetIds?: string[];
  spotlightVirtualTargets?: OnboardingVirtualSpotlightTarget[];
};

const CARD_WIDTH = 500;
const CARD_MARGIN = 16;
const RING_PADDING = 8;
const SPOTLIGHT_PADDING = 12;
const CARD_HEIGHT = 230;
const ONBOARDING_PREVIEW_ROW_HEIGHT_PX = 28;
const RECT_EPSILON = 0.5;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const parseRadiusValue = (value: string): number => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

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

const getElementRadius = (element: HTMLElement): number => {
  const styles = window.getComputedStyle(element);
  return Math.max(
    parseRadiusValue(styles.borderTopLeftRadius),
    parseRadiusValue(styles.borderTopRightRadius),
    parseRadiusValue(styles.borderBottomRightRadius),
    parseRadiusValue(styles.borderBottomLeftRadius),
    0,
  );
};

const getShadowOutsets = (boxShadowValue: string): BoxOutsets => {
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

const getElementVisualOutsets = (element: HTMLElement): BoxOutsets => {
  const styles = window.getComputedStyle(element);
  const shadowOutsets = getShadowOutsets(styles.boxShadow);

  return {
    top: shadowOutsets.top,
    right: shadowOutsets.right,
    bottom: shadowOutsets.bottom,
    left: shadowOutsets.left,
  };
};

const resolveHighlightElement = (element: HTMLElement): HTMLElement => {
  const selectWrapper = element.closest("[data-style='select']");
  if (selectWrapper instanceof HTMLElement) {
    return selectWrapper;
  }

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    const wrapper =
      element.closest("[data-style='input']") ?? element.closest(".input_field");
    if (wrapper instanceof HTMLElement) {
      return wrapper;
    }
  }

  return element;
};

const getTargetRects = (
  targetIds: string[] | undefined,
  padding: number,
): HighlightRect[] => {
  if (!Array.isArray(targetIds) || targetIds.length === 0) return [];

  const rects: HighlightRect[] = [];

  for (const id of targetIds) {
    if (!id) continue;
    const rawElement = document.getElementById(id);
    if (!rawElement) continue;
    const element = resolveHighlightElement(rawElement);
    if (!element) continue;

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;

    const outsets = getElementVisualOutsets(element);
    const insetTop = padding + outsets.top;
    const insetRight = padding + outsets.right;
    const insetBottom = padding + outsets.bottom;
    const insetLeft = padding + outsets.left;
    const width = rect.width + insetLeft + insetRight;
    const height = rect.height + insetTop + insetBottom;
    const baseRadius = getElementRadius(element);
    const radius = clamp(
      baseRadius + Math.max(insetTop, insetRight, insetBottom, insetLeft) / 2,
      10,
      Math.min(width, height) / 2,
    );

    rects.push({
      top: Math.max(0, rect.top - insetTop),
      left: Math.max(0, rect.left - insetLeft),
      width,
      height,
      radius,
    });
  }

  return rects;
};

const getVirtualRingTargetRects = (
  targets: OnboardingVirtualRingTarget[] | undefined,
  padding: number,
): HighlightRect[] => {
  if (!Array.isArray(targets) || targets.length === 0) return [];

  const rects: HighlightRect[] = [];

  for (const target of targets) {
    if (target.kind !== "preview-cell") continue;

    const previewCell = document.querySelector<HTMLElement>(
      `#device-analysis-preview-scroll-area td[data-row="${target.rowIndex}"][data-col="${target.colIndex}"]`,
    );
    if (previewCell) {
      const cellRect = previewCell.getBoundingClientRect();
      if (cellRect.width > 0 && cellRect.height > 0) {
        const width = cellRect.width + padding * 2;
        const height = cellRect.height + padding * 2;
        const radius = clamp(10 + padding / 2, 10, Math.min(width, height) / 2);

        rects.push({
          top: Math.max(0, cellRect.top - padding),
          left: Math.max(0, cellRect.left - padding),
          width,
          height,
          radius,
        });
        continue;
      }
    }

    const anchor = document.getElementById(target.anchorId);
    const headerCell = document.querySelector<HTMLElement>(
      `#device-analysis-preview-column-selector-row [data-column-index="${target.colIndex}"]`,
    );
    if (!anchor || !headerCell) continue;

    const anchorRect = anchor.getBoundingClientRect();
    const headerRect = headerCell.getBoundingClientRect();
    if (
      anchorRect.width <= 0 ||
      anchorRect.height <= 0 ||
      headerRect.width <= 0 ||
      headerRect.height <= 0
    ) {
      continue;
    }

    const rowHeight = Math.max(
      1,
      Number(target.rowHeight) || ONBOARDING_PREVIEW_ROW_HEIGHT_PX,
    );
    const width = headerRect.width + padding * 2;
    const height = rowHeight + padding * 2;
    const radius = clamp(10 + padding / 2, 10, Math.min(width, height) / 2);

    rects.push({
      top: Math.max(0, anchorRect.top + target.rowIndex * rowHeight - padding),
      left: Math.max(0, headerRect.left - padding),
      width,
      height,
      radius,
    });
  }

  return rects;
};

const getAnalysisVirtualSpotlightElement = (
  target: OnboardingVirtualSpotlightTarget,
): HTMLElement | null => {
  if (target.kind === "analysis-overview-section") {
    return document.getElementById("device-analysis-overview-sidebar");
  }

  if (target.kind === "analysis-chart-section") {
    return document.querySelector<HTMLElement>(
      '#device-analysis-tabpanel-analysis section[aria-label="Device Analysis chart"]',
    );
  }

  if (target.kind === "analysis-calculated-section") {
    const headings = Array.from(document.querySelectorAll("h3"));
    const heading = headings.find(
      (node) => node.textContent?.trim() === "Calculated Parameters",
    );
    return heading?.closest(".flex.flex-col.flex-1") ?? null;
  }

  return null;
};

const getVirtualSpotlightTargetRects = (
  targets: OnboardingVirtualSpotlightTarget[] | undefined,
  padding: number,
): HighlightRect[] => {
  if (!Array.isArray(targets) || targets.length === 0) return [];

  const rects: HighlightRect[] = [];

  for (const target of targets) {
    const rawElement = getAnalysisVirtualSpotlightElement(target);
    if (!(rawElement instanceof HTMLElement)) continue;

    const element = resolveHighlightElement(rawElement);
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;

    const outsets = getElementVisualOutsets(element);
    const insetTop = padding + outsets.top;
    const insetRight = padding + outsets.right;
    const insetBottom = padding + outsets.bottom;
    const insetLeft = padding + outsets.left;
    const width = rect.width + insetLeft + insetRight;
    const height = rect.height + insetTop + insetBottom;
    const baseRadius = getElementRadius(element);
    const radius = clamp(
      baseRadius + Math.max(insetTop, insetRight, insetBottom, insetLeft) / 2,
      10,
      Math.min(width, height) / 2,
    );

    rects.push({
      top: Math.max(0, rect.top - insetTop),
      left: Math.max(0, rect.left - insetLeft),
      width,
      height,
      radius,
    });
  }

  return rects;
};

const getBoundingRect = (rects: HighlightRect[]): RectLike | null => {
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

const areRectLikesEqual = (a: RectLike | null, b: RectLike | null): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;

  return (
    isRectNumberEqual(a.top, b.top) &&
    isRectNumberEqual(a.left, b.left) &&
    isRectNumberEqual(a.width, b.width) &&
    isRectNumberEqual(a.height, b.height)
  );
};

const areHighlightRectsEqual = (
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

const addHighlightElement = (
  elements: Set<HTMLElement>,
  element: HTMLElement | null | undefined,
) => {
  if (!(element instanceof HTMLElement)) return;
  elements.add(resolveHighlightElement(element));
};

const collectHighlightElements = ({
  cardTargetIds,
  ringTargetIds,
  ringVirtualTargets,
  spotlightTargetIds,
  spotlightVirtualTargets,
}: HighlightTargets): HTMLElement[] => {
  if (typeof document === "undefined") return [];

  const elements = new Set<HTMLElement>();
  const targetIds = [
    ...(Array.isArray(ringTargetIds) ? ringTargetIds : []),
    ...(Array.isArray(spotlightTargetIds) ? spotlightTargetIds : []),
    ...(Array.isArray(cardTargetIds) ? cardTargetIds : []),
  ];

  targetIds.forEach((id) => {
    if (!id) return;
    addHighlightElement(elements, document.getElementById(id));
  });

  for (const target of spotlightVirtualTargets ?? []) {
    addHighlightElement(elements, getAnalysisVirtualSpotlightElement(target));
  }

  if (Array.isArray(ringVirtualTargets) && ringVirtualTargets.length > 0) {
    addHighlightElement(
      elements,
      document.getElementById("device-analysis-preview-scroll-area"),
    );
    addHighlightElement(
      elements,
      document.getElementById("device-analysis-preview-column-selector-row"),
    );
  }

  for (const target of ringVirtualTargets ?? []) {
    if (target.kind !== "preview-cell") continue;

    addHighlightElement(elements, document.getElementById(target.anchorId));
    addHighlightElement(
      elements,
      document.querySelector<HTMLElement>(
        `#device-analysis-preview-scroll-area td[data-row="${target.rowIndex}"][data-col="${target.colIndex}"]`,
      ),
    );
    addHighlightElement(
      elements,
      document.querySelector<HTMLElement>(
        `#device-analysis-preview-column-selector-row [data-column-index="${target.colIndex}"]`,
      ),
    );
  }

  return Array.from(elements);
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

const getInteractionBlockerRects = (
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

const getRingTargetIds = (step: OnboardingStep | null): string[] | undefined => {
  if (!step) return undefined;
  if (Array.isArray(step.ringTargetIds) && step.ringTargetIds.length > 0) {
    return step.ringTargetIds;
  }
  if (step.highlightMode === "ring") {
    return step.targetIds;
  }
  return undefined;
};

const getResolvedRingTargetIds = (
  step: OnboardingStep | null,
  isRingActivated: boolean,
): string[] | undefined => {
  if (!step) return undefined;

  if (isRingActivated) {
    if (
      Array.isArray(step.activatedRingTargetIds) &&
      step.activatedRingTargetIds.length > 0
    ) {
      return step.activatedRingTargetIds;
    }

    return undefined;
  }

  return getRingTargetIds(step);
};

const getResolvedRingVirtualTargets = (
  step: OnboardingStep | null,
  isRingActivated: boolean,
): OnboardingVirtualRingTarget[] | undefined => {
  if (!step) return undefined;

  if (isRingActivated) {
    if (
      Array.isArray(step.activatedRingVirtualTargets) &&
      step.activatedRingVirtualTargets.length > 0
    ) {
      return step.activatedRingVirtualTargets;
    }

    return undefined;
  }

  if (Array.isArray(step.ringVirtualTargets) && step.ringVirtualTargets.length > 0) {
    return step.ringVirtualTargets;
  }

  return undefined;
};

const getSpotlightTargetIds = (
  step: OnboardingStep | null,
): string[] | undefined => {
  if (!step) return undefined;
  if (
    Array.isArray(step.spotlightTargetIds) &&
    step.spotlightTargetIds.length > 0
  ) {
    return step.spotlightTargetIds;
  }
  if (step.highlightMode === "spotlight") {
    return step.targetIds;
  }
  return undefined;
};

const computeCardPosition = (
  rect: RectLike | null,
  placement: OnboardingStep["placement"],
  cardSize: CardSize,
  offsetX = 0,
  offsetY = 0,
): CSSProperties => {
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

const computeAnchoredCardPosition = (
  rect: RectLike,
  anchor: OnboardingCardAnchor,
  cardSize: CardSize,
  offsetX = 0,
  offsetY = 0,
): CSSProperties => {
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
    if (anchor === "bottom-left" || anchor === "bottom-center" || anchor === "bottom-right") {
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

const DeviceAnalysisOnboarding = ({
  isOpen,
  stepIndex,
  steps,
  t,
  canNext = true,
  onBack,
  onClose,
  onNext,
}: DeviceAnalysisOnboardingProps) => {
  const step = steps[stepIndex] ?? null;
  const cardRef = useRef<HTMLDivElement | null>(null);
  const maskId = useId();
  const [cardSize, setCardSize] = useState<CardSize>({
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  });
  const [ringRects, setRingRects] = useState<HighlightRect[]>([]);
  const [spotlightRects, setSpotlightRects] = useState<HighlightRect[]>([]);
  const [cardTargetRect, setCardTargetRect] = useState<RectLike | null>(null);
  const [isRingActivated, setIsRingActivated] = useState(false);

  useEffect(() => {
    setIsRingActivated(false);
  }, [isOpen, step?.id]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const element = cardRef.current;
    if (!element) return undefined;

    const updateCardSize = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setCardSize({
        width: rect.width,
        height: rect.height,
      });
    };

    updateCardSize();

    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => updateCardSize());
    observer.observe(element);
    return () => observer.disconnect();
  }, [isOpen, stepIndex]);

  useEffect(() => {
    if (!isOpen || !step || typeof document === "undefined") return undefined;
    const activationTargetIds = step.ringActivationTargetIds;
    if (!Array.isArray(activationTargetIds) || activationTargetIds.length === 0) {
      return undefined;
    }

    const handleClick = (event: MouseEvent) => {
      const eventTarget = event.target;
      if (!(eventTarget instanceof Node)) {
        return;
      }

      const shouldActivate = activationTargetIds.some((id) => {
        const rawElement = document.getElementById(id);
        if (!(rawElement instanceof HTMLElement)) {
          return false;
        }

        const resolvedElement = resolveHighlightElement(rawElement);
        return (
          rawElement === eventTarget ||
          resolvedElement === eventTarget ||
          rawElement.contains(eventTarget) ||
          resolvedElement.contains(eventTarget)
        );
      });

      if (shouldActivate) {
        setIsRingActivated(true);
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, [isOpen, step]);

  useEffect(() => {
    if (!isOpen || !step || typeof window === "undefined") return undefined;

    const ringTargetIds = getResolvedRingTargetIds(step, isRingActivated);
    const ringVirtualTargets = getResolvedRingVirtualTargets(step, isRingActivated);
    const spotlightTargetIds = getSpotlightTargetIds(step);
    const spotlightVirtualTargets = step.spotlightVirtualTargets;
    const cardTargetIds = step.cardTargetIds;
    const ringPadding = step.ringPadding ?? RING_PADDING;
    const spotlightPadding = step.spotlightPadding ?? SPOTLIGHT_PADDING;
    const cardTargetPadding = step.cardTargetPadding ?? 0;

    const updateRect = () => {
      const nextRingRects = [
        ...getTargetRects(ringTargetIds, ringPadding),
        ...getVirtualRingTargetRects(ringVirtualTargets, ringPadding),
      ];
      const nextSpotlightRects = getTargetRects(
        spotlightTargetIds,
        spotlightPadding,
      ).concat(
        getVirtualSpotlightTargetRects(spotlightVirtualTargets, spotlightPadding),
      );
      const nextCardTargetRects = getTargetRects(cardTargetIds, cardTargetPadding);

      setRingRects((currentRects) =>
        areHighlightRectsEqual(currentRects, nextRingRects)
          ? currentRects
          : nextRingRects,
      );
      setSpotlightRects((currentRects) =>
        areHighlightRectsEqual(currentRects, nextSpotlightRects)
          ? currentRects
          : nextSpotlightRects,
      );
      setCardTargetRect((currentRect) => {
        const nextCardTargetRect = getBoundingRect(nextCardTargetRects);
        return areRectLikesEqual(currentRect, nextCardTargetRect)
          ? currentRect
          : nextCardTargetRect;
      });
    };

    let frameId: number | null = null;
    let needsObserverRefresh = false;
    const scheduleRectUpdate = () => {
      if (frameId != null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        if (needsObserverRefresh) {
          observeHighlightElements();
          needsObserverRefresh = false;
        }
        updateRect();
      });
    };

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            scheduleRectUpdate();
          });
    const observeHighlightElements = () => {
      if (!resizeObserver) return;
      resizeObserver.disconnect();
      collectHighlightElements({
        cardTargetIds,
        ringTargetIds,
        ringVirtualTargets,
        spotlightTargetIds,
        spotlightVirtualTargets,
      }).forEach((element) => {
        resizeObserver.observe(element);
      });
    };

    observeHighlightElements();
    updateRect();

    const handleWindowChange = () => scheduleRectUpdate();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    const mutationObserver =
      typeof MutationObserver === "undefined" || !document.body
        ? null
        : new MutationObserver(() => {
            needsObserverRefresh = true;
            scheduleRectUpdate();
          });

    mutationObserver?.observe(document.body, {
      attributeFilter: [
        "class",
        "style",
        "hidden",
        "aria-hidden",
        "data-row",
        "data-col",
        "data-column-index",
      ],
      attributes: true,
      childList: true,
      subtree: true,
    });
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      if (frameId != null) {
        window.cancelAnimationFrame(frameId);
      }
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isRingActivated, onClose, step]);

  const spotlightBounds = useMemo(
    () => getBoundingRect(spotlightRects),
    [spotlightRects],
  );
  const progressStepIds = useMemo(() => {
    const next: string[] = [];

    for (const entry of steps) {
      const progressId = entry.progressGroupId ?? entry.id;
      if (!next.includes(progressId)) {
        next.push(progressId);
      }
    }

    return next;
  }, [steps]);

  const anchorRect = useMemo(
    () => ringRects[0] ?? spotlightBounds ?? null,
    [ringRects, spotlightBounds],
  );

  const cardStyle = useMemo(() => {
    if (!isOpen || !step || typeof window === "undefined") return undefined;
    if (cardTargetRect && step.cardAnchor) {
      return computeAnchoredCardPosition(
        cardTargetRect,
        step.cardAnchor,
        cardSize,
        step.cardOffsetX ?? 0,
        step.cardOffsetY ?? 0,
      );
    }

    return computeCardPosition(
      anchorRect,
      step.placement ?? "bottom",
      cardSize,
      step.cardOffsetX ?? 0,
      step.cardOffsetY ?? 0,
    );
  }, [anchorRect, cardSize, cardTargetRect, isOpen, step]);

  if (!isOpen || !step) return null;

  const totalSteps = steps.length;
  const isLastStep = stepIndex >= totalSteps - 1;
  const currentProgressStepId = step.progressGroupId ?? step.id;
  const resolvedProgressStepIndex = progressStepIds.indexOf(currentProgressStepId);
  const progressStepIndex =
    resolvedProgressStepIndex >= 0 ? resolvedProgressStepIndex : stepIndex;
  const totalProgressSteps = progressStepIds.length || totalSteps;
  const viewportWidth =
    typeof window === "undefined" ? 0 : Math.max(0, window.innerWidth);
  const viewportHeight =
    typeof window === "undefined" ? 0 : Math.max(0, window.innerHeight);
  const backdropOpacity = clamp(step.backdropOpacity ?? 0.58, 0, 0.9);
  const backdropFill = `rgba(0,0,0,${backdropOpacity})`;
  const shouldUseFullBackdrop =
    step.backdropMode === "full" || spotlightRects.length === 0;
  const interactionBlockerRects = getInteractionBlockerRects(
    viewportWidth,
    viewportHeight,
    ringRects,
  );

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[120] text-text-primary"
      aria-live="polite"
    >
      {!shouldUseFullBackdrop ? (
        <>
          <svg
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
            viewBox={`0 0 ${viewportWidth} ${viewportHeight}`}
            preserveAspectRatio="none"
          >
            <defs>
              <mask
                id={maskId}
                x="0"
                y="0"
                width={viewportWidth}
                height={viewportHeight}
                maskUnits="userSpaceOnUse"
                maskContentUnits="userSpaceOnUse"
              >
                <rect
                  x="0"
                  y="0"
                  width={viewportWidth}
                  height={viewportHeight}
                  fill="white"
                />
                {spotlightRects.map((rect, index) => (
                  <rect
                    key={`${step.id}-mask-${index}`}
                    x={rect.left}
                    y={rect.top}
                    width={rect.width}
                    height={rect.height}
                    rx={rect.radius}
                    ry={rect.radius}
                    fill="black"
                  />
                ))}
              </mask>
            </defs>

            <rect
              x="0"
              y="0"
              width={viewportWidth}
              height={viewportHeight}
              fill={backdropFill}
              mask={`url(#${maskId})`}
            />
          </svg>

          {spotlightRects.map((rect, index) => (
            <div
              key={`${step.id}-spotlight-${index}`}
              className="absolute border border-white/18 bg-white/[0.02] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
              style={{
                ...rect,
                borderRadius: `${rect.radius}px`,
              }}
            />
          ))}
        </>
      ) : (
        <div className="absolute inset-0" style={{ background: backdropFill }} />
      )}

      {interactionBlockerRects.map((rect, index) => (
        <div
          key={`${step.id}-interaction-blocker-${index}`}
          aria-hidden="true"
          className="pointer-events-auto absolute"
          style={rect}
        />
      ))}

      {ringRects.map((rect, index) => (
        <div
          key={`${step.id}-ring-${index}`}
          className="device-analysis-onboarding-ring absolute border-2 border-accent-terracotta"
          style={{
            ...rect,
            borderRadius: `${rect.radius}px`,
            background: "rgba(255,255,255,0.03)",
          }}
        />
      ))}

      <div
        ref={cardRef}
        className="pointer-events-auto fixed flex flex-col overflow-hidden rounded-[24px] border border-border bg-bg-surface p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]"
        style={{
          ...cardStyle,
          height: CARD_HEIGHT,
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="device-analysis-onboarding-title"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-text-secondary">
            {t("da_onboarding_progress", {
              current: progressStepIndex + 1,
              total: totalProgressSteps,
            })}
          </div>
          <button
            type="button"
            className="rounded-full px-2 py-1 text-sm text-text-secondary transition hover:bg-bg-page hover:text-text-primary"
            onClick={onClose}
          >
            {t("da_onboarding_skip")}
          </button>
        </div>

        <h3
          id="device-analysis-onboarding-title"
          className="text-lg font-semibold text-text-primary"
        >
          {t(step.titleKey)}
        </h3>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
          <p className="text-sm leading-6 text-text-secondary">{t(step.bodyKey)}</p>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              disabled={stepIndex === 0}
            >
              {t("da_onboarding_back")}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {progressStepIds.map((progressId, index) => (
              <span
                key={progressId}
                className={`h-2 rounded-full transition-all ${
                  index === progressStepIndex
                    ? "w-6 bg-[#222222]"
                    : "w-2 bg-border"
                }`}
                aria-hidden="true"
              />
            ))}
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={onNext}
            disabled={!canNext}
          >
            {isLastStep ? t("da_onboarding_finish") : t("da_onboarding_next")}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DeviceAnalysisOnboarding;
