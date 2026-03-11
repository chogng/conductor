import { DeviceAnalysisSessionProvider } from "../session/context/DeviceAnalysisSessionContext";
import DeviceAnalysisPage from "./DeviceAnalysisPage";

const DeviceAnalysisApp = () => {
  return (
    <DeviceAnalysisSessionProvider>
      <DeviceAnalysisPage />
    </DeviceAnalysisSessionProvider>
  );
};

export default DeviceAnalysisApp;
