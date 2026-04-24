import { useEffect } from "react";
import DeviceAnalysisPage from "./DeviceAnalysisPage";
import { DeviceAnalysisSessionProvider } from "./session/DeviceAnalysisSessionProvider";

const isBootProfileEnabled = () =>
  import.meta.env.DEV && window.__CONDUCTOR_BOOT_PROFILE_ENABLED__ === true;

const logRendererBoot = (stage: string, extra = "") => {
  if (!isBootProfileEnabled()) {
    return;
  }

  window.__CONDUCTOR_BOOT_LOG__?.(stage, extra);
};

const markBootUiReady = (source: string) => {
  window.__CONDUCTOR_BOOT_MARK_UI_READY__?.(source);
};

const logSlowScriptResources = () => {
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
      return normalizedPath.includes("/features/device-analysis/") && entry.duration >= 8;
    })
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 12);

  for (const entry of entries) {
    const normalizedPath = String(entry.name ?? "").replace(
      /^https?:\/\/[^/]+/i,
      "",
    );
    const durationMs = Math.round(entry.duration);
    logRendererBoot("device-analysis:script-resource", `(dur=${durationMs}ms path=${normalizedPath})`);
  }
};

const DeviceAnalysisApp = () => {
  useEffect(() => {
    if (isBootProfileEnabled()) {
      logRendererBoot("DeviceAnalysisApp:mounted");
      logSlowScriptResources();
    }

    const frameId = window.requestAnimationFrame(() => {
      markBootUiReady("device-analysis-app");
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <DeviceAnalysisSessionProvider>
      <DeviceAnalysisPage />
    </DeviceAnalysisSessionProvider>
  );
};

export default DeviceAnalysisApp;
