import { useEffect } from "react";
import { scheduleAtNextAnimationFrame } from "src/cs/base/browser/dom";
import {
  isBootProfileEnabled,
  logRendererBoot,
  logSlowScriptResources,
  markBootUiReady,
} from "src/cs/workbench/contrib/workspace/appBoot";
import Page from "src/cs/workbench/contrib/workspace/Page";
import { SessionProvider } from "src/cs/workbench/contrib/session/SessionProvider";

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
