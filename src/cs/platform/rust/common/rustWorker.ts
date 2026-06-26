export const IRustWorkerHost = Symbol("rustWorkerHost");

export type RustWorkerCommandPayload = Record<string, unknown>;

export type RustWorkerCommandOptions = {
  readonly timeoutMs?: number;
};

export interface IRustWorkerHost {
  readonly _serviceBrand: undefined;

  sendProcessingCommand(
    command: string,
    payload?: RustWorkerCommandPayload,
    options?: RustWorkerCommandOptions,
  ): Promise<unknown>;

  disposeProcessingFile(fileId: string): Promise<void>;
  stop(): void;
}
