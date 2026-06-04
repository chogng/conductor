import { toAction, type IAction } from "src/cs/base/common/actions";
import { localize } from "src/cs/nls";
import { ExportViewId } from "src/cs/workbench/contrib/export/common/export";
import { OriginExportSettingsViewId } from "src/cs/workbench/contrib/origin/common/origin";
import { ParametersViewId } from "src/cs/workbench/contrib/parameters/common/parameters";
import { TemplateSidebarViewId } from "src/cs/workbench/contrib/template/common/template";

export type AuxiliaryBarView = "template" | "export" | "parameters" | "settings";
export type AuxiliaryBarMode = "table" | "chart";

export type AuxiliaryBarViewDescriptor = {
  readonly id: AuxiliaryBarView;
  readonly mode: AuxiliaryBarMode;
  readonly viewId: string;
  readonly labelKey: string;
  readonly label: string;
};

export const AuxiliaryBarViewSwitchActionClass = "auxiliarybar_view_switch_action";

export const AuxiliaryBarViews: readonly AuxiliaryBarViewDescriptor[] = [
  {
    id: "template",
    mode: "table",
    viewId: TemplateSidebarViewId,
    labelKey: "template_editor_title",
    label: "Template",
  },
  {
    id: "export",
    mode: "chart",
    viewId: ExportViewId,
    labelKey: "analysis_views_export",
    label: "Export",
  },
  {
    id: "parameters",
    mode: "chart",
    viewId: ParametersViewId,
    labelKey: "analysis_views_parameters",
    label: "Parameters",
  },
  {
    id: "settings",
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
    return toAction({
      id: `workbench.auxiliarybar.${view.id}`,
      label,
      tooltip: label,
      class: AuxiliaryBarViewSwitchActionClass,
      checked: activeView === view.id,
      run: () => onSelect(view.id),
    });
  });
