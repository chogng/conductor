import type {
  OnboardingStep,
  OnboardingVirtualRingTarget,
  OnboardingVirtualSpotlightTarget,
} from "src/cs/workbench/contrib/onboarding/onboardingTypes";
import {
  clamp,
  getShadowOutsets,
  type HighlightRect,
} from "src/cs/workbench/contrib/onboarding/onboardingGeometry";

type HighlightTargets = {
  cardTargetIds?: string[];
  ringTargetIds?: string[];
  ringVirtualTargets?: OnboardingVirtualRingTarget[];
  spotlightTargetIds?: string[];
  spotlightVirtualTargets?: OnboardingVirtualSpotlightTarget[];
};

const ONBOARDING_PREVIEW_ROW_HEIGHT_PX = 28;

const parseRadiusValue = (value: string): number => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

const getElementVisualOutsets = (element: HTMLElement) => {
  const styles = window.getComputedStyle(element);
  const shadowOutsets = getShadowOutsets(styles.boxShadow);

  return {
    top: shadowOutsets.top,
    right: shadowOutsets.right,
    bottom: shadowOutsets.bottom,
    left: shadowOutsets.left,
  };
};

export const resolveHighlightElement = (element: HTMLElement): HTMLElement => {
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

export const getTargetRects = (
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

export const getVirtualRingTargetRects = (
  targets: OnboardingVirtualRingTarget[] | undefined,
  padding: number,
): HighlightRect[] => {
  if (!Array.isArray(targets) || targets.length === 0) return [];

  const rects: HighlightRect[] = [];

  for (const target of targets) {
    if (target.kind !== "preview-cell") continue;

    const previewCell = document.querySelector<HTMLElement>(
      `#analysis-preview-scroll-area td[data-row="${target.rowIndex}"][data-col="${target.colIndex}"]`,
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
      `#analysis-preview-column-selector-row [data-column-index="${target.colIndex}"]`,
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
    return document.getElementById("analysis-overview-sidebar");
  }

  if (target.kind === "analysis-chart-section") {
    return document.querySelector<HTMLElement>(
      '#analysis-tabpanel-analysis section[aria-label="Device Analysis chart"]',
    );
  }

  if (target.kind === "analysis-calculated-section") {
    return document.getElementById("analysis-calculated-parameters-card");
  }

  return null;
};

export const getVirtualSpotlightTargetRects = (
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

const addHighlightElement = (
  elements: Set<HTMLElement>,
  element: HTMLElement | null | undefined,
) => {
  if (!(element instanceof HTMLElement)) return;
  elements.add(resolveHighlightElement(element));
};

export const collectHighlightElements = ({
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
      document.getElementById("analysis-preview-scroll-area"),
    );
    addHighlightElement(
      elements,
      document.getElementById("analysis-preview-column-selector-row"),
    );
  }

  for (const target of ringVirtualTargets ?? []) {
    if (target.kind !== "preview-cell") continue;

    addHighlightElement(elements, document.getElementById(target.anchorId));
    addHighlightElement(
      elements,
      document.querySelector<HTMLElement>(
        `#analysis-preview-scroll-area td[data-row="${target.rowIndex}"][data-col="${target.colIndex}"]`,
      ),
    );
    addHighlightElement(
      elements,
      document.querySelector<HTMLElement>(
        `#analysis-preview-column-selector-row [data-column-index="${target.colIndex}"]`,
      ),
    );
  }

  return Array.from(elements);
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

export const getResolvedRingTargetIds = (
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

export const getResolvedRingVirtualTargets = (
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

export const getSpotlightTargetIds = (
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
