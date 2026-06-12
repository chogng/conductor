import "src/cs/base/browser/ui/grid/gridview.css";

export type GridViewOrientation = "horizontal" | "vertical";

export type GridLocation = readonly number[];

export type GridViewItem = {
  readonly element: HTMLElement;
  readonly className?: string;
  readonly location: GridLocation;
};

export type GridViewOptions = {
  readonly className?: string;
  readonly gap?: number;
  readonly items: readonly GridViewItem[];
  readonly orientation?: GridViewOrientation;
  readonly sizes: readonly number[];
};

export type GridViewStyle = {
  gap: string;
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
};

export const getGridViewClassName = (className = ""): string =>
  className ? `ui-grid-view ${className}` : "ui-grid-view";

export const getGridViewItemClassName = (className = ""): string =>
  className ? `ui-grid-view__item ${className}` : "ui-grid-view__item";

export const getGridViewStyle = ({
  gap = 0,
  orientation = "horizontal",
  sizes,
}: Pick<GridViewOptions, "gap" | "orientation" | "sizes">): GridViewStyle => {
  const template = sizes.map((size) => `${Math.max(0, size)}px`).join(" ");

  return orientation === "horizontal"
    ? {
      gap: `${Math.max(0, gap)}px`,
      gridTemplateColumns: template,
      gridTemplateRows: "none",
    }
    : {
      gap: `${Math.max(0, gap)}px`,
      gridTemplateColumns: "none",
      gridTemplateRows: template,
    };
};

export class GridView {
  public readonly element = document.createElement("div");
  private readonly itemElements = new Map<string, HTMLElement>();
  private options: GridViewOptions;

  constructor(options: GridViewOptions) {
    this.options = options;
    this.update(options);
  }

  public update(options: GridViewOptions): void {
    this.options = options;
    this.applyRoot();
    this.renderItems();
  }

  public layout({
    gap = this.options.gap,
    orientation = this.options.orientation,
    sizes = this.options.sizes,
  }: Partial<Pick<GridViewOptions, "gap" | "orientation" | "sizes">>): void {
    Object.assign(
      this.element.style,
      getGridViewStyle({ gap, orientation, sizes }),
    );
  }

  public getItemElement(location: GridLocation): HTMLElement | undefined {
    return this.itemElements.get(toGridLocationKey(location));
  }

  private applyRoot(): void {
    const { className = "", gap = 0, orientation = "horizontal", sizes } = this.options;
    this.element.className = getGridViewClassName(className);
    this.element.dataset.orientation = orientation;
    Object.assign(this.element.style, getGridViewStyle({ gap, orientation, sizes }));
  }

  private renderItems(): void {
    const nextElementsByKey = new Map(
      this.options.items.map((item) => [toGridLocationKey(item.location), item.element] as const),
    );
    for (const [key, element] of this.itemElements) {
      if (nextElementsByKey.get(key) !== element) {
        element.remove();
        this.itemElements.delete(key);
      }
    }

    for (const item of this.options.items) {
      const key = toGridLocationKey(item.location);
      const itemElement = item.element;
      itemElement.className = getGridViewItemClassName(item.className);
      itemElement.dataset.location = key;
      this.itemElements.set(key, itemElement);
      this.element.append(itemElement);
    }
  }
};

export const createGridView = (options: GridViewOptions): HTMLDivElement =>
  new GridView(options).element;

const toGridLocationKey = (location: GridLocation): string =>
  location.join(",");
