import { useEffect, useState, type RefObject } from "react";

export type ChartCanvasTheme = {
  axisLabel: string;
  border: string;
  grid: string;
  hoverGuide: string;
  interactionHoverBand: string;
  interactionOutline: string;
  majorTick: string;
  markerOutline: string;
  minorTick: string;
  overlayBadgeBackground: string;
  overlayBadgeShadow: string;
  overlayBadgeText: string;
  overlayHandleBackground: string;
  plotBorder: string;
  textPrimary: string;
  textSecondary: string;
  tooltipBackground: string;
  tooltipBorder: string;
  tooltipMuted: string;
};

const buildFallbackTheme = (isDark: boolean): ChartCanvasTheme => ({
  axisLabel: isDark ? "rgba(244,244,245,0.96)" : "#000000",
  border: isDark ? "rgba(255,255,255,0.18)" : "rgba(15,23,42,0.18)",
  grid: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.14)",
  hoverGuide: isDark ? "rgba(255,255,255,0.22)" : "rgba(17,24,39,0.25)",
  interactionHoverBand: isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.08)",
  interactionOutline: isDark ? "rgba(255,255,255,0.16)" : "rgba(15,23,42,0.14)",
  majorTick: isDark ? "rgba(255,255,255,0.72)" : "#000000",
  markerOutline: isDark ? "rgba(9,9,11,0.92)" : "#ffffff",
  minorTick: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.8)",
  overlayBadgeBackground: isDark ? "rgba(24,24,27,0.92)" : "rgba(255,255,255,0.92)",
  overlayBadgeShadow: isDark ? "0 2px 8px rgba(0,0,0,0.35)" : "0 2px 8px rgba(15,23,42,0.12)",
  overlayBadgeText: isDark ? "rgba(244,244,245,0.96)" : "rgba(15,23,42,0.96)",
  overlayHandleBackground: isDark ? "rgba(24,24,27,0.94)" : "rgba(255,255,255,0.94)",
  plotBorder: isDark ? "rgba(255,255,255,0.32)" : "#000000",
  textPrimary: isDark ? "rgba(244,244,245,0.96)" : "rgba(15,23,42,0.96)",
  textSecondary: isDark ? "rgba(212,212,216,0.82)" : "rgba(15,23,42,0.72)",
  tooltipBackground: isDark ? "rgba(24,24,27,0.96)" : "rgba(255,255,255,0.96)",
  tooltipBorder: isDark ? "rgba(255,255,255,0.14)" : "rgba(15,23,42,0.14)",
  tooltipMuted: isDark ? "rgba(212,212,216,0.9)" : "rgba(71,85,105,0.92)",
});

export const resolveCanvasChartTheme = (
  target: Element | null,
): ChartCanvasTheme => {
  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");
  const fallback = buildFallbackTheme(isDark);
  if (!target || typeof window === "undefined") {
    return fallback;
  }

  const computed = window.getComputedStyle(target);
  const textPrimary =
    computed.getPropertyValue("--color-text-primary")?.trim() ||
    fallback.textPrimary;
  const textSecondary =
    computed.getPropertyValue("--color-text-secondary")?.trim() ||
    fallback.textSecondary;
  const border =
    computed.getPropertyValue("--color-border")?.trim() || fallback.border;

  return {
    ...fallback,
    axisLabel: textPrimary,
    border,
    plotBorder: border,
    textPrimary,
    textSecondary,
    tooltipMuted: textSecondary,
  };
};

export const useCanvasChartTheme = (
  targetRef: RefObject<Element | null>,
): ChartCanvasTheme => {
  const [theme, setTheme] = useState<ChartCanvasTheme>(() =>
    resolveCanvasChartTheme(targetRef.current),
  );

  useEffect(() => {
    const syncTheme = () => {
      setTheme((prev) => {
        const next = resolveCanvasChartTheme(targetRef.current);
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      });
    };

    syncTheme();
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, {
      attributeFilter: ["class", "data-theme"],
      attributes: true,
    });

    return () => observer.disconnect();
  }, [targetRef]);

  return theme;
};
