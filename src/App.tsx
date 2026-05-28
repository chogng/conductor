import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { workbenchThemeService } from "src/cs/workbench/services/themes/browser/themeService";
import AnalysisApp from "./cs/workbench/contrib/workspace/App";

workbenchThemeService.start();

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
      <div className="h-screen bg-bg-page overflow-hidden">
        <main className="h-full w-full overflow-hidden">
          <AnalysisApp />
        </main>
      </div>
    </QueryClientProvider>
  );
}

export default App;
