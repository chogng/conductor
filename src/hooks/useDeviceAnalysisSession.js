import { useContext } from "react";
import { DeviceAnalysisSessionContext } from "../context/device-analysis-session-context";

export const useDeviceAnalysisSession = () =>
  useContext(DeviceAnalysisSessionContext);

