import { loadLegacyWorkbench } from "src/cs/code/browser/workbench/rendererLoader";
import { getWorkbenchEnvironment } from "src/cs/workbench/services/environment/browser/environmentService";

const logRendererBoot = (stage: string, extra = "") => {
  window.__CONDUCTOR_BOOT_LOG__?.(stage, extra);
};

const formatBootError = (error: unknown) => {
  if (error instanceof Error) {
    return `(message=${error.message} stack=${String(error.stack ?? "").slice(0, 1200)})`;
  }

  return `(message=${String(error)})`;
};

window.addEventListener("error", (event) => {
  const message = event.error ? formatBootError(event.error) : `(message=${event.message})`;
  logRendererBoot("window:error", message);
});

window.addEventListener("unhandledrejection", (event) => {
  logRendererBoot("window:unhandledrejection", formatBootError(event.reason));
});

const isDesktopRenderer = getWorkbenchEnvironment()?.isDesktop === true;
const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error('Root element with id "root" was not found.');
}

logRendererBoot("main:module-evaluated");
logRendererBoot(
  "main:environment",
  `(href=${window.location.href} desktop=${isDesktopRenderer ? "yes" : "no"} dev=${import.meta.env.DEV ? "yes" : "no"} rootChildren=${rootElement.childElementCount})`,
);
logRendererBoot("legacy-workbench:module-requested");

const legacyWorkbenchPromise = loadLegacyWorkbench();
void legacyWorkbenchPromise.then((module) => {
  logRendererBoot("legacy-workbench:module-resolved");
  module.mountLegacyReactWorkbench(
    rootElement,
    import.meta.env.DEV && isDesktopRenderer ? "plain" : "strict",
  );
  logRendererBoot("legacy-root:render-called");
});

window.requestAnimationFrame(() => {
  logRendererBoot(
    "raf:1",
    `(rootChildren=${rootElement.childElementCount} textLength=${(rootElement.textContent ?? "").length})`,
  );
});

window.requestAnimationFrame(() => {
  const rect = rootElement.getBoundingClientRect();
  logRendererBoot(
    "raf:2",
    `(rootChildren=${rootElement.childElementCount} textLength=${(rootElement.textContent ?? "").length} rootRect=${Math.round(rect.width)}x${Math.round(rect.height)})`,
  );
});

window.setTimeout(() => {
  const rect = rootElement.getBoundingClientRect();
  logRendererBoot(
    "timeout:1000",
    `(rootChildren=${rootElement.childElementCount} textLength=${(rootElement.textContent ?? "").length} rootRect=${Math.round(rect.width)}x${Math.round(rect.height)})`,
  );
}, 1000);
