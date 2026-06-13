import { Disposable } from "src/cs/base/common/lifecycle";
import { Scrollbar } from "src/cs/base/browser/ui/scrollbar/scrollbar";
import { localize } from "src/cs/nls";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { QuickAccessController } from "src/cs/platform/quickinput/browser/quickAccess";
import {
  IQuickInputService,
  type IQuickInputService as IQuickInputServiceType,
  type QuickPickItem,
  type QuickPickOptions,
} from "src/cs/platform/quickinput/common/quickInput";

type ActiveQuickPick = {
  readonly controller: AbortController;
  readonly items: readonly QuickPickItem[];
  readonly list: HTMLElement;
  readonly overlay: HTMLElement;
  readonly resolve: (item: QuickPickItem | undefined) => void;
  readonly scrollbar: Scrollbar;
  activeIndex: number;
  visibleItems: readonly QuickPickItem[];
};

export class BrowserQuickInputService extends Disposable implements IQuickInputServiceType {
  public declare readonly _serviceBrand: undefined;

  public readonly quickAccess = new QuickAccessController(this);

  private activeQuickPick: ActiveQuickPick | null = null;

  public pick<T extends QuickPickItem>(options: QuickPickOptions<T>): Promise<T | undefined> {
    this.close();

    return new Promise<T | undefined>((resolve) => {
      const controller = new AbortController();
      const overlay = document.createElement("div");
      overlay.className = "quick-input-overlay";
      overlay.setAttribute("role", "presentation");

      const panel = document.createElement("div");
      panel.className = "quick-input-panel";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", options.ariaLabel ?? localize("quickInput.ariaLabel", "Quick input"));

      const input = document.createElement("input");
      input.className = "quick-input-input";
      input.type = "text";
      input.placeholder = options.placeholder ?? "";
      input.setAttribute("aria-label", options.ariaLabel ?? localize("quickInput.inputAriaLabel", "Quick input"));

      const scrollbar = new Scrollbar({
        className: "quick-input-scroll-area",
        viewportClassName: "quick-input-list",
      });
      const list = scrollbar.viewport;
      list.setAttribute("role", "listbox");

      panel.append(input, scrollbar.element);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);

      const activeQuickPick: ActiveQuickPick = {
        activeIndex: 0,
        controller,
        items: options.items,
        list,
        overlay,
        resolve: item => resolve(item as T | undefined),
        scrollbar,
        visibleItems: [],
      };
      this.activeQuickPick = activeQuickPick;

      const accept = (item: QuickPickItem | undefined): void => {
        this.close(item);
      };
      const render = (): void => {
        this.render(activeQuickPick, input.value, options.emptyText, accept);
      };

      overlay.addEventListener("mousedown", event => {
        if (event.target === overlay) {
          this.close();
        }
      }, { signal: controller.signal });
      input.addEventListener("input", () => {
        activeQuickPick.activeIndex = 0;
        render();
      }, { signal: controller.signal });
      input.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          event.preventDefault();
          this.close();
          return;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          this.moveActiveItem(activeQuickPick, 1, accept);
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          this.moveActiveItem(activeQuickPick, -1, accept);
          return;
        }

        if (event.key === "Enter") {
          const item = activeQuickPick.visibleItems[activeQuickPick.activeIndex];
          if (item) {
            event.preventDefault();
            accept(item);
          }
        }
      }, { signal: controller.signal });

      render();
      input.focus();
    });
  }

  public override dispose(): void {
    this.close();
    super.dispose();
  }

  private close(item?: QuickPickItem): void {
    const activeQuickPick = this.activeQuickPick;
    if (!activeQuickPick) {
      return;
    }

    this.activeQuickPick = null;
    activeQuickPick.controller.abort();
    activeQuickPick.scrollbar.dispose();
    activeQuickPick.overlay.remove();
    activeQuickPick.resolve(item);
  }

  private moveActiveItem(
    activeQuickPick: ActiveQuickPick,
    offset: number,
    accept: (item: QuickPickItem | undefined) => void,
  ): void {
    const itemCount = activeQuickPick.visibleItems.length;
    if (itemCount === 0) {
      return;
    }

    activeQuickPick.activeIndex = (activeQuickPick.activeIndex + offset + itemCount) % itemCount;
    this.render(activeQuickPick, "", undefined, accept, true);
  }

  private render(
    activeQuickPick: ActiveQuickPick,
    filter: string,
    emptyText: string | undefined,
    accept: (item: QuickPickItem | undefined) => void,
    preserveVisibleItems = false,
  ): void {
    const visibleItems = preserveVisibleItems
      ? activeQuickPick.visibleItems
      : getVisibleItems(activeQuickPick.items, filter).slice(0, 30);
    activeQuickPick.visibleItems = visibleItems;
    activeQuickPick.activeIndex = clampActiveIndex(activeQuickPick.activeIndex, visibleItems.length);
    activeQuickPick.list.replaceChildren();

    if (!visibleItems.length) {
      const empty = document.createElement("div");
      empty.className = "quick-input-empty";
      empty.textContent = emptyText ?? localize("quickInput.empty", "No results found");
      activeQuickPick.list.appendChild(empty);
      activeQuickPick.scrollbar.layout();
      return;
    }

    for (const [index, item] of visibleItems.entries()) {
      const button = document.createElement("button");
      button.className = "quick-input-item";
      button.type = "button";
      button.dataset.quickPickItemId = item.id;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", index === activeQuickPick.activeIndex ? "true" : "false");
      if (index === activeQuickPick.activeIndex) {
        button.classList.add("quick-input-item-active");
      }

      const label = document.createElement("span");
      label.className = "quick-input-item-label";
      label.textContent = item.label;

      const hint = document.createElement("span");
      hint.className = "quick-input-item-hint";
      hint.textContent = item.description ?? item.detail ?? item.id;

      button.append(label, hint);
      button.addEventListener("click", () => accept(item));
      activeQuickPick.list.appendChild(button);
    }

    activeQuickPick.list.querySelector(".quick-input-item-active")?.scrollIntoView({
      block: "nearest",
    });
    activeQuickPick.scrollbar.layout();
  }
}

const getVisibleItems = <T extends QuickPickItem>(
  items: readonly T[],
  filter: string,
): readonly T[] => {
  const normalizedFilter = filter.trim().toLowerCase();
  if (!normalizedFilter) {
    return items;
  }

  return items.filter(item =>
    `${item.label} ${item.description ?? ""} ${item.detail ?? ""} ${item.id}`.toLowerCase().includes(normalizedFilter),
  );
};

const clampActiveIndex = (activeIndex: number, itemCount: number): number => {
  if (itemCount === 0) {
    return 0;
  }

  return Math.min(Math.max(activeIndex, 0), itemCount - 1);
};

registerSingleton(IQuickInputService, BrowserQuickInputService, InstantiationType.Delayed);
