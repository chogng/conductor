import { DeferredPromise } from "src/cs/base/common/async";
import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { IDialogArgs, IDialogResult } from "src/cs/platform/dialogs/common/dialogs";

export interface IDialogViewItem {
  readonly args: IDialogArgs;

  close(result?: IDialogResult | Error): void;
}

export interface IDialogHandle {
  readonly item: IDialogViewItem;
  readonly result: Promise<IDialogResult | undefined>;
}

export interface IDialogsModel {
  readonly onWillShowDialog: Event<void>;
  readonly onDidShowDialog: Event<void>;
  readonly dialogs: readonly IDialogViewItem[];

  show(dialog: IDialogArgs): IDialogHandle;
}

export class DialogsModel extends Disposable implements IDialogsModel {
  private readonly items: IDialogViewItem[] = [];

  private readonly onWillShowDialogEmitter = this._register(new Emitter<void>());
  public readonly onWillShowDialog = this.onWillShowDialogEmitter.event;

  private readonly onDidShowDialogEmitter = this._register(new Emitter<void>());
  public readonly onDidShowDialog = this.onDidShowDialogEmitter.event;

  public get dialogs(): readonly IDialogViewItem[] {
    return this.items;
  }

  public show(dialog: IDialogArgs): IDialogHandle {
    const promise = new DeferredPromise<IDialogResult | undefined>();

    const item: IDialogViewItem = {
      args: dialog,
      close: result => {
        const index = this.items.indexOf(item);
        if (index !== -1) {
          this.items.splice(index, 1);
        }

        if (result instanceof Error) {
          promise.error(result);
        }
        else {
          promise.complete(result);
        }

        this.onDidShowDialogEmitter.fire();
      },
    };

    this.items.push(item);
    this.onWillShowDialogEmitter.fire();

    return {
      item,
      result: promise.p,
    };
  }
}
