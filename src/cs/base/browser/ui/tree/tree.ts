export type ITreeNode<T> = {
  readonly children: T[];
  readonly collapsible: boolean;
  readonly collapsed: boolean;
  readonly depth: number;
  readonly element: T;
};

export type ITreeElement<T> = {
  readonly children?: ITreeElement<T>[];
  readonly collapsed?: boolean;
  readonly collapsible?: boolean;
  readonly element: T;
};

export type ITreeElementRenderDetails = {
  readonly collapsed: boolean;
  readonly depth: number;
  readonly expandable: boolean;
  readonly focused: boolean;
  readonly selected: boolean;
};

export type ITreeRenderer<T, TTemplateData = HTMLElement> = {
  renderTemplate?: (container: HTMLElement) => TTemplateData;
  renderElement: (
    node: ITreeNode<T>,
    index: number,
    templateData: TTemplateData,
    details: ITreeElementRenderDetails,
  ) => void;
  disposeElement?: (
    node: ITreeNode<T>,
    index: number,
    templateData: TTemplateData,
  ) => void;
  disposeTemplate?: (templateData: TTemplateData) => void;
};

export type ITreeSelectionEvent<T> = {
  readonly depth: number;
  readonly element: T;
  readonly index: number;
};

export type ITreeVirtualDelegate<T> = {
  readonly getHeight: (element: T) => number;
};

export type IDataSource<TInput, T> = {
  getChildren: (element: TInput | T) => T[];
  hasChildren?: (element: TInput | T) => boolean;
};

export type IAsyncDataSource<TInput, T> = {
  getChildren: (element: TInput | T) => T[] | Promise<T[]>;
  hasChildren: (element: TInput | T) => boolean;
};

export type IObjectTreeOptions<T, TTemplateData = HTMLElement> = {
  readonly className?: string;
  readonly collapsedKeys?: string[];
  readonly delegate: ITreeVirtualDelegate<T>;
  readonly empty?: (container: HTMLElement) => void;
  readonly expandOnlyOnTwistieClick?: boolean | ((element: T) => boolean);
  readonly disposeEmpty?: (container: HTMLElement) => void;
  readonly gap?: number;
  readonly getChildren?: (element: T) => T[] | undefined;
  readonly getKey: (element: T, index: number, depth: number) => string;
  readonly items: T[];
  readonly minVirtualCount?: number;
  readonly onDidChangeCollapseState?: (collapsedKeys: string[]) => void;
  readonly onKeyDown?: (event: KeyboardEvent) => void;
  readonly onScroll?: (event: Event) => void;
  readonly onSelect?: (event: ITreeSelectionEvent<T>) => void;
  readonly overscanRows?: number;
  readonly renderer: ITreeRenderer<T, TTemplateData>;
  readonly selectedKey?: string | null;
  readonly viewportClassName?: string;
};

export type IObjectTreeOptionsUpdate<T, TTemplateData = HTMLElement> =
  Partial<Omit<IObjectTreeOptions<T, TTemplateData>, "items">>;
