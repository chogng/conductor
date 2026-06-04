import { toAction, type IAction } from "src/cs/base/common/actions";
import { LxIcon, type LxIconDefinition } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import { ExportViewId } from "src/cs/workbench/contrib/export/common/export";
import { OriginExportSettingsViewId } from "src/cs/workbench/contrib/origin/common/origin";
import { ParametersViewId } from "src/cs/workbench/contrib/parameters/common/parameters";
import { TemplateAuxiliaryBarViewId } from "src/cs/workbench/contrib/template/common/template";

export type AuxiliaryBarView = "template" | "export" | "parameters" | "settings";
export type AuxiliaryBarMode = "table" | "chart";

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
    labelKey: "template_editor_title",
    label: "Template",
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
    icon: LxIcon.slidersHorizontal,
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

export const getAuxiliaryBarTitle = (mode: AuxiliaryBarMode): string =>
  mode === "chart"
    ? localize("auxiliarybar_chart_title", "分析与可视化")
    : localize("auxiliarybar_table_title", "模板管理");

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
