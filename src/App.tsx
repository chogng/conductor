import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./context/theme-provider";
import { LanguageProvider } from "./context/language-provider";
import { loadDeviceAnalysisApp } from "./workbench-loader";

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

const getBootNowMs = () => {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
};

const formatWaitSince = (startedAtMs: number, label = "wait") => {
  const elapsedMs = Math.max(0, Math.round(getBootNowMs() - startedAtMs));
  return `(${label}=${elapsedMs}ms)`;
};

const deviceAnalysisLazyRequestedAtMs = isBootProfileEnabled() ? getBootNowMs() : 0;
const DeviceAnalysisApp = lazy(async () => {
  if (isBootProfileEnabled()) {
    logRendererBoot(
      "device-analysis:lazy-awaiting",
      formatWaitSince(deviceAnalysisLazyRequestedAtMs, "sinceAppModule"),
    );
  }
  const module = await loadDeviceAnalysisApp();
  if (isBootProfileEnabled()) {
    logRendererBoot(
      "device-analysis:lazy-ready",
      formatWaitSince(deviceAnalysisLazyRequestedAtMs, "sinceAppModule"),
    );
  }
  return { default: module.default };
});

const isUnauthorizedError = (error: unknown) => {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return false;
  }

  return (error as { status?: unknown }).status === 401;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (isUnauthorizedError(error)) return false;
        return failureCount < 2;
      },
    },
  },
});

function App() {
  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      markBootUiReady("app-shell");
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <div className="h-screen bg-bg-page overflow-hidden">
            <main className="h-full w-full overflow-hidden">
              <Suspense fallback={null}>
                <DeviceAnalysisApp />
              </Suspense>
            </main>
          </div>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;

