import type { KeyboardEvent, ReactNode } from "react";

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
  readonly empty?: ReactNode;
  readonly getKey: (item: T, index: number) => string;
  readonly gap?: number;
  readonly items: T[];
  readonly minVirtualCount?: number;
  readonly onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  readonly onScroll?: (event: Event) => void;
  readonly onSelect?: (item: T, index: number) => void;
  readonly overscanRows?: number;
  readonly role?: string;
  readonly renderItem: (item: T, index: number, state: ListRenderState) => ReactNode;
  readonly rowHeight?: number;
  readonly rowRole?: string;
  readonly selectedKey?: string | null;
  readonly viewportClassName?: string;
};
