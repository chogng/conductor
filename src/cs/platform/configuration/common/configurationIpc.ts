import { Event, type Event as EventType } from "../../../base/common/event.js";
import type { IChannel, IServerChannel } from "../../../base/parts/ipc/common/ipc.js";
import type { ConfigurationTarget, IConfigurationChange, IConfigurationService } from "./configuration.js";

export const CONFIGURATION_CHANNEL_NAME = "configuration";
export const CONFIGURATION_CHANGE_EVENT = "onDidChangeConfiguration";

export type ConfigurationChangePayload = {
  readonly source: ConfigurationTarget;
  readonly affectedKeys: readonly string[];
  readonly change: IConfigurationChange;
  readonly requestSource?: string;
};

export type ConfigurationUpdateRequest = {
  readonly raw: Record<string, unknown>;
  readonly requestSource?: string;
};

export class ConfigurationChannel implements IServerChannel<string> {
  private currentUpdateRequestSource: string | undefined;

  public constructor(private readonly configurationService: IConfigurationService) {}

  public listen<T>(
    _ctx: string,
    _event: string,
    _arg?: unknown,
  ): EventType<T> {
    if (_event === CONFIGURATION_CHANGE_EVENT) {
      return Event.map(this.configurationService.onDidChangeConfiguration, event => ({
        source: event.source,
        affectedKeys: Array.from(event.affectedKeys),
        change: event.change,
        requestSource: this.currentUpdateRequestSource,
      } satisfies ConfigurationChangePayload)) as EventType<T>;
    }

    return Event.None as EventType<T>;
  }

  public async call<T>(
    _ctx: string,
    command: string,
    arg?: unknown,
  ): Promise<T> {
    switch (command) {
      case "updateUserConfiguration":
        await this.updateUserConfiguration(toConfigurationUpdateRequest(arg));
        return undefined as T;
      default:
        throw new Error(`Unknown configuration command '${command}'.`);
    }
  }

  private async updateUserConfiguration(request: ConfigurationUpdateRequest): Promise<void> {
    const previousRequestSource = this.currentUpdateRequestSource;
    this.currentUpdateRequestSource = request.requestSource;
    try {
      await this.configurationService.updateUserConfiguration(request.raw);
    } finally {
      this.currentUpdateRequestSource = previousRequestSource;
    }
  }
}

export class ConfigurationChannelClient {
  public readonly onDidChangeConfiguration: EventType<ConfigurationChangePayload>;

  public constructor(private readonly channel: IChannel) {
    this.onDidChangeConfiguration =
      this.channel.listen<ConfigurationChangePayload>(CONFIGURATION_CHANGE_EVENT);
  }

  public updateUserConfiguration(
    raw: Record<string, unknown>,
    requestSource?: string,
  ): Promise<void> {
    return this.channel.call("updateUserConfiguration", {
      raw,
      requestSource,
    } satisfies ConfigurationUpdateRequest);
  }
}

function toConfigurationUpdateRequest(value: unknown): ConfigurationUpdateRequest {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("raw" in value)) {
    throw new Error("Configuration update request must include raw settings.");
  }

  const candidate = value as {
    readonly raw?: unknown;
    readonly requestSource?: unknown;
  };

  return {
    raw: toRawConfiguration(candidate.raw),
    requestSource: typeof candidate.requestSource === "string"
      ? candidate.requestSource
      : undefined,
  };
}

function toRawConfiguration(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Configuration update raw settings must be an object.");
  }

  return value as Record<string, unknown>;
}
