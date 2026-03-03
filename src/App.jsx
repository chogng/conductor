import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { LanguageProvider } from "./context/LanguageContext";
import { UiPrefsProvider } from "./context/UiPrefsContext";
import { DeviceAnalysisSessionProvider } from "./context/DeviceAnalysisSessionContext";
import DeviceAnalysis from "./pages/DeviceAnalysis";

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
      <AuthProvider>
        <ThemeProvider>
          <LanguageProvider>
            <UiPrefsProvider>
              <div className="h-screen bg-bg-page overflow-hidden">
                <main className="h-full w-full px-4 py-6 md:px-6 lg:px-8 overflow-hidden">
                  <DeviceAnalysisSessionProvider>
                    <DeviceAnalysis />
                  </DeviceAnalysisSessionProvider>
                </main>
              </div>
            </UiPrefsProvider>
          </LanguageProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
