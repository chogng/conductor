import { ActionRunner, Separator, SubmenuAction, type IAction } from "src/cs/base/common/actions";
import { Disposable, DisposableStore } from "src/cs/base/common/lifecycle";
import { Menu } from "src/cs/base/browser/ui/menu/menu";
import type {
    IAnchor,
    IContextMenuDelegate,
    IContextMenuEvent,
    IContextViewService,
} from "src/cs/platform/contextview/browser/contextView";

export class ContextMenuHandler extends Disposable {
    private readonly closeDisposables = this._register(new DisposableStore());
    private readonly menuDisposables = this._register(new DisposableStore());
    private activeDelegate: IContextMenuDelegate | undefined;
    private activeMenu: Menu | null = null;
    private blockElement: HTMLElement | null = null;

    constructor(
        private readonly contextViewService: IContextViewService,
    ) {
        super();
    }

    public showContextMenu(delegate: IContextMenuDelegate): boolean {
        const actions = delegate.getActions();
        if (actions.length === 0) {
            return false;
        }

        this.hide(true);
        this.activeDelegate = delegate;

        const anchor = toContextViewAnchor(delegate.getAnchor());
        this.contextViewService.showContextView({
            anchorAlignment: delegate.anchorAlignment,
            anchorAxisAlignment: delegate.anchorAxisAlignment,
            canRelayout: true,
            getAnchor: () => anchor,
            getWidth: () => delegate.getMenuWidth?.(),
            render: container => {
                container.classList.add("ui-menu-container");
                const menu = this.renderMenu(delegate, actions);
                container.append(menu.domNode);
                this.showMouseBlock(container);
                this.menuDisposables.add(menu);
                this.layoutMenuFocus(delegate);
                return Disposable.None;
            },
            onHide: data => this.finishHide(data !== false),
        });

        this.installCloseListeners();
        return true;
    }

    public hideContextMenu(didCancel = true): void {
        this.hide(didCancel);
    }

    private renderMenu(delegate: IContextMenuDelegate, actions: readonly IAction[]): Menu {
        this.menuDisposables.clear();

        const menu = new Menu({
            className: delegate.getMenuClassName?.(),
            getCheckedActionRepresentation: action => action.checked !== undefined
                ? delegate.getCheckedActionsRepresentation?.(action) ?? "checkbox"
                : undefined,
            getActionRight: action => delegate.getKeyBinding?.(action)?.getLabel(),
        });
        menu.actionRunner = new ContextMenuActionRunner(delegate);
        this.appendActions(menu, actions);
        this.activeMenu = menu;

        this.menuDisposables.add(menu.onDidRun(event => {
            if (event.error) {
                console.error("Failed to run context menu action.", event.error);
            }
        }));
        this.menuDisposables.add(addElementListener(menu.domNode, "menuitemactionrun", () => this.hide(false)));

        return menu;
    }

    private appendActions(
        menu: Menu,
        actions: readonly IAction[],
        submenuIds = new Set<string>(),
    ): void {
        for (const action of this.filterSubmenuActions(actions, submenuIds)) {
            if (action instanceof Separator) {
                menu.appendSeparator();
                continue;
            }

            menu.appendItem(action);
        }
    }

    private filterSubmenuActions(
        actions: readonly IAction[],
        submenuIds = new Set<string>(),
    ): IAction[] {
        const menuActions: IAction[] = [];
        for (const action of actions) {
            if (action instanceof Separator) {
                menuActions.push(action);
                continue;
            }

            if (action instanceof SubmenuAction) {
                if (submenuIds.has(action.id)) {
                    console.warn(`Found submenu cycle: ${action.id}`);
                    continue;
                }

                menuActions.push(new SubmenuAction(
                    action.id,
                    action.label,
                    this.filterSubmenuActions(action.actions, new Set([...submenuIds, action.id])),
                    action.class,
                ));
                continue;
            }

            menuActions.push(action);
        }
        return menuActions;
    }

