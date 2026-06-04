import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import {
  CommandsRegistry,
  ICommandService,
  type ICommandEvent,
} from "src/cs/platform/commands/common/commands";
import {
  InstantiationType,
  registerSingleton,
} from "src/cs/platform/instantiation/common/extensions";
import { IInstantiationService } from "src/cs/platform/instantiation/common/instantiation";

export class CommandService extends Disposable implements ICommandService {
  public declare readonly _serviceBrand: undefined;

  private readonly onWillExecuteCommandEmitter = this._register(new Emitter<ICommandEvent>());
  private readonly onDidExecuteCommandEmitter = this._register(new Emitter<ICommandEvent>());

  public readonly onWillExecuteCommand: Event<ICommandEvent> =
    this.onWillExecuteCommandEmitter.event;
  public readonly onDidExecuteCommand: Event<ICommandEvent> =
    this.onDidExecuteCommandEmitter.event;

  public constructor(
    @IInstantiationService private readonly instantiationService: IInstantiationService,
  ) {
    super();
  }

  public async executeCommand<R = unknown>(
    commandId: string,
    ...args: unknown[]
  ): Promise<R | undefined> {
    const command = CommandsRegistry.getCommand(commandId);
    if (!command) {
      throw new Error(`Command '${commandId}' not found.`);
    }

    this.onWillExecuteCommandEmitter.fire({ commandId, args });
    const result = this.instantiationService.invokeFunction(command.handler, ...args);
    this.onDidExecuteCommandEmitter.fire({ commandId, args });
    return result as R;
  }
}

registerSingleton(ICommandService, CommandService, InstantiationType.Delayed);
