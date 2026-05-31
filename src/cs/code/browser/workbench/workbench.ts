import { startBrowserWorkbenchBoot } from "src/cs/code/browser/workbench/browserBoot";
import {
  createBootLogger,
  getBootNowMs,
  resolveBootProfileEnabled,
} from "src/cs/code/browser/workbench/boot";
import { startWorkbenchServices } from "src/cs/workbench/browser/workbenchServices";

const startMs = getBootNowMs();
const isBootProfileEnabled = resolveBootProfileEnabled();
const logBoot = createBootLogger("browser", startMs, () => isBootProfileEnabled);

startWorkbenchServices();
startBrowserWorkbenchBoot(logBoot, isBootProfileEnabled);
