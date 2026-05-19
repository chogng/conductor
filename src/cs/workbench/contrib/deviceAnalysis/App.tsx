import { useEffect } from "react";
import {
  isBootProfileEnabled,
  logRendererBoot,
  logSlowScriptResources,
  markBootUiReady,
} from "src/cs/workbench/contrib/deviceAnalysis/appBoot";
import Page from "src/cs/workbench/contrib/deviceAnalysis/Page";
import { SessionProvider } from "src/cs/workbench/contrib/deviceAnalysis/session/SessionProvider";

const App = () => {
  useEffect(() => {
    if (isBootProfileEnabled()) {
      logRendererBoot("App:mounted");
      logSlowScriptResources();
    }

    const frameId = window.requestAnimationFrame(() => {
      markBootUiReady("analysis-app");
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <SessionProvider>
      <Page />
    </SessionProvider>
  );
};

export default App;
