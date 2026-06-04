import { Emitter, type Event } from "src/cs/base/common/event";
import { createDecorator, type ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";

export const ICommandService = createDecorator<ICommandService>("commandService");

export interface ICommandEvent {
  readonly commandId: string;
  readonly args: readonly unknown[];
}

export interface ICommandService {
  readonly _serviceBrand: undefined;
  readonly onWillExecuteCommand: Event<ICommandEvent>;
  readonly onDidExecuteCommand: Event<ICommandEvent>;

  executeCommand<R = unknown>(commandId: string, ...args: unknown[]): Promise<R | undefined>;
}

export type ICommandHandler<Args extends unknown[] = unknown[], R = void> = (
  accessor: ServicesAccessor,
  ...args: Args
) => R;

export interface ICommand<Args extends unknown[] = unknown[], R = void> {
  readonly id: string;
  readonly handler: ICommandHandler<Args, R>;
}

export type ICommandsMap = Map<string, ICommand>;

export interface ICommandRegistry {
  readonly onDidRegisterCommand: Event<string>;

  registerCommand<Args extends unknown[]>(id: string, handler: ICommandHandler<Args>): IDisposable;
  registerCommand<Args extends unknown[]>(command: ICommand<Args>): IDisposable;
  registerCommandAlias(oldId: string, newId: string): IDisposable;
  getCommand(id: string): ICommand | undefined;
  getCommands(): ICommandsMap;
}

class CommandRegistry implements ICommandRegistry {
  private readonly commands = new Map<string, ICommand[]>();
  private readonly onDidRegisterCommandEmitter = new Emitter<string>();

  public readonly onDidRegisterCommand = this.onDidRegisterCommandEmitter.event;

  public registerCommand<Args extends unknown[]>(
    idOrCommand: string | ICommand<Args>,
    handler?: ICommandHandler<Args>,
  ): IDisposable {
    if (!idOrCommand) {
      throw new Error("Invalid command.");
    }

    if (typeof idOrCommand === "string") {
      if (!handler) {
        throw new Error("Invalid command handler.");
      }
      return this.registerCommand({ id: idOrCommand, handler });
    }

    const command = idOrCommand as ICommand;
    const commands = this.commands.get(command.id) ?? [];
    commands.unshift(command);
    this.commands.set(command.id, commands);
    this.onDidRegisterCommandEmitter.fire(command.id);

    return toDisposable(() => {
      const currentCommands = this.commands.get(command.id);
      if (!currentCommands) {
        return;
      }

      const nextCommands = currentCommands.filter(item => item !== command);
      if (nextCommands.length === 0) {
        this.commands.delete(command.id);
      } else {
        this.commands.set(command.id, nextCommands);
      }
    });
  }

  public registerCommandAlias(oldId: string, newId: string): IDisposable {
    return this.registerCommand(oldId, (accessor, ...args) =>
      accessor.get(ICommandService).executeCommand(newId, ...args),
    );
  }

  public getCommand(id: string): ICommand | undefined {
    return this.commands.get(id)?.[0];
  }

  public getCommands(): ICommandsMap {
    const result = new Map<string, ICommand>();
    for (const id of this.commands.keys()) {
      const command = this.getCommand(id);
      if (command) {
        result.set(id, command);
      }
    }
    return result;
  }
}

export const CommandsRegistry: ICommandRegistry = new CommandRegistry();

CommandsRegistry.registerCommand("noop", () => undefined);
