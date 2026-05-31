const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const PREVIEW_ZOOM_DEFAULT_PERCENT = 100;
export const PREVIEW_ZOOM_MIN_PERCENT = 50;
export const PREVIEW_ZOOM_MAX_PERCENT = 200;
export const PREVIEW_ZOOM_STEP_PERCENT = 10;

export const clampPreviewZoomPercent = (value: number): number => {
  const normalized = Number.isFinite(value)
    ? Math.round(value)
    : PREVIEW_ZOOM_DEFAULT_PERCENT;
  return clampNumber(
    normalized,
    PREVIEW_ZOOM_MIN_PERCENT,
    PREVIEW_ZOOM_MAX_PERCENT,
  );
};

export const offsetPreviewZoomPercent = (
  currentPercent: number,
  deltaSteps: number,
): number =>
  clampPreviewZoomPercent(
    clampPreviewZoomPercent(currentPercent) +
      deltaSteps * PREVIEW_ZOOM_STEP_PERCENT,
  );

export const scalePreviewMeasurement = (
  basePx: number,
  zoomPercent: number,
  options: { minPx?: number; maxPx?: number } = {},
): number => {
  const scale = clampPreviewZoomPercent(zoomPercent) / 100;
  const minPx = options.minPx ?? 1;
  const maxPx = options.maxPx ?? Number.POSITIVE_INFINITY;
  return clampNumber(Math.round(basePx * scale), minPx, maxPx);
};

export const toBasePreviewMeasurement = (
  scaledPx: number,
  zoomPercent: number,
  options: { minPx?: number; maxPx?: number } = {},
): number => {
  const scale = clampPreviewZoomPercent(zoomPercent) / 100;
  const minPx = options.minPx ?? 1;
  const maxPx = options.maxPx ?? Number.POSITIVE_INFINITY;
  return clampNumber(Math.round(scaledPx / Math.max(scale, 0.01)), minPx, maxPx);
};
