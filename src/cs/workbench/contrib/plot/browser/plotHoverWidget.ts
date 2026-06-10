/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// Renders and positions the floating readout for hovered plot points.
import { formatNumber } from "src/cs/workbench/services/calculation/common/numberFormat";
import type { PlotReadoutEntry } from "src/cs/workbench/contrib/plot/browser/plotReadoutModel";

import "src/cs/workbench/contrib/plot/browser/plotHoverWidget.css";

type PlotHoverWidgetOptions = {
  readonly plotXFactor: number;
  readonly plotYFactor: number;
  readonly xDigits: number;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const PLOT_HOVER_MARGIN = 8;
const PLOT_HOVER_GAP = 12;

const getHoverPosition = (
  anchor: number,
  size: number,
  boundary: number,
): number =>
  clamp(
    anchor + PLOT_HOVER_GAP,
    PLOT_HOVER_MARGIN,
    Math.max(PLOT_HOVER_MARGIN, boundary - size - PLOT_HOVER_MARGIN),
  );

export class PlotHoverWidget {
  public readonly element: HTMLElement;

  constructor(root: HTMLElement) {
    this.element = document.createElement("div");
    this.element.className = "plot_hover_widget plot_hover_widget--hidden";
    root.appendChild(this.element);
  }

  public show(
    entries: readonly PlotReadoutEntry[],
    localX: number,
    localY: number,
    rect: DOMRect,
    options: PlotHoverWidgetOptions,
  ): void {
    if (!entries.length) {
      this.hide();
      return;
    }

    this.element.replaceChildren(...this.createContent(entries, options));
    this.element.classList.remove("plot_hover_widget--hidden");
    this.layout(localX, localY, rect);
  }

  public hide(): void {
    this.element.classList.add("plot_hover_widget--hidden");
  }

  public dispose(): void {
    this.element.remove();
  }

  private createContent(
    entries: readonly PlotReadoutEntry[],
    options: PlotHoverWidgetOptions,
  ): HTMLElement[] {
    const content: HTMLElement[] = [];
    const title = document.createElement("div");
    title.className = "plot_hover_widget_title";
    title.textContent = formatNumber(entries[0].x * options.plotXFactor, {
      digits: options.xDigits,
    });
    content.push(title);

    for (const entry of entries) {
      content.push(this.createEntryRow(entry, options.plotYFactor));
    }

    return content;
  }

  private createEntryRow(entry: PlotReadoutEntry, plotYFactor: number): HTMLElement {
    const row = document.createElement("div");
    row.className = "plot_hover_widget_row";

    const swatch = document.createElement("span");
    swatch.className = "plot_hover_widget_swatch";
    swatch.style.backgroundColor = entry.color;

    const label = document.createElement("span");
    label.className = "plot_hover_widget_label";
    label.textContent = entry.label;

    const value = document.createElement("span");
    value.className = "plot_hover_widget_value";
    value.textContent = formatNumber(entry.y * plotYFactor, { digits: 4 });

    row.append(swatch, label, value);
    return row;
  }

  private layout(localX: number, localY: number, rect: DOMRect): void {
    this.element.style.visibility = "hidden";
    this.element.style.left = "0px";
    this.element.style.top = "0px";

    const width = this.element.offsetWidth;
    const height = this.element.offsetHeight;
    this.element.style.left = `${getHoverPosition(localX, width, rect.width)}px`;
    this.element.style.top = `${getHoverPosition(localY, height, rect.height)}px`;
    this.element.style.visibility = "";
  }
}
