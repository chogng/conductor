import type {
  IManagedHover,
  IManagedHoverContentOrFactory,
  IManagedHoverOptions,
} from "src/cs/base/browser/ui/hover/hover";

export interface IHoverDelegate {
  setupManagedHover(
    target: HTMLElement,
    content: IManagedHoverContentOrFactory,
    options?: IManagedHoverOptions,
  ): IManagedHover;
}

const nullManagedHover: IManagedHover = {
  dispose: () => undefined,
  show: () => undefined,
  hide: () => undefined,
  update: () => undefined,
};

let baseHoverDelegate: IHoverDelegate = {
  setupManagedHover: () => nullManagedHover,
};

export function setBaseLayerHoverDelegate(hoverDelegate: IHoverDelegate): void {
  baseHoverDelegate = hoverDelegate;
}

export function getBaseLayerHoverDelegate(): IHoverDelegate {
  return baseHoverDelegate;
}

export const NullHoverDelegate: IHoverDelegate = {
  setupManagedHover: () => nullManagedHover,
};
