import { Event, type Event as EventType } from "../../../base/common/event.js";
import type { IChannel, IServerChannel } from "../../../base/parts/ipc/common/ipc.js";
import type { IConfigurationService } from "./configuration.js";

export const CONFIGURATION_CHANNEL_NAME = "configuration";

export class ConfigurationChannel implements IServerChannel<string> {
  public constructor(private readonly configurationService: IConfigurationService) {}

  public listen<T>(
    _ctx: string,
    _event: string,
    _arg?: unknown,
  ): EventType<T> {
    return Event.None as EventType<T>;
  }

  public async call<T>(
    _ctx: string,
    command: string,
    arg?: unknown,
  ): Promise<T> {
    switch (command) {
      case "updateUserConfiguration":
        await this.configurationService.updateUserConfiguration(toRawConfiguration(arg));
        return undefined as T;
      default:
        throw new Error(`Unknown configuration command '${command}'.`);
    }
  }
}

export class ConfigurationChannelClient {
  public constructor(private readonly channel: IChannel) {}

  public updateUserConfiguration(raw: Record<string, unknown>): Promise<void> {
    return this.channel.call("updateUserConfiguration", raw);
  }
}

function toRawConfiguration(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
