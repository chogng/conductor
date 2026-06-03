import { Emitter, type Event } from "src/cs/base/common/event";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { ViewPane, type ViewPaneOptions } from "src/cs/workbench/browser/parts/views/viewPane";

let viewPaneContainerIdPool = 0;

export type ViewPaneContainerOptions = {
  readonly className?: string;
  readonly collapsedPaneIds?: readonly string[];
  readonly id?: string;
};

export type ViewPaneContainerAddOptions = Omit<ViewPaneOptions, "collapsed"> & {
  readonly collapsed?: boolean;
  readonly id: string;
};

export class ViewPaneContainer {
  public readonly element: HTMLElement;
  public readonly onDidChangeCollapsedPaneIds: Event<readonly string[]>;
  private readonly collapsedPaneIds: Set<string>;
  private readonly id: string;
  private readonly disposables = new DisposableStore();
  private readonly onDidChangeCollapsedPaneIdsEmitter = new Emitter<readonly string[]>();
  private readonly panes = new Map<string, ViewPane>();
  private updatingCollapsedPaneIds = false;

  constructor(options: ViewPaneContainerOptions = {}) {
    this.id = options.id ?? `workbench_view_pane_container_${viewPaneContainerIdPool++}`;
    this.collapsedPaneIds = new Set(options.collapsedPaneIds ?? []);
    this.onDidChangeCollapsedPaneIds = this.onDidChangeCollapsedPaneIdsEmitter.event;

    this.element = document.createElement("div");
    this.element.className = this.getElementClassName(options.className);
    this.disposables.add(this.onDidChangeCollapsedPaneIdsEmitter);
  }

  public addPane(options: ViewPaneContainerAddOptions): ViewPane {
    const existing = this.panes.get(options.id);
    if (existing) {
      return existing;
    }

    const collapsed = options.collapsed ?? this.collapsedPaneIds.has(options.id);
    const pane = new ViewPane({
      ...options,
      collapsed,
      id: `${this.id}_${options.id}`,
    });

    if (collapsed) {
      this.collapsedPaneIds.add(options.id);
    } else {
      this.collapsedPaneIds.delete(options.id);
    }

    this.disposables.add(pane.onDidChangeCollapsed((nextCollapsed) => {
      this.setPaneCollapsed(options.id, nextCollapsed);
    }));
    this.disposables.add(pane);
    this.panes.set(options.id, pane);
    this.element.append(pane.element);
    this.fireCollapsedPaneIds();
    return pane;
  }

  public getPane(id: string): ViewPane | undefined {
    return this.panes.get(id);
  }

  public getCollapsedPaneIds(): readonly string[] {
    return Array.from(this.collapsedPaneIds);
  }

  public setCollapsedPaneIds(collapsedPaneIds: readonly string[]): void {
    const nextCollapsedPaneIds = new Set(collapsedPaneIds);
    let changed = false;

    this.updatingCollapsedPaneIds = true;
    for (const [id, pane] of this.panes) {
      const collapsed = nextCollapsedPaneIds.has(id);
      changed = pane.setCollapsed(collapsed) || changed;
    }
    this.updatingCollapsedPaneIds = false;

    for (const id of Array.from(this.collapsedPaneIds)) {
      if (!nextCollapsedPaneIds.has(id)) {
        this.collapsedPaneIds.delete(id);
        changed = true;
      }
    }

    for (const id of nextCollapsedPaneIds) {
      if (!this.collapsedPaneIds.has(id)) {
        this.collapsedPaneIds.add(id);
        changed = true;
      }
    }

    if (changed) {
      this.fireCollapsedPaneIds();
    }
  }

  public dispose(): void {
    this.disposables.dispose();
    this.panes.clear();
    this.collapsedPaneIds.clear();
    this.element.replaceChildren();
    this.element.remove();
  }

  private setPaneCollapsed(id: string, collapsed: boolean): void {
    const hadId = this.collapsedPaneIds.has(id);
    if (collapsed) {
      this.collapsedPaneIds.add(id);
    } else {
      this.collapsedPaneIds.delete(id);
    }

    if (hadId !== collapsed && !this.updatingCollapsedPaneIds) {
      this.fireCollapsedPaneIds();
    }
  }

  private fireCollapsedPaneIds(): void {
    this.onDidChangeCollapsedPaneIdsEmitter.fire(this.getCollapsedPaneIds());
  }

  private getElementClassName(className = ""): string {
    const classNames = ["workbench-view-pane-container"];
    if (className) {
      classNames.push(className);
    }
    return classNames.join(" ");
  }
}
