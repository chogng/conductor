import { ActionViewItem, type IActionViewItemOptions } from "src/cs/base/browser/ui/actionbar/actionViewItem";
import { createLxIcon, type LxIconDefinition } from "src/cs/base/browser/ui/lxicon/lxicon";
import type { IAction } from "src/cs/base/common/actions";
import { LxIcon } from "src/cs/base/common/lxicon";

export const CHART_LEGEND_ACTION_ID = "chart.header.legend";
export const CHART_INSPECTOR_ACTION_ID = "chart.header.inspector";

export class ChartHeaderActionViewItem extends ActionViewItem {
  constructor(
    action: IAction,
    private readonly icon: LxIconDefinition,
    options: IActionViewItemOptions,
  ) {
    super(undefined, action, options);
  }

  protected override updateLabel(): void {
    if (!this.label) {
      return;
    }

    this.label.replaceChildren(createLxIcon({ icon: this.icon, size: 16 }));
  }

  protected override updateChecked(): void {
    super.updateChecked();
    if (!this.label || this.action.id !== CHART_LEGEND_ACTION_ID) {
      return;
    }
    this.label.dataset.actionId = CHART_LEGEND_ACTION_ID;
    this.label.setAttribute("aria-haspopup", "dialog");
    this.label.setAttribute("aria-expanded", String(Boolean(this.action.checked)));
  }
}

export const getHeaderActionIcon = (actionId: string): LxIconDefinition => {
  if (actionId === CHART_LEGEND_ACTION_ID) {
    return LxIcon.legend;
  }
  if (actionId === CHART_INSPECTOR_ACTION_ID) {
    return LxIcon.chart;
  }
  return LxIcon.search;
};
