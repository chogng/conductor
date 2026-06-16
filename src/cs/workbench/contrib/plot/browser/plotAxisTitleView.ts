/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// Owns editable x and y axis title widgets for the plot main chart.

import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { InlineEditableTextWidget } from "src/cs/base/browser/ui/InlineEditableText/inlineEditableTextWidget";
import { localize } from "src/cs/nls";

type PlotAxis = "x" | "y";

type AxisEditState = {
  readonly axis: PlotAxis;
  readonly store: DisposableStore;
};

const MIN_AXIS_TITLE_EDITOR_WIDTH = 48;
const MAX_AXIS_TITLE_EDITOR_WIDTH = 320;

export type PlotAxisTitleViewOptions = {
  readonly fontSize?: number;
  readonly onXTitleChange?: (nextTitle: string) => void;
  readonly onYTitleChange?: (nextTitle: string) => void;
  readonly xTitle: string;
  readonly yTitle: string;
};

export class PlotAxisTitleView {
  public readonly element = document.createElement("div");

  private readonly disposables = new DisposableStore();
  private readonly xElement = document.createElement("div");
  private readonly yElement = document.createElement("div");
  private readonly xText = document.createElement("span");
  private readonly yText = document.createElement("span");
  private editState: AxisEditState | null = null;
  private options: PlotAxisTitleViewOptions;

  public constructor(options: PlotAxisTitleViewOptions) {
    this.options = options;
    this.element.className = "plot_main_chart_axis_titles";
    this.xElement.className = "plot_main_chart_axis_title plot_main_chart_axis_title--x";
    this.yElement.className = "plot_main_chart_axis_title plot_main_chart_axis_title--y";
    this.xText.className = "plot_main_chart_axis_title_text";
    this.yText.className = "plot_main_chart_axis_title_text plot_main_chart_axis_title_text--y";
    this.xElement.append(this.xText);
    this.yElement.append(this.yText);
    this.element.append(this.xElement, this.yElement);
    this.disposables.add(addDisposableListener(this.xText, EventType.DBLCLICK, () => this.startEdit("x")));
    this.disposables.add(addDisposableListener(this.yText, EventType.DBLCLICK, () => this.startEdit("y")));
    this.disposables.add(addDisposableListener(this.xText, EventType.KEY_DOWN, (event) => this.handleTextKeyDown(event, "x")));
    this.disposables.add(addDisposableListener(this.yText, EventType.KEY_DOWN, (event) => this.handleTextKeyDown(event, "y")));
    this.render();
  }

  public dispose(): void {
    this.stopEdit();
    this.disposables.dispose();
    this.element.remove();
  }

  public editAxisTitle(axis: PlotAxis): boolean {
    return this.startEdit(axis);
  }

  private render(): void {
    if (this.options.fontSize) {
      this.element.style.setProperty("--plot-axis-title-font-size", `${this.options.fontSize}px`);
    } else {
      this.element.style.removeProperty("--plot-axis-title-font-size");
    }

    this.xText.textContent = this.options.xTitle;
    this.yText.textContent = this.options.yTitle;
    this.xText.setAttribute("aria-label", this.getAriaLabel("x"));
    this.yText.setAttribute("aria-label", this.getAriaLabel("y"));
    this.setTextEditState(this.xText, this.canEdit("x"));
    this.setTextEditState(this.yText, this.canEdit("y"));
    this.xText.title = this.canEdit("x")
      ? localize("plot.axisTitle.edit", "Double-click to edit axis title")
      : this.getAriaLabel("x");
    this.yText.title = this.canEdit("y")
      ? localize("plot.axisTitle.edit", "Double-click to edit axis title")
      : this.getAriaLabel("y");
  }

  private setTextEditState(element: HTMLElement, canEdit: boolean): void {
    if (canEdit) {
      element.setAttribute("role", "button");
      element.tabIndex = 0;
      return;
    }

    element.removeAttribute("role");
    element.tabIndex = -1;
  }

  private handleTextKeyDown(event: KeyboardEvent, axis: PlotAxis): void {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    this.startEdit(axis);
  }

  private startEdit(axis: PlotAxis): boolean {
    if (!this.canEdit(axis)) {
      return false;
    }

    if (this.editState?.axis === axis) {
      return true;
    }

    this.stopEdit();

    const host = axis === "x" ? this.xElement : this.yElement;
    const text = axis === "x" ? this.xText : this.yText;
    const currentTitle = axis === "x" ? this.options.xTitle : this.options.yTitle;
    const store = new DisposableStore();
    let draftTitle = currentTitle;
    let isDone = false;
    let editor: InlineEditableTextWidget;
    const updateEditorWidth = (): void => {
      editor.element.style.width = `${this.getEditorWidth(draftTitle)}px`;
    };
    const done = (commit: boolean): void => {
      if (isDone) {
        return;
      }

      isDone = true;
      const nextTitle = draftTitle.trim() || currentTitle;
      store.dispose();
      text.style.display = "";
      this.editState = null;
      if (commit && nextTitle !== currentTitle) {
        if (axis === "x") {
          this.options.onXTitleChange?.(nextTitle);
        } else {
          this.options.onYTitleChange?.(nextTitle);
        }
      }
    };
    editor = new InlineEditableTextWidget({
      className: `plot_main_chart_axis_title_editor plot_main_chart_axis_title_editor--${axis}`,
      draftValue: draftTitle,
      editing: true,
      inputClassName: "plot_main_chart_axis_title_editor_input",
      onCancel: () => done(false),
      onChange: (nextValue) => {
        draftTitle = nextValue;
        updateEditorWidth();
      },
      onCommit: () => done(true),
      onStartEdit: () => undefined,
      title: this.getAriaLabel(axis),
      value: currentTitle,
    });
    store.add(editor);
    updateEditorWidth();
    editor.inputElement.setAttribute("aria-label", this.getAriaLabel(axis));

    text.style.display = "none";
    host.append(editor.element);
    this.editState = { axis, store };
    return true;
  }

  private getEditorWidth(title: string): number {
    const measure = document.createElement("span");
    measure.className = "plot_main_chart_axis_title_editor_measure plot_main_chart_axis_title_editor_input";
    measure.textContent = title || " ";
    this.element.append(measure);
    const width = Math.ceil(measure.getBoundingClientRect().width);
    measure.remove();
    return Math.min(
      MAX_AXIS_TITLE_EDITOR_WIDTH,
      Math.max(MIN_AXIS_TITLE_EDITOR_WIDTH, width),
    );
  }

  private stopEdit(): void {
    if (!this.editState) {
      return;
    }

    const state = this.editState;
    this.editState = null;
    state.store.dispose();
    this.xElement.querySelector(".plot_main_chart_axis_title_editor")?.remove();
    this.yElement.querySelector(".plot_main_chart_axis_title_editor")?.remove();
    this.xText.style.display = "";
    this.yText.style.display = "";
  }

  private canEdit(axis: PlotAxis): boolean {
    return axis === "x"
      ? Boolean(this.options.onXTitleChange)
      : Boolean(this.options.onYTitleChange);
  }

  private getAriaLabel(axis: PlotAxis): string {
    return axis === "x"
      ? localize("plot.axisTitle.x", "X axis title")
      : localize("plot.axisTitle.y", "Y axis title");
  }
}
