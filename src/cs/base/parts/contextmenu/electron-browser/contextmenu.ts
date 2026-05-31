import { CONTEXT_MENU_CHANNEL, CONTEXT_MENU_CLOSE_CHANNEL, type IContextMenuEvent, type IContextMenuItem, type IPopupOptions, type ISerializableContextMenuItem } from "src/cs/base/parts/contextmenu/common/contextmenu";
import { ipcRenderer } from "src/cs/base/parts/sandbox/electron-browser/globals";

let contextMenuIdPool = 0;

export function popup(items: IContextMenuItem[], options?: IPopupOptions, onHide?: () => void): void {
    const processedItems: IContextMenuItem[] = [];
    const contextMenuId = contextMenuIdPool++;
    const onClickChannel = `conductor:onContextMenu${contextMenuId}`;

    const onClickChannelHandler = (_event: unknown, itemId: unknown, context: unknown) => {
        if (typeof itemId !== "number") {
            return;
        }

        processedItems[itemId]?.click?.(context as IContextMenuEvent);
    };

    const onCloseChannelHandler = (_event: unknown, closedContextMenuId: unknown) => {
        if (closedContextMenuId !== contextMenuId) {
            return;
        }

        ipcRenderer.removeListener(CONTEXT_MENU_CLOSE_CHANNEL, onCloseChannelHandler);
        ipcRenderer.removeListener(onClickChannel, onClickChannelHandler);
        onHide?.();
    };

    ipcRenderer.once(onClickChannel, onClickChannelHandler);
    ipcRenderer.on(CONTEXT_MENU_CLOSE_CHANNEL, onCloseChannelHandler);

    ipcRenderer.send(CONTEXT_MENU_CHANNEL, contextMenuId, items.map(item => createItem(item, processedItems)), onClickChannel, options);
}

function createItem(item: IContextMenuItem, processedItems: IContextMenuItem[]): ISerializableContextMenuItem {
    const serializableItem: ISerializableContextMenuItem = {
        id: processedItems.length,
        label: item.label,
        type: item.type,
        accelerator: item.accelerator,
        checked: item.checked,
        enabled: typeof item.enabled === "boolean" ? item.enabled : true,
        visible: typeof item.visible === "boolean" ? item.visible : true,
    };

    processedItems.push(item);

    if (Array.isArray(item.submenu)) {
        serializableItem.submenu = item.submenu.map(submenuItem => createItem(submenuItem, processedItems));
    }

    return serializableItem;
}
