import type { IDisposable } from "src/cs/base/common/lifecycle";

export type HoverContent = string | HTMLElement | undefined;
export type HoverContentOrFactory = HoverContent | (() => HoverContent);

export interface IHoverWidget extends IDisposable {
  readonly isDisposed: boolean;
  readonly element: HTMLElement;
  layout(target: HTMLElement, options?: IHoverPositionOptions): void;
}

export const enum HoverPosition {
  Left = 0,
  Right = 1,
  Below = 2,
  Above = 3,
}

export const enum HoverStyle {
  Pointer = 1,
  Mouse = 2,
}

export interface IHoverTarget extends Partial<IDisposable> {
  readonly targetElements: readonly HTMLElement[];
  readonly x?: number;
  readonly y?: number;
}

export interface IHoverOptions {
  readonly content: HoverContent;
  readonly target: HTMLElement | IHoverTarget;
  readonly container?: HTMLElement;
  readonly id?: string;
  readonly style?: HoverStyle;
  readonly position?: IHoverPositionOptions;
  readonly persistence?: IHoverPersistenceOptions;
  readonly appearance?: IHoverAppearanceOptions;
  readonly onDidShow?: () => void;
}

export type IDelayedHoverOptions = Omit<IHoverOptions, "target">;

export interface IHoverLifecycleOptions {
  readonly groupId?: string;
  readonly reducedDelay?: boolean;
  readonly setupKeyboardEvents?: boolean;
}

export interface IHoverPositionOptions {
  readonly hoverPosition?: HoverPosition | MouseEvent;
  readonly forcePosition?: boolean;
}

export interface IHoverPersistenceOptions {
  readonly hideOnHover?: boolean;
  readonly hideOnKeyDown?: boolean;
  readonly sticky?: boolean;
}

export interface IHoverAppearanceOptions {
  readonly compact?: boolean;
  readonly maxHeightRatio?: number;
  readonly showHoverHint?: boolean;
  readonly showPointer?: boolean;
  readonly skipFadeInAnimation?: boolean;
}

export interface IManagedHoverOptions extends Pick<IHoverOptions, "appearance"> {}

export interface IManagedHover extends IDisposable {
  show(focus?: boolean): void;
  hide(): void;
  update(content: HoverContent, options?: IManagedHoverOptions): void;
}

export type IManagedHoverContent = HoverContent;
export type IManagedHoverContentOrFactory = HoverContentOrFactory;
