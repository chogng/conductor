import type { IChannel } from "src/cs/base/parts/ipc/common/ipc";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type { IInstantiationService, ServiceIdentifier } from "src/cs/platform/instantiation/common/instantiation";
import type { IMainProcessService } from "src/cs/platform/ipc/common/mainProcessService";

export type ChannelClientConstructor<T> = new (channel: IChannel) => T;
type Remote = { getChannel(channelName: string): IChannel };

export interface IRemoteServiceWithChannelClientOptions<T> {
  readonly channelClientCtor: ChannelClientConstructor<T>;
}

export interface IRemoteServiceWithFactoryOptions<T> {
  readonly factory: (channel: IChannel) => T;
}

function isRemoteServiceWithChannelClientOptions<T>(options: RemoteServiceOptions<T> | undefined): options is IRemoteServiceWithChannelClientOptions<T> {
  return typeof (options as IRemoteServiceWithChannelClientOptions<T> | undefined)?.channelClientCtor === "function";
}

type RemoteServiceOptions<T> = IRemoteServiceWithChannelClientOptions<T> | IRemoteServiceWithFactoryOptions<T>;

abstract class RemoteServiceStub<T extends object> {
  constructor(
    channelName: string,
    options: RemoteServiceOptions<T> | undefined,
    remote: Remote,
  ) {
    const channel = remote.getChannel(channelName);

    if (isRemoteServiceWithChannelClientOptions(options)) {
      return new options.channelClientCtor(channel);
    }

    if (options?.factory) {
      return options.factory(channel);
    }

    throw new Error(`Remote service '${channelName}' requires a channel client or factory.`);
  }
}

class MainProcessRemoteServiceStub<T extends object> extends RemoteServiceStub<T> {
  constructor(
    channelName: string,
    options: RemoteServiceOptions<T> | undefined,
    mainProcessService: IMainProcessService,
    _instantiationService: IInstantiationService,
  ) {
    super(channelName, options, mainProcessService);
  }
}

export function createMainProcessRemoteService<T>(
  mainProcessService: IMainProcessService,
  channelName: string,
  options: RemoteServiceOptions<T>,
): T {
  if (isRemoteServiceWithChannelClientOptions(options)) {
    return new options.channelClientCtor(mainProcessService.getChannel(channelName));
  }

  return options.factory(mainProcessService.getChannel(channelName));
}

export function registerMainProcessRemoteService<T extends object>(
  id: ServiceIdentifier<T>,
  channelName: string,
  options?: RemoteServiceOptions<T>,
): void {
  registerSingleton(id, new SyncDescriptor(MainProcessRemoteServiceStub, [channelName, options], true));
}
