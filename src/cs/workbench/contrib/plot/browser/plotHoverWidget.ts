import { localize } from "src/cs/nls";
import { formatNumber } from "src/cs/workbench/contrib/calculation/common/numberFormat";
import type { PlotReadoutEntry } from "src/cs/workbench/contrib/plot/browser/plotReadoutModel";

import "src/cs/workbench/contrib/plot/browser/plotHoverWidget.css";

type PlotHoverWidgetOptions = {
  readonly plotXFactor: number;
  readonly plotYFactor: number;
  readonly xDigits: number;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const MAX_VISIBLE_ENTRIES = 8;

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
    this.element.replaceChildren();

    const title = document.createElement("div");
    title.className = "plot_hover_widget_title";
    title.textContent = formatNumber(entries[0]!.x * options.plotXFactor, {
      digits: options.xDigits,
    });
    this.element.appendChild(title);

    const visibleEntries = entries.slice(0, MAX_VISIBLE_ENTRIES);
    for (const entry of visibleEntries) {
      const row = document.createElement("div");
      row.className = "plot_hover_widget_row";
      const swatch = document.createElement("span");
      swatch.className = "plot_hover_widget_swatch";
      swatch.style.backgroundColor = entry.color;
      const label = document.createElement("span");
      label.textContent = `${entry.label}: ${formatNumber(entry.y * options.plotYFactor, { digits: 4 })}`;
      row.append(swatch, label);
      this.element.appendChild(row);
    }

    const hiddenCount = entries.length - visibleEntries.length;
    if (hiddenCount > 0) {
      const more = document.createElement("div");
      more.className = "plot_hover_widget_more";
      more.textContent = localize("plot_hover_more_entries", "+ {count} more", { count: hiddenCount });
      this.element.appendChild(more);
    }

    this.element.style.left = `${clamp(localX + 12, 8, rect.width - 220)}px`;
    this.element.style.top = `${clamp(localY + 12, 8, rect.height - 120)}px`;
    this.element.classList.remove("plot_hover_widget--hidden");
  }

  public hide(): void {
    this.element.classList.add("plot_hover_widget--hidden");
  }

  public dispose(): void {
    this.element.remove();
  }
}
