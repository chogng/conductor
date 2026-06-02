import { Disposable } from "src/cs/base/common/lifecycle";
import { mainWindow } from "src/cs/base/browser/window";
import type { IChannel, IServerChannel } from "src/cs/base/parts/ipc/common/ipc";
import { Client as IPCElectronClient } from "src/cs/base/parts/ipc/electron-browser/ipc.electron";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { IMainProcessService, type IMainProcessService as IMainProcessServiceType } from "src/cs/platform/ipc/common/mainProcessService";

export class ElectronIPCMainProcessService extends Disposable implements IMainProcessServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly mainProcessConnection: IPCElectronClient;

  constructor() {
    super();

    this.mainProcessConnection = this._register(
      new IPCElectronClient(`window:${mainWindow.conductorWindowId}`),
    );
  }

  public getChannel(channelName: string): IChannel {
    return this.mainProcessConnection.getChannel(channelName);
  }

  public registerChannel(channelName: string, channel: IServerChannel<string>): void {
    this.mainProcessConnection.registerChannel(channelName, channel);
  }
}

registerSingleton(IMainProcessService, ElectronIPCMainProcessService, InstantiationType.Delayed);
