import type { SharedProcessContributionContext } from "../sharedProcessMain.js";

export const updateLocalizations = (context: SharedProcessContributionContext) => {
  // Upstream VS Code updates language packs here. Conductor currently bundles zh/en
  // dictionaries in src/i18n, so there is no remote language-pack manifest to fetch yet.
  // Keep the contribution explicit so future localization downloads can use the shared
  // download/checksum services instead of growing in electron-main.
  context.log("[shared-process] Localization updater skipped: bundled i18n only.");
};
