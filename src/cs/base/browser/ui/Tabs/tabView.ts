import { Disposable, DisposableStore, toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import {
  getTabsButtonClassName,
  getTabsInstanceId,
  getTabsMenuClassName,
  normalizeTabsOptions,
  type KeyboardActivation,
  type NormalizedTabOption,
  type TabOptionBase,
  type TabSize,
} from "src/cs/base/browser/ui/tabs/tab";

export type TabViewContent = IDisposable & {
  readonly element: HTMLElement;
  focus?(): void;
  layout?(): void;
};

export type TabViewTab<TTabId extends string> = TabOptionBase & {
  readonly id: TTabId;
  readonly label: string;
};

export type TabViewOptions<TTabId extends string> = {
  readonly activeTabId: TTabId;
  readonly className?: string;
  readonly idBase?: string;
  readonly keyboardActivation?: KeyboardActivation;
  readonly onDidChangeActiveTab?: (tabId: TTabId) => void;
  readonly preserveViews?: boolean;
  readonly size?: TabSize;
  readonly tabListClassName?: string;
  readonly tabs: readonly TabViewTab<TTabId>[];
};

export abstract class TabView<TTabId extends string> extends Disposable {
  public readonly element: HTMLElement;

  private readonly tabList: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly views = new Map<TTabId, TabViewContent>();
  private normalizedTabs: NormalizedTabOption<TabViewTab<TTabId>>[] = [];
  private activeTabId: TTabId;
  private options: TabViewOptions<TTabId>;

  constructor(options: TabViewOptions<TTabId>) {
    super();
    this.options = options;
    this.activeTabId = options.activeTabId;
    this.element = document.createElement("div");
    this.element.className = getTabViewClassName(options.className);
    this.tabList = document.createElement("div");
    this.panel = document.createElement("div");
    this.panel.className = "tab_view_panel";
    this.element.append(this.tabList, this.panel);
    this._register(registerTabListListeners<TTabId>(this.tabList, {
      onClick: (tabId) => this.setActiveTab(tabId),
      onKeydown: (event, tabId) => this.handleTabKeydown(event, tabId),
    }));
    this.update(options);
  }

  public update(options: TabViewOptions<TTabId>): void {
    this.options = options;
    this.element.className = getTabViewClassName(options.className);
    this.activeTabId = options.activeTabId;
    this.normalizedTabs = normalizeTabsOptions({
      controlsPanels: true,
      idBase: options.idBase,
      instanceId: getTabsInstanceId(options.idBase, "tab-view"),
      options: options.tabs,
      shouldLinkPanels: true,
    });
    this.renderTabs();
    this.renderPanel();
  }

  public setActiveTab(tabId: TTabId): void {
    if (tabId === this.activeTabId || !this.getTab(tabId) || this.getTab(tabId)?.__disabled) {
      return;
    }

    this.activeTabId = tabId;
    this.options.onDidChangeActiveTab?.(tabId);
    this.renderTabs();
    this.renderPanel();
  }

  protected abstract createView(tabId: TTabId): TabViewContent;

  private renderTabs(): void {
    this.tabList.replaceChildren();
    this.tabList.className = getTabsMenuClassName(this.options.tabListClassName);
    this.tabList.setAttribute("role", "tablist");

    for (const tab of this.normalizedTabs) {
      const button = document.createElement("button");
      const isActive = tab.id === this.activeTabId;
      button.id = tab.__tabId;
      button.type = "button";
      button.setAttribute("role", "tab");
      button.className = getTabsButtonClassName({
        isActive,
        size: this.options.size,
      });
      button.disabled = tab.__disabled;
      button.tabIndex = isActive ? 0 : -1;
      button.textContent = tab.label;
      button.setAttribute("aria-selected", String(isActive));
      if (tab.title) {
        button.title = tab.title;
      }
      if (tab.ariaLabel) {
        button.setAttribute("aria-label", tab.ariaLabel);
      }
      if (tab.__panelId) {
        button.setAttribute("aria-controls", tab.__panelId);
      }
      button.dataset.tabViewTabId = tab.id;
      this.tabList.append(button);
    }
  }

  private renderPanel(): void {
    const tab = this.getTab(this.activeTabId);
    const view = this.getView(this.activeTabId);
    this.panel.replaceChildren(view.element);
    this.panel.setAttribute("role", "tabpanel");
    if (tab?.__panelId) {
      this.panel.id = tab.__panelId;
    } else {
      this.panel.removeAttribute("id");
    }
    if (tab?.__tabId) {
      this.panel.setAttribute("aria-labelledby", tab.__tabId);
    }
    view.layout?.();
  }

  private getView(tabId: TTabId): TabViewContent {
    if (this.options.preserveViews !== false) {
      const cached = this.views.get(tabId);
      if (cached) {
        return cached;
      }
    }

    const view = this.createView(tabId);
    if (this.options.preserveViews !== false) {
      this.views.set(tabId, this._register(view));
    }
    return this.options.preserveViews === false ? this._register(view) : view;
  }

  private handleTabKeydown(event: KeyboardEvent, tabId: TTabId): void {
    const nextTab = this.getNextEnabledTab(tabId, event.key);
    if (!nextTab) {
      return;
    }

    event.preventDefault();
    const button = this.tabList.querySelector<HTMLButtonElement>(`#${CSS.escape(nextTab.__tabId)}`);
    button?.focus();
    if (this.options.keyboardActivation !== "manual") {
      this.setActiveTab(nextTab.id);
    }
  }

  private getNextEnabledTab(
    tabId: TTabId,
    key: string,
  ): NormalizedTabOption<TabViewTab<TTabId>> | undefined {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(key)) {
      return undefined;
    }

    const enabled = this.normalizedTabs.filter((tab) => !tab.__disabled);
    const currentIndex = enabled.findIndex((tab) => tab.id === tabId);
    if (currentIndex < 0) {
      return enabled[0];
    }

    if (key === "Home") {
      return enabled[0];
    }
    if (key === "End") {
      return enabled[enabled.length - 1];
    }

    const delta = key === "ArrowRight" ? 1 : -1;
    return enabled[(currentIndex + delta + enabled.length) % enabled.length];
  }

  private getTab(tabId: TTabId): NormalizedTabOption<TabViewTab<TTabId>> | undefined {
    return this.normalizedTabs.find((tab) => tab.id === tabId);
  }
}

const getTabViewClassName = (className = ""): string =>
  className ? `tab_view ${className}` : "tab_view";

const registerTabListListeners = <TTabId extends string>(
  tabList: HTMLElement,
  handlers: {
    readonly onClick: (tabId: TTabId) => void;
    readonly onKeydown: (event: KeyboardEvent, tabId: TTabId) => void;
  },
): IDisposable => {
  const listeners = new DisposableStore();
  tabList.onclick = (event) => {
    const tabId = getEventTabId<TTabId>(event);
    if (tabId) {
      tabList.dataset.activeTabViewTabId = tabId;
      handlers.onClick(tabId);
    }
  };
  tabList.onkeydown = (event) => {
    const tabId = getEventTabId<TTabId>(event);
    if (tabId) {
      handlers.onKeydown(event, tabId);
    }
  };
  listeners.add(toDisposable(() => {
    tabList.onclick = null;
    tabList.onkeydown = null;
  }));
  return listeners;
};

const getEventTabId = <TTabId extends string>(
  event: MouseEvent | KeyboardEvent,
): TTabId | undefined => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return undefined;
  }

  return target.closest<HTMLElement>("[data-tab-view-tab-id]")
    ?.dataset.tabViewTabId as TTabId | undefined;
};

export default TabView;
