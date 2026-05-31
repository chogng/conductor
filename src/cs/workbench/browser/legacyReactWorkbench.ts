import {
  createElement,
  Fragment,
  StrictMode,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import { scheduleAtNextAnimationFrame } from "src/cs/base/browser/dom";
import Page from "src/cs/workbench/browser/workbenchPage";
import {
  isBootProfileEnabled,
  logRendererBoot,
  logSlowScriptResources,
  markBootUiReady,
} from "src/cs/workbench/browser/workbenchBoot";
import { SessionContext } from "src/cs/workbench/contrib/session/analysis-session-context";
import { SessionModel } from "src/cs/workbench/contrib/session/sessionModel";

export type LegacyReactWorkbenchMode = "plain" | "strict";

const LegacyReactWorkbench = () => {
  const modelRef = useRef<SessionModel | null>(null);
  modelRef.current ??= new SessionModel();
  const model = modelRef.current;
  const snapshot = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  const session = useMemo(
    () => model.createContextValue(snapshot),
    [model, snapshot],
  );

  useEffect(() => {
    if (isBootProfileEnabled()) {
      logRendererBoot("LegacyReactWorkbench:mounted");
      logSlowScriptResources();
    }

    const frame = scheduleAtNextAnimationFrame(window, () => {
      markBootUiReady("legacy-react-workbench");
    });

    return () => {
      frame.dispose();
    };
  }, []);

  return createElement(
    SessionContext.Provider,
    { value: session },
    createElement(Page),
  );
};

export const mountLegacyReactWorkbench = (
  parent: HTMLElement,
  mode: LegacyReactWorkbenchMode,
): void => {
  const RootMode = mode === "plain" ? Fragment : StrictMode;
  createRoot(parent).render(
    createElement(RootMode, null, createElement(LegacyReactWorkbench)),
  );
};
