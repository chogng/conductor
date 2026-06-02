import type { IChannel, IServerChannel } from "src/cs/base/parts/ipc/common/ipc";
import { IPCServer, StaticRouter } from "src/cs/base/parts/ipc/common/ipc";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { IRemoteService } from "src/cs/platform/ipc/common/services";

export const IMainProcessService = createDecorator<IMainProcessService>("mainProcessService");

export interface IMainProcessService extends IRemoteService {}

export class MainProcessService implements IMainProcessService {
  public declare readonly _serviceBrand: undefined;

  constructor(
    private readonly server: IPCServer,
    private readonly router: StaticRouter,
  ) {}

  public getChannel(channelName: string): IChannel {
    return this.server.getChannel(channelName, this.router);
  }

  public registerChannel(channelName: string, channel: IServerChannel<string>): void {
    this.server.registerChannel(channelName, channel);
  }
}
