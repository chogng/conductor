import { DeviceAnalysisSessionProvider } from "./context/DeviceAnalysisSessionContext";
import DeviceAnalysisPage from "./pages/DeviceAnalysisPage";

const DeviceAnalysisApp = () => {
  return (
    <DeviceAnalysisSessionProvider>
      <DeviceAnalysisPage />
    </DeviceAnalysisSessionProvider>
  );
};

export default DeviceAnalysisApp;
