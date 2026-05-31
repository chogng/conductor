import { hideWorkbenchSplash } from "src/cs/workbench/contrib/splash/browser/partsSplash";

const ANALYSIS_SCRIPT_PATH_SEGMENT = "/cs/workbench/contrib/deviceanalysis/";

export const isBootProfileEnabled = () =>
  import.meta.env.DEV && window.__CONDUCTOR_BOOT_PROFILE_ENABLED__ === true;

export const logRendererBoot = (stage: string, extra = "") => {
  if (!isBootProfileEnabled()) {
    return;
  }

  window.__CONDUCTOR_BOOT_LOG__?.(stage, extra);
};

export const markBootUiReady = (source: string) => {
  hideWorkbenchSplash();
  window.__CONDUCTOR_BOOT_MARK_UI_READY__?.(source);
};

export const logSlowScriptResources = () => {
  if (
    !isBootProfileEnabled() ||
    typeof performance === "undefined" ||
    typeof performance.getEntriesByType !== "function"
  ) {
    return;
  }

  const entries = (performance.getEntriesByType(
    "resource",
  ) as PerformanceResourceTiming[])
    .filter((entry) => {
      if (!entry || typeof entry.duration !== "number") {
        return false;
      }

      if (entry.initiatorType !== "script") {
        return false;
      }

      const normalizedPath = String(entry.name ?? "").replace(
        /^https?:\/\/[^/]+/i,
        "",
      );
      return (
        normalizedPath.includes(ANALYSIS_SCRIPT_PATH_SEGMENT) &&
        entry.duration >= 8
      );
    })
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 12);

  for (const entry of entries) {
    const normalizedPath = String(entry.name ?? "").replace(
      /^https?:\/\/[^/]+/i,
      "",
    );
    const durationMs = Math.round(entry.duration);
    logRendererBoot(
      "analysis:script-resource",
      `(dur=${durationMs}ms path=${normalizedPath})`,
    );
  }
};
