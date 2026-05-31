import { createBootLogger, getBootNowMs } from "src/cs/code/browser/workbench/boot";
import { startDesktopWorkbenchBoot } from "src/cs/code/electron-browser/workbench/desktopBoot";
import { startWorkbenchServices } from "src/cs/workbench/browser/workbenchServices";

const startMs = getBootNowMs();
const logBoot = createBootLogger("renderer", startMs);

startWorkbenchServices();
startDesktopWorkbenchBoot(logBoot);
