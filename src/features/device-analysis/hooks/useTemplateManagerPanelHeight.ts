import { useLayoutEffect, useRef, useState } from "react";

export const useTemplateManagerPanelHeight = () => {
  const leftPanelRef = useRef<HTMLDivElement | null>(null);
  const basePanelRef = useRef<HTMLDivElement | null>(null);
  const selectPanelMeasureRef = useRef<HTMLDivElement | null>(null);
  const savePanelMeasureRef = useRef<HTMLDivElement | null>(null);
  const [panelMinHeightPx, setPanelMinHeightPx] = useState<number | null>(null);
  const minHeightRafRef = useRef(0);

  useLayoutEffect(() => {
    const panelEl = leftPanelRef.current;
    const baseEl = basePanelRef.current;
    const selectEl = selectPanelMeasureRef.current;
    const saveEl = savePanelMeasureRef.current;
    if (!panelEl || !baseEl || !selectEl || !saveEl) return undefined;

    const SAVE_PANEL_GAP_PX = 16;

    const measureNow = () => {
      const panelStyles = window.getComputedStyle(panelEl);
      const panelPaddingY =
        (Number.parseFloat(panelStyles.paddingTop) || 0) +
        (Number.parseFloat(panelStyles.paddingBottom) || 0);
      const baseHeight = baseEl.getBoundingClientRect().height;
      const selectHeight = selectEl.getBoundingClientRect().height;
      const saveHeight = saveEl.getBoundingClientRect().height;
      const paneHeight = Math.max(selectHeight, saveHeight);
      const next = Math.max(
        0,
        Math.ceil(
        panelPaddingY + baseHeight + SAVE_PANEL_GAP_PX + paneHeight,
      ));

      setPanelMinHeightPx((prev) => (prev === next ? prev : next));
    };

    const scheduleMeasure = () => {
      if (minHeightRafRef.current) return;
      minHeightRafRef.current = window.requestAnimationFrame(() => {
        minHeightRafRef.current = 0;
        measureNow();
      });
    };

    scheduleMeasure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", scheduleMeasure);
      return () => {
        window.removeEventListener("resize", scheduleMeasure);
        if (minHeightRafRef.current) {
          window.cancelAnimationFrame(minHeightRafRef.current);
          minHeightRafRef.current = 0;
        }
      };
    }

    const resizeObserver = new ResizeObserver(() => scheduleMeasure());
    resizeObserver.observe(panelEl);
    resizeObserver.observe(baseEl);
    resizeObserver.observe(selectEl);
    resizeObserver.observe(saveEl);

    return () => {
      resizeObserver.disconnect();
      if (minHeightRafRef.current) {
        window.cancelAnimationFrame(minHeightRafRef.current);
        minHeightRafRef.current = 0;
      }
    };
  }, []);

  return {
    basePanelRef,
    leftPanelRef,
    panelMinHeightPx,
    savePanelMeasureRef,
    selectPanelMeasureRef,
  };
};
