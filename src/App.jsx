import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./context/ThemeContext";
import { LanguageProvider } from "./context/LanguageContext";
import { UiPrefsProvider } from "./context/UiPrefsContext";
import {
  DeviceAnalysisPage,
  DeviceAnalysisSessionProvider,
} from "./features/device-analysis";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error?.status === 401) return false;
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
                <DeviceAnalysisSessionProvider>
                  <DeviceAnalysisPage />
                </DeviceAnalysisSessionProvider>
              </main>
            </div>
          </UiPrefsProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
