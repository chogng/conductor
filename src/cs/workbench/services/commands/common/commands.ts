import type { IDisposable } from "src/cs/base/common/lifecycle";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const ICommandService = createDecorator<ICommandService>("commandService");

export type CommandHandler = (...args: readonly unknown[]) => unknown;

export interface ICommandService {
  readonly _serviceBrand: undefined;

  registerCommand(id: string, handler: CommandHandler): IDisposable;
  executeCommand<T = unknown>(id: string, ...args: readonly unknown[]): T | undefined;
}
