export const IRustWorkerService = Symbol("rustWorkerService");

export type RustWorkerCommandPayload = Record<string, unknown>;

export type RustWorkerCommandOptions = {
  readonly timeoutMs?: number;
};

export interface IRustWorkerService {
  readonly _serviceBrand: undefined;

  sendCommand(
    command: string,
    payload?: RustWorkerCommandPayload,
    options?: RustWorkerCommandOptions,
  ): Promise<unknown>;

  sendProcessingCommand(
    command: string,
    payload?: RustWorkerCommandPayload,
    options?: RustWorkerCommandOptions,
  ): Promise<unknown>;

  clear(): Promise<void>;
  disposeFile(fileId: string): Promise<void>;
  disposeProcessingFile(fileId: string): Promise<void>;
  stop(): void;
}
