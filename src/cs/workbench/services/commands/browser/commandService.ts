import { Disposable, toDisposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  ICommandService,
  type CommandHandler,
  type ICommandService as ICommandServiceType,
} from "src/cs/workbench/services/commands/common/commands";

export class CommandService extends Disposable implements ICommandServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly commands = new Map<string, CommandHandler>();

  public registerCommand(id: string, handler: CommandHandler) {
    if (!id) {
      throw new Error("Command id is required.");
    }

    if (this.commands.has(id)) {
      throw new Error(`Command '${id}' is already registered.`);
    }

    this.commands.set(id, handler);
    return toDisposable(() => {
      if (this.commands.get(id) === handler) {
        this.commands.delete(id);
      }
    });
  }

  public executeCommand<T = unknown>(id: string, ...args: readonly unknown[]): T | undefined {
    const command = this.commands.get(id);
    if (!command) {
      return undefined;
    }

    return command(...args) as T;
  }
}

registerSingleton(ICommandService, CommandService, InstantiationType.Delayed);
