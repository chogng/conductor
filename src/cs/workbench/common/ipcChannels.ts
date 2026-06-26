export const workbenchIpcChannels = {
  desktopAutoUpdateStatusGet: "conductor:desktop:auto-update-status:get",
  desktopAutoUpdateStatusChanged: "conductor:desktop:auto-update-status:changed",
  desktopAutoUpdateCheck: "conductor:desktop:auto-update:check",
  desktopAutoUpdateCheckAndInstall: "conductor:desktop:auto-update:check-and-install",
  desktopAutoUpdateInstallDownloaded: "conductor:desktop:auto-update:install-downloaded",
  desktopAutoUpdateApplySpecific: "conductor:desktop:auto-update:apply-specific",
  desktopOpaqueSurfaceChanged: "conductor:desktop:opaque-surface:changed",
  desktopAppearanceSet: "conductor:desktop:appearance:set",
  originExeGet: "conductor:origin:exe:get",
  originExeSet: "conductor:origin:exe:set",
  originExePick: "conductor:origin:exe:pick",
  originHealthCheck: "conductor:origin:health-check",
  originRunCsv: "conductor:origin:run-csv",
  originRuntimeCleanupRun: "conductor:origin:runtime-cleanup:run",
  demoFilesGet: "conductor:demo:files:get",
  rustHostCalculateRc: "conductor:rust:calculate-rc",
  rustHostExportOriginCsv: "conductor:rust:export-origin-csv",
  originZipSave: "conductor:origin:zip:save",
} as const;

export type WorkbenchIpcChannel = (typeof workbenchIpcChannels)[keyof typeof workbenchIpcChannels];
