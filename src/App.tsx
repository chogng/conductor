import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./context/theme-provider";
import { LanguageProvider } from "./context/language-provider";
import DeviceAnalysisApp from "./features/device-analysis/DeviceAnalysisApp";

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
          <div className="h-screen bg-bg-page overflow-hidden">
            <main className="h-full w-full overflow-hidden">
              <DeviceAnalysisApp />
            </main>
          </div>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;

