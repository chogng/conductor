import type { FastDomNode } from "src/cs/base/browser/fastDomNode";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { ScrollbarOrientation } from "src/cs/base/browser/ui/scrollbar/scrollbarState";

export type ScrollbarVisibilityPolicy = "auto" | "hidden" | "visible";

export class ScrollbarVisibilityController implements IDisposable {
  private isNeeded = false;
  private isVisible: boolean | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly track: FastDomNode<HTMLElement>,
    private readonly orientation: ScrollbarOrientation,
    private policy: ScrollbarVisibilityPolicy = "auto",
  ) {
    this.track.setAttribute("data-scrollbar-visibility", this.policy);
    this.ensureVisibility();
  }

  setPolicy(policy: ScrollbarVisibilityPolicy): boolean {
    if (this.policy === policy) {
      return this.isVisible === true;
    }

    this.policy = policy;
    this.track.setAttribute("data-scrollbar-visibility", policy);
    return this.ensureVisibility();
  }

  setIsNeeded(isNeeded: boolean): boolean {
    if (this.isNeeded === isNeeded) {
      return this.isVisible === true;
    }

    this.isNeeded = isNeeded;
    return this.ensureVisibility();
  }

  dispose(): void {
    this.track.removeAttribute("data-scrollbar-visibility");
    this.root.removeAttribute(this.orientation === "y" ? "data-scrollbar-y" : "data-scrollbar-x");
  }

  private ensureVisibility(): boolean {
    const visible = this.isNeeded && this.policy !== "hidden";
    if (this.isVisible === visible) {
      return visible;
    }

    this.isVisible = visible;
    this.track.domNode.hidden = !visible;
    this.root.dataset[this.orientation === "y" ? "scrollbarY" : "scrollbarX"] =
      visible ? "visible" : "hidden";
    return visible;
  }
}
