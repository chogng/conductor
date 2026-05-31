import type { IMouseEvent } from "src/cs/base/browser/mouseEvent";
import type { IAction, IActionRunner } from "src/cs/base/common/actions";
import type { Event } from "src/cs/base/common/event";
import type { AnchorAlignment, AnchorAxisAlignment } from "src/cs/base/common/layout";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const IContextMenuService = createDecorator<IContextMenuService>("contextMenuService");

export interface IContextMenuService {
    readonly _serviceBrand: undefined;
    readonly onDidShowContextMenu: Event<void>;
    readonly onDidHideContextMenu: Event<void>;

    showContextMenu(delegate: IContextMenuDelegate): void;
}

export interface IAnchor {
    readonly x: number;
    readonly y: number;
}

export interface IContextMenuDelegate {
    readonly actionRunner?: IActionRunner;
    readonly anchorAlignment?: AnchorAlignment;
    readonly anchorAxisAlignment?: AnchorAxisAlignment;
    readonly autoSelectFirstItem?: boolean;
    readonly skipTelemetry?: boolean;

    getActions(): readonly IAction[];
    getAnchor(): HTMLElement | IMouseEvent | IAnchor;
    getActionsContext?(event?: IContextMenuEvent): unknown;
    getCheckedActionsRepresentation?(action: IAction): "checkbox" | "radio";
    getKeyBinding?(action: IAction): IContextMenuKeybinding | undefined;
    onHide?(didCancel: boolean): void;
}

export interface IContextMenuEvent {
    readonly shiftKey?: boolean;
    readonly ctrlKey?: boolean;
    readonly altKey?: boolean;
    readonly metaKey?: boolean;
}

export interface IContextMenuKeybinding {
    getElectronAccelerator(): string | undefined;
    getLabel(): string | undefined;
}
