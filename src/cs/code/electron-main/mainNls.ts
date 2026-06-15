import {
  getBuiltInNLSMessages,
  localize,
  type NLSLanguage,
  type NLSVars,
} from "../../nls.js";

const MAIN_MESSAGE_DEFAULTS: Record<string, string> = {
  "dialog.allFiles": localize("dialog.allFiles", "All Files"),
  "dialog.confirm": localize("dialog.confirm", "Confirm"),
  "dialog.save": localize("dialog.save", "Save"),
  "help.windowGuideTitle": localize("help.windowGuideTitle", "Conductor Studio User Guide"),
  "help.windowUpdateLogTitle": localize("help.windowUpdateLogTitle", "Conductor Studio Update Log"),
  "originCsv.saveDialogTitle": localize("originCsv.saveDialogTitle", "Save Origin CSV ZIP"),
  "originCsv.zipFilter": localize("originCsv.zipFilter", "ZIP"),
  "tray.backgroundContinueMessage": localize(
    "tray.backgroundContinueMessage",
    "The app is still running in the background. You can restore or quit it from the system tray.",
  ),
  "tray.checkForUpdates": localize("tray.checkForUpdates", "Check for Updates"),
  "tray.hideWindow": localize("tray.hideWindow", "Hide Window"),
  "tray.quit": localize("tray.quit", "Quit"),
  "tray.showWindow": localize("tray.showWindow", "Show Window"),
  "update.alreadyLatest": localize("update.alreadyLatest", "You are already using the latest version."),
  "update.checkFailedDetail": localize(
    "update.checkFailedDetail",
    "{reason}\n\nPlease check your network or proxy settings and try again.",
  ),
  "update.checkFailedMessage": localize("update.checkFailedMessage", "Update check failed"),
  "update.disabledDevelopment": localize("update.disabledDevelopment", "Auto update is disabled in development."),
  "update.errorReasonPrefix": localize("update.errorReasonPrefix", "Reason: {message}"),
  "update.failed": localize("update.failed", "Auto update failed."),
  "update.notEnabled": localize("update.notEnabled", "Auto update is not enabled in this build."),
  "update.ok": localize("update.ok", "OK"),
  "update.retrySuggestion": localize(
    "update.retrySuggestion",
    "Please try again later, or confirm that the current network can access the update server.",
  ),
  "update.storeManagedDetail": localize(
    "update.storeManagedDetail",
    "This package comes from Microsoft Store. The Store checks, downloads, verifies, and installs updates. You can also check for updates manually from the Microsoft Store library page.",
  ),
  "update.storeManagedMessage": localize("update.storeManagedMessage", "Updates are managed by Microsoft Store."),
  "update.unsupportedWindowsOnly": localize("update.unsupportedWindowsOnly", "Auto update is Windows-only."),
};

export const mainProcessMessage = (
  language: NLSLanguage,
  key: string,
  vars: NLSVars = {},
): string => {
  const messages = getBuiltInNLSMessages(language);
  const template = messages[key] ?? MAIN_MESSAGE_DEFAULTS[key] ?? key;

  return Object.entries(vars).reduce(
    (value, [name, replacement]) =>
      value.replaceAll(`{${name}}`, String(replacement ?? "")),
    template,
  );
};
