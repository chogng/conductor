import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./context/ThemeContext";
import { LanguageProvider } from "./context/LanguageContext";
import { UiPrefsProvider } from "./context/UiPrefsContext";

const DeviceAnalysisApp = lazy(
  () => import("./features/device-analysis/DeviceAnalysisApp"),
);

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
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <UiPrefsProvider>
            <div className="h-screen bg-bg-page overflow-hidden">
              <main className="h-full w-full overflow-hidden">
                <Suspense
                  fallback={
                    <div className="flex h-full w-full items-center justify-center bg-bg-page text-text-secondary">
                      <div className="flex flex-col items-center gap-3">
                        <div className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-primary" />
                        <p className="text-sm">Loading Device Analysis Studio…</p>
                      </div>
                    </div>
                  }
                >
                  <DeviceAnalysisApp />
                </Suspense>
              </main>
            </div>
          </UiPrefsProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
