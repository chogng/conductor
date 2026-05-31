import { Menu, MenuItem, type IpcMainEvent } from "electron";

import { CONTEXT_MENU_CHANNEL, CONTEXT_MENU_CLOSE_CHANNEL, type IPopupOptions, type ISerializableContextMenuItem } from "../common/contextmenu.js";
import { validatedIpcMain } from "../../ipc/electron-main/ipcMain.js";

export function registerContextMenuListener(): void {
    validatedIpcMain.on(CONTEXT_MENU_CHANNEL, (event: IpcMainEvent, contextMenuId: unknown, items: unknown, onClickChannel: unknown, options?: unknown) => {
        if (typeof contextMenuId !== "number" || !Array.isArray(items) || typeof onClickChannel !== "string") {
            return;
        }

        const menu = createMenu(event, onClickChannel, items as ISerializableContextMenuItem[]);
        const popupOptions = options as IPopupOptions | undefined;

        menu.popup({
            x: popupOptions?.x,
            y: popupOptions?.y,
            positioningItem: popupOptions?.positioningItem,
            callback: () => {
                event.sender.send(CONTEXT_MENU_CLOSE_CHANNEL, contextMenuId);
            },
        });
    });
}

function createMenu(event: IpcMainEvent, onClickChannel: string, items: ISerializableContextMenuItem[]): Menu {
    const menu = new Menu();

    for (const item of items) {
        menu.append(createMenuItem(event, onClickChannel, item));
    }

    return menu;
}

function createMenuItem(event: IpcMainEvent, onClickChannel: string, item: ISerializableContextMenuItem): MenuItem {
    if (item.type === "separator") {
        return new MenuItem({ type: "separator" });
    }

    if (Array.isArray(item.submenu)) {
        return new MenuItem({
            submenu: createMenu(event, onClickChannel, item.submenu),
            label: item.label,
        });
    }

    return new MenuItem({
        label: item.label,
        type: item.type,
        accelerator: item.accelerator,
        checked: item.checked,
        enabled: item.enabled,
        visible: item.visible,
        click: (_menuItem, _window, contextMenuEvent) => event.sender.send(onClickChannel, item.id, contextMenuEvent),
    });
}
