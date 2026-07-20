import assert from "assert";

import { Action, SubmenuAction } from "src/cs/base/common/actions";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import { ContextMenuService } from "src/cs/platform/contextview/browser/contextMenuService";
import type {
  IContextViewDelegate,
  IContextViewService,
  IOpenContextView,
} from "src/cs/platform/contextview/browser/contextView";

suite("base/test/browser/platform/contextMenuService", () => {
  teardown(() => {
    document.querySelectorAll(".ui-submenu-container, .context-view-block").forEach(element => element.remove());
  });

  test("keeps nested submenus open when hovering submenu items", () => {
    const contextViewService = new TestContextViewService();
    const contextMenuService = new ContextMenuService(contextViewService);
    const anchor = document.createElement("button");
    const grandchildItem = new Action("submenu.child.grandchild", "Grandchild item");
    const siblingItem = new Action("sibling.item", "Sibling item");
    document.body.append(anchor);

    try {
      contextMenuService.showContextMenu({
        getAnchor: () => anchor,
        getActions: () => [
          new SubmenuAction("submenu", "Submenu", [
            new SubmenuAction("submenu.child", "Child submenu", [grandchildItem]),
          ]),
          siblingItem,
        ],
      });

      const rootItems = contextViewService.getContextViewElement().querySelectorAll<HTMLElement>(".ui-menu__item");
      assert.equal(rootItems.length, 2);

      rootItems[0].dispatchEvent(new MouseEvent("mouseenter"));
      const submenu = getSubmenus()[0];
      assert.ok(submenu);

      const childItem = submenu.querySelector<HTMLElement>(".ui-menu__item");
      assert.ok(childItem);
      childItem.dispatchEvent(new MouseEvent("mouseenter"));

      const childSubmenu = getSubmenus()[1];
      assert.ok(childSubmenu);

      const grandchild = childSubmenu.querySelector<HTMLElement>(".ui-menu__item");
      assert.ok(grandchild);
      grandchild.dispatchEvent(new MouseEvent("mouseenter"));

      assert.deepEqual(getSubmenus(), [submenu, childSubmenu]);

      rootItems[1].dispatchEvent(new MouseEvent("mouseenter"));
      assert.equal(getSubmenus().length, 0);
    } finally {
      contextMenuService.hideContextMenu();
      contextMenuService.dispose();
      contextViewService.dispose();
      grandchildItem.dispose();
      siblingItem.dispose();
      anchor.remove();
    }
  });

  test("runs nested submenu actions without closing on document mousedown first", async () => {
    const contextViewService = new TestContextViewService();
    const contextMenuService = new ContextMenuService(contextViewService);
    const anchor = document.createElement("button");
    let ran = false;
    const grandchildItem = new Action("submenu.child.grandchild", "Grandchild item", undefined, true, () => {
      ran = true;
    });
    document.body.append(anchor);

    try {
      contextMenuService.showContextMenu({
        getAnchor: () => anchor,
        getActions: () => [
          new SubmenuAction("submenu", "Submenu", [
            new SubmenuAction("submenu.child", "Child submenu", [grandchildItem]),
          ]),
        ],
      });

      const rootItem = contextViewService.getContextViewElement().querySelector<HTMLElement>(".ui-menu__item");
      assert.ok(rootItem);
      rootItem.dispatchEvent(new MouseEvent("mouseenter"));

      const childItem = getSubmenus()[0]?.querySelector<HTMLElement>(".ui-menu__item");
      assert.ok(childItem);
      childItem.dispatchEvent(new MouseEvent("mouseenter"));

      const grandchild = getSubmenus()[1]?.querySelector<HTMLElement>(".ui-menu__item");
      const grandchildButton = grandchild?.querySelector<HTMLElement>(".ui-actionbar__label");
      assert.ok(grandchild);
      assert.ok(grandchildButton);

      grandchild.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      grandchildButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await timeout(0);

      assert.equal(ran, true);
      assert.equal(getSubmenus().length, 0);
      assert.equal(contextViewService.getContextViewElement().childElementCount, 0);
    } finally {
      contextMenuService.hideContextMenu();
      contextMenuService.dispose();
      contextViewService.dispose();
      grandchildItem.dispose();
      anchor.remove();
    }
  });

  test("reports handler visibility through the service contract", () => {
    const contextViewService = new TestContextViewService();
    const contextMenuService = new ContextMenuService(contextViewService);
    const anchor = document.createElement("button");
    const action = new Action("context.action", "Action");
    action.checked = true;
    let didShow = 0;
    let didHide = 0;
    let didCancel: boolean | undefined;
    document.body.append(anchor);

    const showDisposable = contextMenuService.onDidShowContextMenu(() => didShow++);
    const hideDisposable = contextMenuService.onDidHideContextMenu(() => didHide++);
    try {
      contextMenuService.showContextMenu({
        getAnchor: () => anchor,
        getActions: () => [],
      });
      assert.equal(didShow, 0);

      contextMenuService.showContextMenu({
        getAnchor: () => anchor,
        getActions: () => [action],
        getCheckedActionsRepresentation: () => "checkbox",
        getKeyBinding: () => ({
          getElectronAccelerator: () => undefined,
          getLabel: () => "Ctrl+K",
        }),
        onHide: value => didCancel = value,
      });
      assert.equal(didShow, 1);
      assert.ok(contextViewService.getContextViewElement().querySelector(".ui-menu__check-indicator"));
      assert.equal(contextViewService.getContextViewElement().querySelector(".ui-menu__item-right")?.textContent, "Ctrl+K");

      contextMenuService.hideContextMenu(false);
      assert.equal(didCancel, false);
      assert.equal(didHide, 1);
    } finally {
      showDisposable.dispose();
      hideDisposable.dispose();
      contextMenuService.dispose();
      contextViewService.dispose();
      action.dispose();
      anchor.remove();
    }
  });
});

const getSubmenus = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>(".ui-submenu-container"));

const timeout = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

class TestContextViewService implements IContextViewService {
  public declare readonly _serviceBrand: undefined;

  private activeDelegate: IContextViewDelegate | undefined;
  private activeDisposable: IDisposable | undefined;
  private readonly host = document.createElement("div");
  private viewElement = document.createElement("div");

  constructor() {
    document.body.append(this.host);
  }

  public showContextView(delegate: IContextViewDelegate, container?: HTMLElement): IOpenContextView {
    this.activeDelegate = delegate;
    this.viewElement = document.createElement("div");
    (container ?? this.host).append(this.viewElement);
    this.activeDisposable = delegate.render(this.viewElement) ?? undefined;
    return {
      close: () => {
        if (this.activeDelegate === delegate) {
          this.hideContextView();
        }
      },
    };
  }

  public hideContextView(data?: unknown): void {
    const delegate = this.activeDelegate;
    this.activeDisposable?.dispose();
    this.activeDisposable = undefined;
    this.viewElement.remove();
    this.viewElement = document.createElement("div");
    this.activeDelegate = undefined;
    delegate?.onHide?.(data);
  }

  public getContextViewElement(): HTMLElement {
    return this.viewElement;
  }

  public layout(): void {}

  public dispose(): void {
    this.hideContextView();
    this.host.remove();
  }
}
