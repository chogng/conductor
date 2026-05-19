import { useEffect } from "react";
import { scheduleAtNextAnimationFrame } from "src/cs/base/browser/dom";
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

    const frame = scheduleAtNextAnimationFrame(window, () => {
      markBootUiReady("analysis-app");
    });

    return () => {
      frame.dispose();
    };
  }, []);

  return (
    <SessionProvider>
      <Page />
    </SessionProvider>
  );
};

export default App;
