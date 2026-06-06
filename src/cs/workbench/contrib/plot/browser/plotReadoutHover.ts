import { formatNumber } from "src/cs/workbench/contrib/calculation/common/numberFormat";
import type { PlotReadoutEntry } from "src/cs/workbench/contrib/plot/browser/plotReadoutModel";

type PlotReadoutHoverOptions = {
  readonly plotXFactor: number;
  readonly plotYFactor: number;
  readonly xDigits: number;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export class PlotReadoutHover {
  public readonly element: HTMLElement;

  constructor(root: HTMLElement) {
    this.element = document.createElement("div");
    this.element.className = "main_plot_canvas_readout main_plot_canvas_readout--hidden";
    root.appendChild(this.element);
  }

  public show(
    entries: readonly PlotReadoutEntry[],
    localX: number,
    localY: number,
    rect: DOMRect,
    options: PlotReadoutHoverOptions,
  ): void {
    this.element.replaceChildren();

    const title = document.createElement("div");
    title.className = "main_plot_canvas_readout_title";
    title.textContent = formatNumber(entries[0]!.x * options.plotXFactor, {
      digits: options.xDigits,
    });
    this.element.appendChild(title);

    for (const entry of entries) {
      const row = document.createElement("div");
      row.className = "main_plot_canvas_readout_row";
      const swatch = document.createElement("span");
      swatch.className = "main_plot_canvas_readout_swatch";
      swatch.style.backgroundColor = entry.color;
      const label = document.createElement("span");
      label.textContent = `${entry.label}: ${formatNumber(entry.y * options.plotYFactor, { digits: 4 })}`;
      row.append(swatch, label);
      this.element.appendChild(row);
    }

    this.element.style.left = `${clamp(localX + 12, 8, rect.width - 220)}px`;
    this.element.style.top = `${clamp(localY + 12, 8, rect.height - 120)}px`;
    this.element.classList.remove("main_plot_canvas_readout--hidden");
  }

  public hide(): void {
    this.element.classList.add("main_plot_canvas_readout--hidden");
  }

  public dispose(): void {
    this.element.remove();
  }
}
