export const WorkbenchCommandId = {
  setLanguage: "workbench.action.setLanguage",
} as const;

export type WorkbenchCommandId = typeof WorkbenchCommandId[keyof typeof WorkbenchCommandId];
