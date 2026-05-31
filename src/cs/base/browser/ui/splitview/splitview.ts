import { cx } from "src/utils/cx";

import "src/cs/base/browser/ui/splitview/splitview.css";

export type SplitViewOrientation = "horizontal" | "vertical";

export type SplitViewPaneLayout = {
  readonly defaultSize?: number;
  readonly maxSize?: number;
  readonly minSize?: number;
  readonly size?: number;
};

export type SplitViewResizeEvent = {
  readonly sizes: readonly number[];
  readonly paneIndex: number;
};

export const DEFAULT_PANE_MIN_SIZE = 0;
export const SPLIT_VIEW_SASH_SIZE = 10;

export const getSplitViewClassName = (className = ""): string =>
  cx("ui-split-view", className);

export const getSplitViewPaneClassName = (className = ""): string =>
  cx("ui-split-view__pane", className);

export const getPaneMinSize = (pane: SplitViewPaneLayout): number =>
  Math.max(0, pane.minSize ?? DEFAULT_PANE_MIN_SIZE);

export const getPaneMaxSize = (pane: SplitViewPaneLayout): number =>
  Math.max(getPaneMinSize(pane), pane.maxSize ?? Number.POSITIVE_INFINITY);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export const normalizeSplitViewSizes = (
  panes: readonly SplitViewPaneLayout[],
  previousSizes: readonly number[],
  availableSize: number,
): number[] => {
  if (!panes.length) {
    return [];
  }

  const fallbackSize = availableSize > 0 ? availableSize / panes.length : 0;
  const sizes = panes.map((pane, index) =>
    clamp(
      pane.size ?? previousSizes[index] ?? pane.defaultSize ?? fallbackSize,
      getPaneMinSize(pane),
      getPaneMaxSize(pane),
    ),
  );

  let delta = availableSize - sizes.reduce((sum, size) => sum + size, 0);
  if (Math.abs(delta) < 0.5) {
    return sizes;
  }

  const direction = delta > 0 ? 1 : -1;
  for (let pass = 0; pass < panes.length && Math.abs(delta) >= 0.5; pass += 1) {
    for (let index = panes.length - 1; index >= 0 && Math.abs(delta) >= 0.5; index -= 1) {
      const pane = panes[index];
      const limit = direction > 0
        ? getPaneMaxSize(pane) - sizes[index]
        : sizes[index] - getPaneMinSize(pane);
      const change = direction * Math.min(Math.abs(delta), Math.max(0, limit));

      sizes[index] += change;
      delta -= change;
    }
  }

  return sizes;
};

export const resizeAdjacentSplitViewPanes = (
  panes: readonly SplitViewPaneLayout[],
  sizes: readonly number[],
  paneIndex: number,
  delta: number,
): number[] => {
  const nextSizes = [...sizes];
  const firstPane = panes[paneIndex];
  const secondPane = panes[paneIndex + 1];

  if (!firstPane || !secondPane) {
    return nextSizes;
  }

  const firstStart = nextSizes[paneIndex] ?? 0;
  const secondStart = nextSizes[paneIndex + 1] ?? 0;
  const firstTarget = clamp(
    firstStart + delta,
    getPaneMinSize(firstPane),
    getPaneMaxSize(firstPane),
  );
  const firstDelta = firstTarget - firstStart;
  const secondTarget = clamp(
    secondStart - firstDelta,
    getPaneMinSize(secondPane),
    getPaneMaxSize(secondPane),
  );
  const appliedDelta = secondStart - secondTarget;

  nextSizes[paneIndex] = clamp(
    firstStart + appliedDelta,
    getPaneMinSize(firstPane),
    getPaneMaxSize(firstPane),
  );
  nextSizes[paneIndex + 1] = secondTarget;

  return nextSizes;
};

export const areSplitViewSizesEqual = (
  left: readonly number[],
  right: readonly number[],
): boolean =>
  left.length === right.length &&
  left.every((value, index) => Math.abs(value - right[index]) < 0.5);
