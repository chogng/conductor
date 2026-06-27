import {
  addDisposableListener,
  EventType,
  getDomRect,
} from "src/cs/base/browser/dom";
import { createFastDomNode, type FastDomNode } from "src/cs/base/browser/fastDomNode";
import {
  DisposableStore,
  type IDisposable,
} from "src/cs/base/common/lifecycle";
import {
  ScrollbarState,
  type ScrollbarOrientation,
  type ScrollbarStateUpdate,
} from "src/cs/base/browser/ui/scrollbar/scrollbarState";
import {
  ScrollbarVisibilityController,
  type ScrollbarVisibilityPolicy,
} from "src/cs/base/browser/ui/scrollbar/scrollbarVisibilityController";

export type ScrollbarPartDelegate = {
  readonly onDragEnd: (orientation: ScrollbarOrientation) => void;
  readonly onDragStart: (orientation: ScrollbarOrientation) => void;
  readonly onScrollPositionChange: (orientation: ScrollbarOrientation, scrollPosition: number) => void;
};

const THUMB_UPDATE_EPSILON = 0.5;

type DragState = {
  readonly scrollbarState: ScrollbarState;
  readonly startPointer: number;
};

export abstract class AbstractScrollbar implements IDisposable {
  protected readonly track: FastDomNode<HTMLElement>;
  protected readonly thumb: FastDomNode<HTMLElement>;

  private readonly scrollbarState = new ScrollbarState();
  private readonly visibilityController: ScrollbarVisibilityController;
  private readonly dragListeners = new DisposableStore();
  private dragState: DragState | null = null;
  private thumbOffset = Number.NaN;
  private thumbSize = Number.NaN;

  constructor(
    protected readonly orientation: ScrollbarOrientation,
    private readonly root: HTMLElement,
    private readonly delegate: ScrollbarPartDelegate,
    trackClassName: string,
    thumbClassName: string,
    visibilityPolicy: ScrollbarVisibilityPolicy = "auto",
  ) {
    this.track = createFastDomNode(document.createElement("div"));
    this.thumb = createFastDomNode(document.createElement("div"));
    this.track.setClassName(`scrollAreaTrack ${trackClassName}`);
    this.thumb.setClassName(`scrollAreaThumb ${thumbClassName}`);
    this.track.appendChild(this.thumb);

    this.track.domNode.addEventListener("mousedown", this.handleTrackPointerDown);
    this.thumb.domNode.addEventListener("mousedown", this.handleThumbPointerDown);
    this.root.appendChild(this.track.domNode);
    this.visibilityController = new ScrollbarVisibilityController(
      this.root,
      this.track,
      this.orientation,
      visibilityPolicy,
    );
  }

  update(update: ScrollbarStateUpdate): void {
    this.scrollbarState.update(update);
    const shouldRender = this.visibilityController.setIsNeeded(this.scrollbarState.isNeeded());
    if (!shouldRender) {
      this.updateThumbOffset(0);
      return;
    }

    this.updateThumbSize(this.scrollbarState.getThumbSize());
    this.updateThumbOffset(this.scrollbarState.getThumbOffset());
  }

  dispose(): void {
    this.dragListeners.dispose();
    this.track.domNode.removeEventListener("mousedown", this.handleTrackPointerDown);
    this.thumb.domNode.removeEventListener("mousedown", this.handleThumbPointerDown);
    this.visibilityController.dispose();
    this.track.domNode.remove();
  }

  setVisibilityPolicy(policy: ScrollbarVisibilityPolicy): void {
    this.visibilityController.setPolicy(policy);
  }

  protected abstract applyThumbSize(size: number): void;
  protected abstract applyThumbOffset(offset: number): void;

  private updateThumbSize(size: number): void {
    if (Math.abs(this.thumbSize - size) < THUMB_UPDATE_EPSILON) {
      return;
    }

    this.thumbSize = size;
    this.applyThumbSize(size);
  }

  private updateThumbOffset(offset: number): void {
    if (Math.abs(this.thumbOffset - offset) < THUMB_UPDATE_EPSILON) {
      return;
    }

    this.thumbOffset = offset;
    this.applyThumbOffset(offset);
  }

  private readonly handleTrackPointerDown = (event: MouseEvent): void => {
    if (event.target !== event.currentTarget) {
      return;
    }

    event.preventDefault();
    const offset = this.getPointerOffset(event);
    this.delegate.onScrollPositionChange(
      this.orientation,
      this.scrollbarState.getDesiredScrollPositionFromOffset(offset),
    );
  };

  private readonly handleThumbPointerDown = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();

    this.dragListeners.clear();
    this.dragState = {
      scrollbarState: this.scrollbarState.clone(),
      startPointer: this.getPointerPosition(event),
    };
    this.delegate.onDragStart(this.orientation);

    const targetWindow = this.track.domNode.ownerDocument.defaultView ?? window;
    this.dragListeners.add(addDisposableListener(
      targetWindow,
      EventType.MOUSE_MOVE,
      this.handleMouseMove,
    ));
    this.dragListeners.add(addDisposableListener(
      targetWindow,
      EventType.MOUSE_UP,
      this.handleMouseUp,
    ));
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    const drag = this.dragState;
    if (!drag) {
      return;
    }

    const delta = this.getPointerPosition(event) - drag.startPointer;
    this.delegate.onScrollPositionChange(
      this.orientation,
      drag.scrollbarState.getDesiredScrollPositionFromDelta(delta),
    );
  };

  private readonly handleMouseUp = (): void => {
    if (!this.dragState) {
      return;
    }

    this.dragState = null;
    this.dragListeners.clear();
    this.delegate.onDragEnd(this.orientation);
  };

  private getPointerOffset(event: MouseEvent): number {
    const rect = getDomRect(event.currentTarget as HTMLElement);
    return this.orientation === "y"
      ? event.clientY - rect.top
      : event.clientX - rect.left;
  }

  private getPointerPosition(event: MouseEvent): number {
    return this.orientation === "y" ? event.clientY : event.clientX;
  }
}
