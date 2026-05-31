import { Disposable } from "src/cs/base/common/lifecycle";
import type { IChannel, IServerChannel } from "src/cs/base/parts/ipc/common/ipc";
import { Client as IPCElectronClient } from "src/cs/base/parts/ipc/electron-browser/ipc.electron";
import type { IMainProcessService } from "src/cs/platform/ipc/common/mainProcessService";

export class ElectronIPCMainProcessService extends Disposable implements IMainProcessService {
  public declare readonly _serviceBrand: undefined;

  private readonly mainProcessConnection: IPCElectronClient;

  constructor(windowId: number) {
    super();

    this.mainProcessConnection = this._register(new IPCElectronClient(`window:${windowId}`));
  }

  public getChannel(channelName: string): IChannel {
    return this.mainProcessConnection.getChannel(channelName);
  }

  public registerChannel(channelName: string, channel: IServerChannel<string>): void {
    this.mainProcessConnection.registerChannel(channelName, channel);
  }
}
