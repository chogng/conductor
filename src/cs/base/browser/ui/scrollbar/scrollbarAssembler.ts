import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { ScrollbarPartDelegate } from "src/cs/base/browser/ui/scrollbar/abstractScrollbar";
import { HorizontalScrollbar } from "src/cs/base/browser/ui/scrollbar/horizontalScrollbar";
import type { ScrollbarMetrics } from "src/cs/base/browser/ui/scrollbar/scrollbarOptions";
import { VerticalScrollbar } from "src/cs/base/browser/ui/scrollbar/verticalScrollbar";

export class ScrollbarAssembler implements IDisposable {
  private readonly vertical: VerticalScrollbar;
  private readonly horizontal: HorizontalScrollbar;

  constructor(root: HTMLElement, delegate: ScrollbarPartDelegate) {
    this.vertical = new VerticalScrollbar("y", root, delegate);
    this.horizontal = new HorizontalScrollbar("x", root, delegate);
  }

  update(metrics: ScrollbarMetrics, xOffset: number, yOffset: number): void {
    this.vertical.update(metrics, yOffset);
    this.horizontal.update(metrics, xOffset);
  }

  dispose(): void {
    this.vertical.dispose();
    this.horizontal.dispose();
  }
}

