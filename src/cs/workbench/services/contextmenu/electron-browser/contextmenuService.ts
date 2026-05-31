import { Separator, SubmenuAction, type IAction } from "src/cs/base/common/actions";
import { Emitter } from "src/cs/base/common/event";
import { AnchorAlignment, AnchorAxisAlignment } from "src/cs/base/common/layout";
import { Disposable } from "src/cs/base/common/lifecycle";
import { popup } from "src/cs/base/parts/contextmenu/electron-browser/contextmenu";
import type { IContextMenuItem } from "src/cs/base/parts/contextmenu/common/contextmenu";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
    IContextMenuService,
    type IAnchor,
    type IContextMenuDelegate,
    type IContextMenuEvent,
    type IContextMenuService as IContextMenuServiceType,
} from "src/cs/platform/contextview/browser/contextView";

export class ContextMenuService extends Disposable implements IContextMenuServiceType {
    public declare readonly _serviceBrand: undefined;

    private readonly onDidShowContextMenuEmitter = this._register(new Emitter<void>());
    private readonly onDidHideContextMenuEmitter = this._register(new Emitter<void>());

    public readonly onDidShowContextMenu = this.onDidShowContextMenuEmitter.event;
    public readonly onDidHideContextMenu = this.onDidHideContextMenuEmitter.event;

    public showContextMenu(delegate: IContextMenuDelegate): void {
        const actions = delegate.getActions();
        if (actions.length === 0) {
            return;
        }

        let didHide = false;
        const onHide = () => {
            if (didHide) {
                return;
            }

            didHide = true;
            delegate.onHide?.(false);
            this.onDidHideContextMenuEmitter.fire();
        };
        const menu = this.createMenu(delegate, actions, onHide);
        if (menu.length === 0) {
            return;
        }

        popup(menu, {
            ...this.createPopupPosition(delegate),
            positioningItem: delegate.autoSelectFirstItem ? 0 : undefined,
        }, onHide);
        this.onDidShowContextMenuEmitter.fire();
    }

    private createPopupPosition(delegate: IContextMenuDelegate): { x?: number; y?: number } {
        const anchor = delegate.getAnchor();

        if (isHTMLElement(anchor)) {
            const rect = anchor.getBoundingClientRect();
            const isHorizontal = delegate.anchorAxisAlignment === AnchorAxisAlignment.HORIZONTAL;
            const isRightAligned = delegate.anchorAlignment === AnchorAlignment.RIGHT;

            return {
                x: Math.floor(rect.left + (isRightAligned ? rect.width : 0)),
                y: Math.floor(rect.top + (isHorizontal ? 0 : rect.height)),
            };
        }

        if (isAnchor(anchor)) {
            return {
                x: Math.floor(anchor.x),
                y: Math.floor(anchor.y),
            };
        }

        return {
            x: Math.floor(anchor.posx),
            y: Math.floor(anchor.posy),
        };
    }

    private createMenu(delegate: IContextMenuDelegate, entries: readonly IAction[], onHide: () => void, submenuIds = new Set<string>()): IContextMenuItem[] {
        const items: IContextMenuItem[] = [];

        for (const entry of entries) {
            const item = this.createMenuItem(delegate, entry, onHide, submenuIds);
            if (item) {
                items.push(item);
            }
        }

        return items;
    }

    private createMenuItem(delegate: IContextMenuDelegate, entry: IAction, onHide: () => void, submenuIds: Set<string>): IContextMenuItem | undefined {
        if (entry instanceof Separator) {
            return { type: "separator" };
        }

        if (entry instanceof SubmenuAction) {
            if (submenuIds.has(entry.id)) {
                console.warn(`Found submenu cycle: ${entry.id}`);
                return undefined;
            }

            return {
                label: entry.label.trim(),
                type: "submenu",
                submenu: this.createMenu(delegate, entry.actions, onHide, new Set([...submenuIds, entry.id])),
            };
        }

        const item: IContextMenuItem = {
            label: entry.label.trim(),
            checked: Boolean(entry.checked),
            enabled: entry.enabled,
            type: entry.checked
                ? delegate.getCheckedActionsRepresentation?.(entry) ?? "checkbox"
                : "normal",
            click: event => {
                onHide();
                void this.runAction(entry, delegate, event);
            },
        };

        const keybinding = delegate.getKeyBinding?.(entry);
        const accelerator = keybinding?.getElectronAccelerator();
        if (accelerator) {
            item.accelerator = accelerator;
        }
        else {
            const label = keybinding?.getLabel();
            if (label) {
                item.label = `${item.label} [${label}]`;
            }
        }

        return item;
    }

    private async runAction(action: IAction, delegate: IContextMenuDelegate, event: IContextMenuEvent): Promise<void> {
        const context = delegate.getActionsContext?.(event);

        try {
            if (delegate.actionRunner) {
                await delegate.actionRunner.run(action, context);
            }
            else if (action.enabled) {
                await action.run(context);
            }
        }
        catch (error) {
            console.error("Failed to run context menu action.", error);
        }
    }
}

function isHTMLElement(value: HTMLElement | IAnchor | { readonly posx: number; readonly posy: number }): value is HTMLElement {
    return value instanceof HTMLElement;
}

function isAnchor(value: HTMLElement | IAnchor | { readonly posx: number; readonly posy: number }): value is IAnchor {
    return "x" in value && "y" in value;
}

registerSingleton(IContextMenuService, ContextMenuService, InstantiationType.Delayed);
