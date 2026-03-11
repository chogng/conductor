import { useContext } from "react";
import { DeviceAnalysisSessionContext } from "../context/device-analysis-session-context";
import type { DeviceAnalysisSessionContextValue } from "../context/device-analysis-session-context";

export const useDeviceAnalysisSession = (): DeviceAnalysisSessionContextValue => {
  const context = useContext(DeviceAnalysisSessionContext);
  if (!context) {
    throw new Error(
      "useDeviceAnalysisSession must be used within DeviceAnalysisSessionProvider.",
    );
  }

  return context;
};

