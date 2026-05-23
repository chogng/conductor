export const enum WorkbenchPartId {
  TITLEBAR_PART = "workbench.parts.titlebar",
  SIDEBAR_PART = "workbench.parts.sidebar",
  EDITOR_PART = "workbench.parts.editor",
}

export const enum LayoutElementId {
  TITLEBAR_COMMAND_BAR = "analysis-desktop-command-bar",
  TITLEBAR_UPDATE_BUTTON = "analysis-window-update-btn",
  VIEW_SWITCH_DATA = "analysis-window-data-btn",
  VIEW_SWITCH_ANALYSIS = "analysis-window-analysis-btn",
  VIEW_SWITCH_SETTINGS = "analysis-window-settings-btn",
  TAB_DATA = "analysis-tab-data",
  TAB_ANALYSIS = "analysis-tab-analysis",
  VIEWPANE_DATA = "analysis-viewpane-data",
  VIEWPANE_ANALYSIS = "analysis-viewpane-analysis",
  VIEWPANE_SETTINGS = "analysis-viewpane-settings",
}

export interface ILayoutService {
  readonly parts: {
    readonly titlebar: WorkbenchPartId.TITLEBAR_PART;
    readonly sidebar: WorkbenchPartId.SIDEBAR_PART;
    readonly editor: WorkbenchPartId.EDITOR_PART;
  };
  readonly elements: {
    readonly titlebarCommandBar: LayoutElementId.TITLEBAR_COMMAND_BAR;
    readonly titlebarUpdateButton: LayoutElementId.TITLEBAR_UPDATE_BUTTON;
    readonly dataViewSwitch: LayoutElementId.VIEW_SWITCH_DATA;
    readonly analysisViewSwitch: LayoutElementId.VIEW_SWITCH_ANALYSIS;
    readonly settingsViewSwitch: LayoutElementId.VIEW_SWITCH_SETTINGS;
    readonly dataTab: LayoutElementId.TAB_DATA;
    readonly analysisTab: LayoutElementId.TAB_ANALYSIS;
    readonly dataPane: LayoutElementId.VIEWPANE_DATA;
    readonly analysisPane: LayoutElementId.VIEWPANE_ANALYSIS;
    readonly settingsPane: LayoutElementId.VIEWPANE_SETTINGS;
  };
}

export const layoutService: ILayoutService = {
  parts: {
    titlebar: WorkbenchPartId.TITLEBAR_PART,
    sidebar: WorkbenchPartId.SIDEBAR_PART,
    editor: WorkbenchPartId.EDITOR_PART,
  },
  elements: {
    titlebarCommandBar: LayoutElementId.TITLEBAR_COMMAND_BAR,
    titlebarUpdateButton: LayoutElementId.TITLEBAR_UPDATE_BUTTON,
    dataViewSwitch: LayoutElementId.VIEW_SWITCH_DATA,
    analysisViewSwitch: LayoutElementId.VIEW_SWITCH_ANALYSIS,
    settingsViewSwitch: LayoutElementId.VIEW_SWITCH_SETTINGS,
    dataTab: LayoutElementId.TAB_DATA,
    analysisTab: LayoutElementId.TAB_ANALYSIS,
    dataPane: LayoutElementId.VIEWPANE_DATA,
    analysisPane: LayoutElementId.VIEWPANE_ANALYSIS,
    settingsPane: LayoutElementId.VIEWPANE_SETTINGS,
  },
};