    private installCloseListeners(): void {
        this.closeDisposables.clear();

        const contextViewElement = this.contextViewService.getContextViewElement();
        const blockElement = this.blockElement;
        if (blockElement) {
            this.closeDisposables.add(addElementListener(blockElement, "mousedown", event => {
                event.stopPropagation();
                this.hide(true);
            }));
            this.closeDisposables.add(addElementListener(blockElement, "contextmenu", event => {
                event.preventDefault();
                event.stopPropagation();
                this.hide(true);
            }));
        }
        this.closeDisposables.add(addDocumentListener("mousedown", event => {
            const target = event.target;
            if (!(target instanceof Node)) {
                return;
            }

            if (contextViewElement.contains(target)) {
                return;
            }

            if (this.activeMenu?.contains(target)) {
                return;
            }

            this.hide(true);
        }));
        this.closeDisposables.add(addDocumentListener("keydown", event => {
            if (event.key === "Escape") {
                event.preventDefault();
                this.hide(true);
            }
        }));
    }

    private showMouseBlock(contextViewElement: HTMLElement): void {
        this.hideMouseBlock();

        const block = document.createElement("div");
        block.className = "context-view-block";
        block.style.position = "fixed";
        block.style.left = "0";
        block.style.top = "0";
        block.style.width = "100vw";
        block.style.height = "100vh";
        block.style.cursor = "initial";
        block.style.zIndex = String(getContextViewZIndex(contextViewElement) - 1);
        document.body.appendChild(block);
        this.blockElement = block;
    }

    private hideMouseBlock(): void {
        this.blockElement?.remove();
        this.blockElement = null;
    }

    private layoutMenuFocus(delegate: IContextMenuDelegate): void {
        requestAnimationFrame(() => {
            const container = this.contextViewService.getContextViewElement();
            const selected = container.querySelector<HTMLElement>("[data-selected] > .ui-actionbar__label");
            const first = container.querySelector<HTMLElement>(".ui-menu__item > .ui-actionbar__label");
            (delegate.autoSelectFirstItem ? (selected ?? first) : selected ?? first)?.focus();
        });
    }

    private hide(didCancel: boolean): void {
        if (!this.activeDelegate) {
            return;
        }

        this.contextViewService.hideContextView(didCancel);
        this.finishHide(didCancel);
    }

    private finishHide(didCancel: boolean): void {
        if (!this.activeDelegate) {
            return;
        }

        const delegate = this.activeDelegate;
        this.activeDelegate = undefined;
        this.closeDisposables.clear();
        this.activeMenu = null;
        this.hideMouseBlock();
        this.menuDisposables.clear();
        delegate.onHide?.(didCancel);
    }

}

class ContextMenuActionRunner extends ActionRunner {
    constructor(
        private readonly delegate: IContextMenuDelegate,
    ) {
        super();
    }

    protected override async runAction(action: IAction, event?: unknown): Promise<void> {
        const context = this.delegate.getActionsContext?.(event as IContextMenuEvent | undefined);
        if (this.delegate.actionRunner) {
            await this.delegate.actionRunner.run(action, context);
            return;
        }

        if (action.enabled) {
            await action.run(context);
        }
    }
}

function toContextViewAnchor(anchor: HTMLElement | IAnchor | { readonly posx: number; readonly posy: number }): HTMLElement | IAnchor {
    if (anchor instanceof HTMLElement) {
        return anchor;
    }

    if ("x" in anchor && "y" in anchor) {
        return anchor;
    }

    return {
        x: anchor.posx,
        y: anchor.posy,
        width: 2,
        height: 2,
    };
}

function addDocumentListener<K extends keyof DocumentEventMap>(type: K, listener: (event: DocumentEventMap[K]) => void) {
    document.addEventListener(type, listener);
    return {
        dispose: () => document.removeEventListener(type, listener),
    };
}

function addElementListener(element: HTMLElement, type: string, listener: (event: Event) => void) {
    element.addEventListener(type, listener);
    return {
        dispose: () => element.removeEventListener(type, listener),
    };
}

function getContextViewZIndex(element: HTMLElement): number {
    const value = Number(element.style.zIndex);
    return Number.isFinite(value) ? value : 2575;
}
