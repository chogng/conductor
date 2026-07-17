export const workbenchIpcChannels = {
  desktopOpaqueSurfaceChanged: "conductor:desktop:opaque-surface:changed",
  desktopAppearanceSet: "conductor:desktop:appearance:set",
  originExeGet: "conductor:origin:exe:get",
  originExeSet: "conductor:origin:exe:set",
  originExePick: "conductor:origin:exe:pick",
  originHealthCheck: "conductor:origin:health-check",
  originRunCsv: "conductor:origin:run-csv",
  originRuntimeCleanupRun: "conductor:origin:runtime-cleanup:run",
  demoFilesGet: "conductor:demo:files:get",
  rustHostAnalyzeCalculation: "conductor:rust:analyze-calculation",
  rustHostCalculateRc: "conductor:rust:calculate-rc",
  rustHostCancelStructuredContent: "conductor:rust:cancel-structured-content",
  rustHostExportOriginCsv: "conductor:rust:export-origin-csv",
  rustHostResolveStructuredContent: "conductor:rust:resolve-structured-content",
  originZipSave: "conductor:origin:zip:save",
} as const;

export type WorkbenchIpcChannel = (typeof workbenchIpcChannels)[keyof typeof workbenchIpcChannels];
