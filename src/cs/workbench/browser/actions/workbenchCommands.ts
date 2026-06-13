export const WorkbenchCommandId = {
  checkForUpdates: "workbench.action.checkForUpdates",
  setLanguage: "workbench.action.setLanguage",
} as const;

export type WorkbenchCommandId = typeof WorkbenchCommandId[keyof typeof WorkbenchCommandId];
