import { DeviceAnalysisSessionProvider } from "./session/DeviceAnalysisSessionProvider";
import DeviceAnalysisPage from "./DeviceAnalysisPage";

const DeviceAnalysisApp = () => {
  return (
    <DeviceAnalysisSessionProvider>
      <DeviceAnalysisPage />
    </DeviceAnalysisSessionProvider>
  );
};

export default DeviceAnalysisApp;
