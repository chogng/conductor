export const IRustWorkerHost = Symbol("rustWorkerHost");

export type RustWorkerCommandPayload = Record<string, unknown>;

export type RustWorkerCommandOptions = {
  readonly timeoutMs?: number;
};

export interface RustWorkerCommandHandle<T = unknown> {
  readonly promise: Promise<T>;
  cancel(): void;
}

export interface IRustWorkerHost {
  readonly _serviceBrand: undefined;

  startProcessingCommand(
    command: string,
    payload?: RustWorkerCommandPayload,
    options?: RustWorkerCommandOptions,
  ): RustWorkerCommandHandle;

  sendProcessingCommand(
    command: string,
    payload?: RustWorkerCommandPayload,
    options?: RustWorkerCommandOptions,
  ): Promise<unknown>;

  disposeProcessingFile(fileId: string): Promise<void>;
  stop(): void;
}
