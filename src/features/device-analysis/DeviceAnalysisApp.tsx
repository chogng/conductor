import { useEffect } from "react";
import { DeviceAnalysisSessionProvider } from "./session/DeviceAnalysisSessionProvider";
import DeviceAnalysisPage from "./DeviceAnalysisPage";

const DeviceAnalysisApp = () => {
  useEffect(() => {
    console.info("[boot][renderer] DeviceAnalysisApp:mounted");
  }, []);

  return (
    <DeviceAnalysisSessionProvider>
      <DeviceAnalysisPage />
    </DeviceAnalysisSessionProvider>
  );
};

export default DeviceAnalysisApp;
