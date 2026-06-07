import { InlineEditableTextWidget } from "src/cs/base/browser/ui/inlineEditableText/inlineEditableText";
import { localize } from "src/cs/nls";

type PlotAxis = "x" | "y";

export type PlotAxisTitleViewOptions = {
  readonly fontSize?: number;
  readonly onXTitleChange?: (nextTitle: string) => void;
  readonly onYTitleChange?: (nextTitle: string) => void;
  readonly xTitle: string;
  readonly yTitle: string;
};

export class PlotAxisTitleView {
  public readonly element = document.createElement("div");

  private readonly xElement = document.createElement("div");
  private readonly yElement = document.createElement("div");
  private readonly xWidget: InlineEditableTextWidget;
  private readonly yWidget: InlineEditableTextWidget;
  private xDraft = "";
  private yDraft = "";
  private xEditing = false;
  private yEditing = false;
  private options: PlotAxisTitleViewOptions;

  public constructor(options: PlotAxisTitleViewOptions) {
    this.options = options;
    this.xDraft = options.xTitle;
    this.yDraft = options.yTitle;
    this.element.className = "plot_main_chart_axis_titles";
    this.xElement.className = "plot_main_chart_axis_title plot_main_chart_axis_title--x";
    this.yElement.className = "plot_main_chart_axis_title plot_main_chart_axis_title--y";
    this.xWidget = new InlineEditableTextWidget(this.createWidgetOptions("x"));
    this.yWidget = new InlineEditableTextWidget(this.createWidgetOptions("y"));
    this.xElement.append(this.xWidget.element);
    this.yElement.append(this.yWidget.element);
    this.element.append(this.xElement, this.yElement);
    this.render();
  }

  public dispose(): void {
    this.xWidget.dispose();
    this.yWidget.dispose();
    this.element.remove();
  }

  private createWidgetOptions(axis: PlotAxis) {
    const isX = axis === "x";
    const title = isX ? this.options.xTitle : this.options.yTitle;
    const draftTitle = isX ? this.xDraft : this.yDraft;
    const editing = isX ? this.xEditing : this.yEditing;
    const canEdit = this.canEdit(axis);
    return {
      className: `plot_main_chart_axis_title_widget plot_main_chart_axis_title_widget--${axis}`,
      displayClassName: "plot_main_chart_axis_title_input",
      draftValue: draftTitle,
      editing,
      inputClassName: "plot_main_chart_axis_title_input",
      onCancel: () => this.cancelEdit(axis),
      onChange: (nextTitle: string) => this.setDraft(axis, nextTitle),
      onCommit: () => this.commitEdit(axis),
      onStartEdit: () => {
        if (canEdit) {
          this.startEdit(axis);
        }
      },
      title: canEdit
        ? localize("plot_axis_title_edit", "Double-click to edit axis title")
        : this.getAriaLabel(axis),
      value: title,
    };
  }

  private render(): void {
    if (this.options.fontSize) {
      this.element.style.setProperty("--plot-axis-title-font-size", `${this.options.fontSize}px`);
    } else {
      this.element.style.removeProperty("--plot-axis-title-font-size");
    }

    this.xWidget.update(this.createWidgetOptions("x"));
    this.yWidget.update(this.createWidgetOptions("y"));
    this.xWidget.inputElement.setAttribute("aria-label", this.getAriaLabel("x"));
    this.yWidget.inputElement.setAttribute("aria-label", this.getAriaLabel("y"));
    this.xWidget.inputElement.tabIndex = this.canEdit("x") ? 0 : -1;
    this.yWidget.inputElement.tabIndex = this.canEdit("y") ? 0 : -1;
  }

  private startEdit(axis: PlotAxis): void {
    if (axis === "x") {
      this.xEditing = true;
      this.xDraft = this.options.xTitle;
    } else {
      this.yEditing = true;
      this.yDraft = this.options.yTitle;
    }
    this.render();
  }

  private cancelEdit(axis: PlotAxis): void {
    if (axis === "x") {
      this.xEditing = false;
      this.xDraft = this.options.xTitle;
    } else {
      this.yEditing = false;
      this.yDraft = this.options.yTitle;
    }
    this.render();
  }

  private commitEdit(axis: PlotAxis): void {
    if (axis === "x") {
      const nextTitle = this.xDraft.trim() || this.options.xTitle;
      this.xEditing = false;
      this.xDraft = nextTitle;
      this.render();
      if (nextTitle !== this.options.xTitle) {
        this.options.onXTitleChange?.(nextTitle);
      }
      return;
    }

    const nextTitle = this.yDraft.trim() || this.options.yTitle;
    this.yEditing = false;
    this.yDraft = nextTitle;
    this.render();
    if (nextTitle !== this.options.yTitle) {
      this.options.onYTitleChange?.(nextTitle);
    }
  }

  private setDraft(axis: PlotAxis, nextTitle: string): void {
    if (axis === "x") {
      this.xDraft = nextTitle;
    } else {
      this.yDraft = nextTitle;
    }
  }

  private canEdit(axis: PlotAxis): boolean {
    return axis === "x"
      ? Boolean(this.options.onXTitleChange)
      : Boolean(this.options.onYTitleChange);
  }

  private getAriaLabel(axis: PlotAxis): string {
    return axis === "x"
      ? localize("plot_x_axis_title", "X axis title")
      : localize("plot_y_axis_title", "Y axis title");
  }
}
