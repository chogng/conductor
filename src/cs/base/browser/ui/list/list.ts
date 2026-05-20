export type ListRenderState = {
  focused: boolean;
  index: number;
  selected: boolean;
};

export type ListHandle = {
  focus: () => void;
  getViewport: () => HTMLDivElement | null;
  scrollToEnd: (behavior?: ScrollBehavior) => void;
  scrollToIndex: (index: number, behavior?: ScrollBehavior) => void;
  scrollToStart: (behavior?: ScrollBehavior) => void;
};

export type ListProps<T> = {
  readonly className?: string;
  readonly empty?: (container: HTMLElement) => void;
  readonly disposeEmpty?: (container: HTMLElement) => void;
  readonly getKey: (item: T, index: number) => string;
  readonly gap?: number;
  readonly items: T[];
  readonly minVirtualCount?: number;
  readonly onKeyDown?: (event: KeyboardEvent) => void;
  readonly onScroll?: (event: Event) => void;
  readonly onSelect?: (item: T, index: number) => void;
  readonly overscanRows?: number;
  readonly role?: string;
  readonly renderItem: (
    item: T,
    index: number,
    state: ListRenderState,
    container: HTMLElement,
  ) => void;
  readonly disposeItem?: (
    item: T,
    index: number,
    container: HTMLElement,
  ) => void;
  readonly rowHeight?: number;
  readonly rowRole?: string;
  readonly selectedKey?: string | null;
  readonly viewportClassName?: string;
};
