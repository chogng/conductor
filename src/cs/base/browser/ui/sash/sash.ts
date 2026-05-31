import { addDisposableListener, getWindow } from "src/cs/base/browser/dom";
import { combinedDisposable, DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { cx } from "src/utils/cx";

import "src/cs/base/browser/ui/sash/sash.css";

export type SashOrientation = "vertical" | "horizontal";
export type SashEdge = "left" | "right" | "top" | "bottom";

export type SashDragEvent = {
  readonly browserEvent: PointerEvent;
  readonly startX: number;
  readonly startY: number;
  readonly currentX: number;
  readonly currentY: number;
  readonly deltaX: number;
  readonly deltaY: number;
};

type SashDragState = {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
};

export type SashStyle = Record<string, string | number | undefined>;

export type SashOptions = {
  readonly active?: boolean;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly edge?: SashEdge;
  readonly orientation?: SashOrientation;
  readonly role?: string;
  readonly style?: SashStyle;
  readonly onDidStart?: (event: SashDragEvent) => void;
  readonly onDidChange?: (event: SashDragEvent) => void;
  readonly onDidEnd?: (event: SashDragEvent) => void;
};

export const getSashClassName = (className = ""): string =>
  cx("ui-sash", className);

const toSashDragEvent = (
  state: SashDragState,
  browserEvent: PointerEvent,
): SashDragEvent => ({
  browserEvent,
  startX: state.startX,
  startY: state.startY,
  currentX: browserEvent.clientX,
  currentY: browserEvent.clientY,
  deltaX: browserEvent.clientX - state.startX,
  deltaY: browserEvent.clientY - state.startY,
});

export class Sash implements IDisposable {
  public readonly element: HTMLDivElement;

  private readonly store = new DisposableStore();
  private options: SashOptions;
  private dragState: SashDragState | null = null;
  private dragCleanup: IDisposable | null = null;
  private isDragging = false;

  public constructor(options: SashOptions = {}) {
    this.options = options;
    this.element = document.createElement("div");
    this.element.append(
      createSashPart("ui-sash__track"),
      createSashPart("ui-sash__handle"),
    );
    this.store.add(addDisposableListener(this.element, "pointerdown", this.startDrag));
    this.update(options);
  }

  public update(options: SashOptions): void {
    this.options = options;
    this.element.className = getSashClassName(options.className);
    this.element.setAttribute("role", options.role ?? "separator");
    this.element.setAttribute("aria-orientation", options.orientation ?? "vertical");
    if (options.disabled) {
      this.element.setAttribute("aria-disabled", "true");
    } else {
      this.element.removeAttribute("aria-disabled");
    }
    this.element.dataset.active = options.active || this.isDragging ? "true" : "false";
    this.element.dataset.disabled = options.disabled ? "true" : "false";
    this.element.dataset.orientation = options.orientation ?? "vertical";
    setOptionalDataset(this.element, "edge", options.edge);
    this.applyStyle(options.style);
  }

  public dispose(): void {
    this.dragCleanup?.dispose();
    this.dragCleanup = null;
    this.dragState = null;
    this.store.dispose();
  }

  private readonly startDrag = (event: PointerEvent): void => {
    const options = this.options;
    if (event.defaultPrevented || options.disabled || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.dragCleanup?.dispose();

    const targetWindow = getWindow(event);
    const dragState: SashDragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };

    this.dragState = dragState;
    this.isDragging = true;
    this.element.setPointerCapture?.(event.pointerId);
    this.update(this.options);
    options.onDidStart?.(toSashDragEvent(dragState, event));

    const finishDrag = (browserEvent: PointerEvent | null): void => {
      const currentDragState = this.dragState;
      if (!currentDragState) {
        return;
      }

      this.dragCleanup?.dispose();
      this.dragCleanup = null;
      this.dragState = null;
      this.isDragging = false;
      this.element.releasePointerCapture?.(currentDragState.pointerId);
      this.update(this.options);

      if (browserEvent) {
        this.options.onDidEnd?.(toSashDragEvent(currentDragState, browserEvent));
      }
    };

    const onPointerMove = (browserEvent: PointerEvent): void => {
      if (browserEvent.pointerId !== dragState.pointerId) {
        return;
      }

      browserEvent.preventDefault();
      this.options.onDidChange?.(toSashDragEvent(dragState, browserEvent));
    };
    const onPointerEnd = (browserEvent: PointerEvent): void => {
      if (browserEvent.pointerId === dragState.pointerId) {
        finishDrag(browserEvent);
      }
    };

    this.dragCleanup = combinedDisposable(
      addDisposableListener(targetWindow, "pointermove", onPointerMove, { passive: false }),
      addDisposableListener(targetWindow, "pointerup", onPointerEnd),
      addDisposableListener(targetWindow, "pointercancel", onPointerEnd),
      addDisposableListener(targetWindow, "blur", () => finishDrag(null)),
    );
  };

  private applyStyle(style: SashStyle | undefined): void {
    this.element.removeAttribute("style");
    if (style) {
      Object.assign(this.element.style, style);
    }
  }
}

const createSashPart = (className: string): HTMLDivElement => {
  const element = document.createElement("div");
  element.className = className;
  return element;
};

const setOptionalDataset = (
  element: HTMLElement,
  key: string,
  value: string | undefined,
): void => {
  if (value === undefined) {
    delete element.dataset[key];
  } else {
    element.dataset[key] = value;
  }
};

export default Sash;
