import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { ContextMenuHandler } from "src/cs/platform/contextview/browser/contextMenuHandler";
import {
    IContextMenuService,
    IContextViewService,
    type IContextMenuDelegate,
    type IContextMenuService as IContextMenuServiceType,
} from "src/cs/platform/contextview/browser/contextView";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";

export class ContextMenuService extends Disposable implements IContextMenuServiceType {
    public declare readonly _serviceBrand: undefined;

    private readonly contextMenuHandler: ContextMenuHandler;
    private readonly onDidShowContextMenuEmitter = this._register(new Emitter<void>());
    private readonly onDidHideContextMenuEmitter = this._register(new Emitter<void>());

    public readonly onDidShowContextMenu = this.onDidShowContextMenuEmitter.event;
    public readonly onDidHideContextMenu = this.onDidHideContextMenuEmitter.event;

    constructor(
        @IContextViewService contextViewService: IContextViewService,
    ) {
        super();
        this.contextMenuHandler = this._register(new ContextMenuHandler(contextViewService));
    }

    public showContextMenu(delegate: IContextMenuDelegate): void {
        const didShow = this.contextMenuHandler.showContextMenu({
            ...delegate,
            onHide: didCancel => {
                delegate.onHide?.(didCancel);
                this.onDidHideContextMenuEmitter.fire();
            },
        });
        if (didShow) {
            this.onDidShowContextMenuEmitter.fire();
        }
    }

    public hideContextMenu(didCancel = true): void {
        this.contextMenuHandler.hideContextMenu(didCancel);
    }
}

registerSingleton(IContextMenuService, ContextMenuService, InstantiationType.Delayed);
