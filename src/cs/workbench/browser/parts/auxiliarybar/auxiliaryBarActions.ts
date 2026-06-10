import { toAction, type IAction } from "src/cs/base/common/actions";
import { LxIcon, type LxIconDefinition } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import type { WorkbenchMainPart } from "src/cs/workbench/common/contextkeys";
import { ExportViewId } from "src/cs/workbench/services/export/common/export";
import { OriginExportSettingsViewId } from "src/cs/workbench/services/origin/common/origin";
import { ParametersViewId } from "src/cs/workbench/services/parameters/common/parameters";
import { SearchViewId } from "src/cs/workbench/services/search/common/search";
import { TemplateAuxiliaryBarViewId } from "src/cs/workbench/services/template/common/template";

export type AuxiliaryBarView = "template" | "search" | "export" | "parameters" | "settings";
export type AuxiliaryBarMode = WorkbenchMainPart;
export type TemplateAuxiliaryBarMode = "select" | "save";

export type AuxiliaryBarViewDescriptor = {
  readonly id: AuxiliaryBarView;
  readonly icon?: LxIconDefinition;
  readonly mode: AuxiliaryBarMode;
  readonly viewId: string;
  readonly labelKey: string;
  readonly label: string;
};

export const AuxiliaryBarViewSwitchActionClass = "auxiliarybar_view_switch_action";

export type AuxiliaryBarViewSwitchAction = IAction & {
  readonly icon: LxIconDefinition;
};

export const AuxiliaryBarViews: readonly AuxiliaryBarViewDescriptor[] = [
  {
    id: "template",
    mode: "table",
    viewId: TemplateAuxiliaryBarViewId,
    labelKey: "template_management_title",
    label: "Template Management",
  },
  {
    id: "search",
    icon: LxIcon.search,
    mode: "chart",
    viewId: SearchViewId,
    labelKey: "analysis_views_search",
    label: "Search",
  },
  {
    id: "export",
    icon: LxIcon.origin,
    mode: "chart",
    viewId: ExportViewId,
    labelKey: "analysis_views_export",
    label: "Export",
  },
  {
    id: "parameters",
    icon: LxIcon.parameters,
    mode: "chart",
    viewId: ParametersViewId,
    labelKey: "analysis_views_parameters",
    label: "Parameters",
  },
  {
    id: "settings",
    icon: LxIcon.settings,
    mode: "chart",
    viewId: OriginExportSettingsViewId,
    labelKey: "chart_curve_settings_title",
    label: "Origin Settings",
  },
];

export const getAuxiliaryBarViews = (
  mode: AuxiliaryBarMode,
): readonly AuxiliaryBarViewDescriptor[] =>
  AuxiliaryBarViews.filter((view) => view.mode === mode);

export const getDefaultAuxiliaryBarView = (
  mode: AuxiliaryBarMode,
): AuxiliaryBarView =>
  mode === "chart" ? "export" : "template";

export const getAuxiliaryBarTitleForMode = (
  mode: AuxiliaryBarMode,
  templateMode: TemplateAuxiliaryBarMode,
): string => {
  if (mode === "chart") {
    return localize("auxiliarybar_chart_title", "Analysis & Visualization");
  }

  return templateMode === "save"
    ? localize("template_editor_title", "Template Editor")
    : localize("template_management_title", "Template Management");
};

export const getAuxiliaryBarTitle = (mode: AuxiliaryBarMode): string =>
  getAuxiliaryBarTitleForMode(mode, "select");

export const resolveAuxiliaryBarView = (
  view: AuxiliaryBarView,
  mode: AuxiliaryBarMode,
): AuxiliaryBarView =>
  getAuxiliaryBarViews(mode).some((candidate) => candidate.id === view)
    ? view
    : getDefaultAuxiliaryBarView(mode);

export const createAuxiliaryBarActions = ({
  activeView,
  mode,
  onSelect,
}: {
  readonly activeView: AuxiliaryBarView;
  readonly mode: AuxiliaryBarMode;
  readonly onSelect: (view: AuxiliaryBarView) => void;
}): IAction[] =>
  getAuxiliaryBarViews(mode).map((view) => {
    const label = localize(view.labelKey, view.label);
    const action = toAction({
      id: `workbench.auxiliarybar.${view.id}`,
      label,
      tooltip: label,
      class: AuxiliaryBarViewSwitchActionClass,
      checked: activeView === view.id,
      run: () => onSelect(view.id),
    });
    return view.icon ? { ...action, icon: view.icon } satisfies AuxiliaryBarViewSwitchAction : action;
  });

export const isAuxiliaryBarViewSwitchAction = (
  action: IAction,
): action is AuxiliaryBarViewSwitchAction =>
  action.class?.split(/\s+/g).includes(AuxiliaryBarViewSwitchActionClass) === true &&
  "icon" in action;
