import { Separator, SubmenuAction, type IAction } from "src/cs/base/common/actions";
import { Emitter } from "src/cs/base/common/event";
import { Disposable, DisposableStore } from "src/cs/base/common/lifecycle";
import { createCheckedMenuItemLabel, createMenu, createMenuActionFromAction, type Menu } from "src/cs/base/browser/ui/menu/menu";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
    IContextMenuService,
    IContextViewService,
    type IAnchor,
    type IContextMenuDelegate,
    type IContextMenuEvent,
    type IContextMenuService as IContextMenuServiceType,
} from "src/cs/platform/contextview/browser/contextView";

export class ContextMenuService extends Disposable implements IContextMenuServiceType {
    public declare readonly _serviceBrand: undefined;

    private readonly closeDisposables = this._register(new DisposableStore());
    private readonly menuDisposables = this._register(new DisposableStore());
    private activeDelegate: IContextMenuDelegate | undefined;

    private readonly onDidShowContextMenuEmitter = this._register(new Emitter<void>());
    private readonly onDidHideContextMenuEmitter = this._register(new Emitter<void>());

    public readonly onDidShowContextMenu = this.onDidShowContextMenuEmitter.event;
    public readonly onDidHideContextMenu = this.onDidHideContextMenuEmitter.event;

    constructor(
        @IContextViewService private readonly contextViewService: IContextViewService,
    ) {
        super();
    }

    public showContextMenu(delegate: IContextMenuDelegate): void {
        const actions = delegate.getActions();
        if (actions.length === 0) {
            return;
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
                this.menuDisposables.add(menu);
                this.layoutMenuFocus(delegate);
                return Disposable.None;
            },
            onHide: data => this.finishHide(data !== false),
        });

        this.installCloseListeners();
        this.onDidShowContextMenuEmitter.fire();
    }

    public hideContextMenu(didCancel = true): void {
        this.hide(didCancel);
    }

    private renderMenu(delegate: IContextMenuDelegate, actions: readonly IAction[]): Menu {
        this.menuDisposables.clear();

        const menu = createMenu({
            className: delegate.getMenuClassName?.(),
        });
        menu.actionRunner = delegate.actionRunner ?? menu.actionRunner;
        this.appendActions(menu, delegate, actions);

        this.menuDisposables.add(menu.onDidRun(event => {
            if (event.error) {
                console.error("Failed to run context menu action.", event.error);
                return;
            }

            this.hide(false);
        }));
        this.menuDisposables.add(addElementListener(menu.domNode, "menuitemactionrun", () => this.hide(false)));

        return menu;
    }

    private appendActions(menu: Menu, delegate: IContextMenuDelegate, actions: readonly IAction[]): void {
        for (const action of actions) {
            if (action instanceof Separator) {
                menu.appendSeparator();
                continue;
            }

            if (action instanceof SubmenuAction) {
                menu.appendGroupLabel(action.label);
                this.appendActions(menu, delegate, action.actions);
                continue;
            }

            const checkedRepresentation = action.checked !== undefined
                ? delegate.getCheckedActionsRepresentation?.(action) ?? "checkbox"
                : undefined;
            menu.appendItem(createMenuActionFromAction(action, {
                checked: action.checked,
                left: checkedRepresentation ? createCheckedMenuItemLabel(action.label, checkedRepresentation) : undefined,
                right: delegate.getKeyBinding?.(action)?.getLabel(),
                run: event => {
                    return this.runAction(action, delegate, event as IContextMenuEvent | undefined);
                },
            }));
        }
    }

    private installCloseListeners(): void {
        this.closeDisposables.clear();

        const contextViewElement = this.contextViewService.getContextViewElement();
        this.closeDisposables.add(addDocumentListener("mousedown", event => {
            const target = event.target;
            if (!(target instanceof Node)) {
                return;
            }

            if (contextViewElement.contains(target)) {
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
        this.menuDisposables.clear();
        delegate.onHide?.(didCancel);
        this.onDidHideContextMenuEmitter.fire();
    }

    private async runAction(action: IAction, delegate: IContextMenuDelegate, event?: IContextMenuEvent): Promise<void> {
        const context = delegate.getActionsContext?.(event);

        if (delegate.actionRunner) {
            await delegate.actionRunner.run(action, context);
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

registerSingleton(IContextMenuService, ContextMenuService, InstantiationType.Delayed);
