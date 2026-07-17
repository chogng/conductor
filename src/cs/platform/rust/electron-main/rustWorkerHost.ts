import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { CancellationError } from "../../../base/common/errors.js";
import type {
  IRustWorkerHost,
  RustWorkerCommandHandle,
  RustWorkerCommandOptions,
  RustWorkerCommandPayload,
} from "../common/rustWorker.js";

type PendingRustRequest = {
  reject: (error: unknown) => void;
  resolve: (result: unknown) => void;
  timeoutId: NodeJS.Timeout;
};

type RustWorkerSlot = {
  busyCount: number;
  child: ChildProcessWithoutNullStreams | null;
  name: string;
  pending: Map<number, PendingRustRequest>;
  requestId: number;
  stdoutBuffer: string;
};

type ScheduledRustRequest = {
  readonly command: string;
  readonly payload: RustWorkerCommandPayload;
  readonly reject: (error: unknown) => void;
  readonly resolve: (result: unknown) => void;
  readonly timeoutMs: number;
  settled: boolean;
  slot: RustWorkerSlot | null;
};

export type RustWorkerExecutableResolverOptions = {
  appRootPath: string;
  env: NodeJS.ProcessEnv;
  isDev: boolean;
  platform: NodeJS.Platform;
  resourcesPath: string;
};

export type RustWorkerHostOptions = {
  isWindows: boolean;
  processingPoolSize: number;
  resolveExecutablePath: () => string | null;
  spawnProcessingWorker?: () => ChildProcessWithoutNullStreams;
};

const DEFAULT_TIMEOUT_MS = 120000;
const DISPOSE_TIMEOUT_MS = 30000;
const RUST_PROCESSING_POOL_FALLBACK_SIZE = 2;

export function resolveRustProcessingPoolSize({
  availableParallelism,
  envValue,
}: {
  readonly availableParallelism: number;
  readonly envValue?: string;
}): number {
  const envPoolSize = Number(envValue);
  if (Number.isFinite(envPoolSize) && envPoolSize > 0) {
    return Math.max(1, Math.floor(envPoolSize));
  }

  const coreCount = Number.isFinite(availableParallelism)
    ? Math.max(1, Math.floor(availableParallelism))
    : RUST_PROCESSING_POOL_FALLBACK_SIZE;
  return coreCount;
}

const normalizeAbsoluteFilePath = (rawPath: unknown): string => {
  const normalized = typeof rawPath === "string" ? rawPath.trim() : "";
  if (!normalized || !path.isAbsolute(normalized)) return "";
  return path.normalize(normalized);
};

const getConductorRsFileName = (platform: NodeJS.Platform): string =>
  platform === "win32" ? "conductor-rs.exe" : "conductor-rs";

const formatMissingWorkerMessage = (platform: NodeJS.Platform): string => {
  const conductorRsFileName = getConductorRsFileName(platform);
  return [
    `Built conductor-rs helper was not found for platform '${platform}'.`,
    `Expected a packaged helper such as bin/${conductorRsFileName}.`,
    "Build it with `npm run build:conductor-rs` before starting the desktop app.",
  ].join(" ");
};

export const resolveRustWorkerExecutablePath = ({
  appRootPath,
  env,
  isDev,
  platform,
  resourcesPath,
}: RustWorkerExecutableResolverOptions): string | null => {
  const conductorRsFileName = getConductorRsFileName(platform);
  const envPath = normalizeAbsoluteFilePath(env.CONDUCTOR_RS_CLI_PATH);
  const candidates = [
    envPath,
    path.join(resourcesPath, "bin", conductorRsFileName),
    path.join(
      resourcesPath,
      "app.asar.unpacked",
      "bin",
      conductorRsFileName,
    ),
    isDev
      ? path.join(
          appRootPath,
          "resources",
          "bin",
          conductorRsFileName,
        )
      : "",
    isDev
      ? path.join(
          appRootPath,
          ".build",
          "cache",
          "conductor-rs-cli-target",
          "release",
          conductorRsFileName,
        )
      : "",
    isDev
      ? path.join(
          appRootPath,
          ".tooling",
          "conductor-rs-cli-target",
          "release",
          conductorRsFileName,
        )
      : "",
    isDev
      ? path.join(
          appRootPath,
          "target",
          "release",
          conductorRsFileName,
        )
      : "",
  ].filter(Boolean);

  return candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  }) ?? null;
};

export class RustWorkerHost implements IRustWorkerHost {
  public declare readonly _serviceBrand: undefined;

  private readonly activeProcessingRequestsBySlot = new Map<RustWorkerSlot, ScheduledRustRequest>();
  private readonly processingQueue: ScheduledRustRequest[] = [];
  private readonly processingSlots: RustWorkerSlot[] = [];
  private processingSlotCursor = 0;

  constructor(private readonly options: RustWorkerHostOptions) {}

  public sendProcessingCommand(
    command: string,
    payload: RustWorkerCommandPayload = {},
    options: RustWorkerCommandOptions = {},
  ): Promise<unknown> {
    return this.startProcessingCommand(command, payload, options).promise;
  }

  public startProcessingCommand(
    command: string,
    payload: RustWorkerCommandPayload = {},
    options: RustWorkerCommandOptions = {},
  ): RustWorkerCommandHandle {
    let request!: ScheduledRustRequest;
    const promise = new Promise<unknown>((resolve, reject) => {
      request = {
        command,
        payload,
        reject,
        resolve,
        settled: false,
        slot: null,
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      };
    });
    this.processingQueue.push(request);
    this.dispatchProcessingQueue();
    return {
      promise,
      cancel: () => this.cancelProcessingRequest(request),
    };
  }

  private dispatchProcessingQueue(): void {
    while (this.processingQueue.length > 0) {
      const slot = this.getIdleProcessingSlot();
      if (!slot) {
        return;
      }
      const request = this.processingQueue.shift();
      if (!request || request.settled) {
        continue;
      }

      request.slot = slot;
      this.activeProcessingRequestsBySlot.set(slot, request);
      try {
        void this.sendSlotCommand(
          slot,
          request.command,
          request.payload,
          request.timeoutMs,
        ).then(
          result => this.finishProcessingRequest(request, null, result),
          error => this.finishProcessingRequest(request, error),
        );
      } catch (error) {
        this.finishProcessingRequest(request, error);
      }
    }
  }

  private finishProcessingRequest(
    request: ScheduledRustRequest,
    error: unknown,
    result?: unknown,
  ): void {
    if (request.settled) {
      return;
    }
    request.settled = true;
    const slot = request.slot;
    request.slot = null;
    if (slot && this.activeProcessingRequestsBySlot.get(slot) === request) {
      this.activeProcessingRequestsBySlot.delete(slot);
    }
    if (error) {
      request.reject(error);
    } else {
      request.resolve(result);
    }
    this.dispatchProcessingQueue();
  }

  private cancelProcessingRequest(request: ScheduledRustRequest): void {
    if (request.settled) {
      return;
    }

    const queuedIndex = this.processingQueue.indexOf(request);
    if (queuedIndex >= 0) {
      this.processingQueue.splice(queuedIndex, 1);
    }
    const slot = request.slot;
    request.slot = null;
    request.settled = true;
    request.reject(new CancellationError());
    if (slot && this.activeProcessingRequestsBySlot.get(slot) === request) {
      this.activeProcessingRequestsBySlot.delete(slot);
      this.stopProcessingSlot(
        slot,
        new CancellationError(),
      );
    }
    this.dispatchProcessingQueue();
  }

  private getIdleProcessingSlot(): RustWorkerSlot | null {
    while (this.processingSlots.length < this.options.processingPoolSize) {
      this.processingSlots.push(
        this.createProcessingSlot(`process-${this.processingSlots.length + 1}`),
      );
    }

    for (let offset = 0; offset < this.processingSlots.length; offset += 1) {
      const index = (this.processingSlotCursor + offset) % this.processingSlots.length;
      const slot = this.processingSlots[index];
      if (
        slot.busyCount !== 0 ||
        this.activeProcessingRequestsBySlot.has(slot)
      ) {
        continue;
      }
      this.processingSlotCursor = (index + 1) % this.processingSlots.length;
      return slot;
    }
    return null;
  }

  public async disposeProcessingFile(fileId: string): Promise<void> {
    if (!fileId) return;
    const disposals = this.processingSlots
      .filter((slot) => slot.child && !slot.child.killed)
      .map((slot) =>
        this.sendSlotCommand(slot, "dispose", { fileId }, DISPOSE_TIMEOUT_MS),
      );
    await Promise.allSettled(disposals);
  }

  public stop(): void {
    this.stopProcessingEngines();
  }

  private getExecutablePath(): string {
    const executablePath = this.options.resolveExecutablePath();
    if (!executablePath) {
      throw new Error(formatMissingWorkerMessage(process.platform));
    }

    return executablePath;
  }

  private createProcessingSlot(name: string): RustWorkerSlot {
    return {
      busyCount: 0,
      child: null,
      name,
      pending: new Map(),
      requestId: 0,
      stdoutBuffer: "",
    };
  }

  private ensureProcessingSlot(slot: RustWorkerSlot): ChildProcessWithoutNullStreams {
    if (slot.child && !slot.child.killed) {
      return slot.child;
    }

    const child = this.options.spawnProcessingWorker?.() ??
      spawn(this.getExecutablePath(), ["--stdio-worker"], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
    slot.child = child;
    slot.stdoutBuffer = "";

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      if (slot.child !== child) return;
      slot.stdoutBuffer += String(chunk ?? "");
      while (true) {
        const newlineIndex = slot.stdoutBuffer.indexOf("\n");
        if (newlineIndex < 0) break;
        const line = slot.stdoutBuffer.slice(0, newlineIndex);
        slot.stdoutBuffer = slot.stdoutBuffer.slice(newlineIndex + 1);
        this.handleProcessingSlotLine(slot, line);
      }
    });

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
      if (slot.child !== child) return;
      const text = String(chunk ?? "").trim();
      if (text) console.warn(`[rust:${slot.name}]`, text);
    });

    child.on("error", (error) => {
      if (slot.child !== child) return;
      slot.child = null;
      this.rejectProcessingSlotPending(slot, error);
      this.dispatchProcessingQueue();
    });

    child.on("exit", (code, signal) => {
      if (slot.child !== child) return;
      slot.child = null;
      this.rejectProcessingSlotPending(
        slot,
        new Error(
          `conductor-rs exited (${slot.name}, code=${code ?? "null"} signal=${signal ?? "null"}).`,
        ),
      );
      this.dispatchProcessingQueue();
    });

    return child;
  }

  private sendSlotCommand(
    slot: RustWorkerSlot,
    command: string,
    payload: RustWorkerCommandPayload,
    timeoutMs: number,
  ): Promise<unknown> {
    const child = this.ensureProcessingSlot(slot);
    const id = (slot.requestId += 1);
    const message = JSON.stringify({ id, command, ...payload });
    slot.busyCount += 1;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.stopProcessingSlot(
          slot,
          new Error(`conductor-rs command timed out: ${command}`),
        );
        this.dispatchProcessingQueue();
      }, timeoutMs);

      slot.pending.set(id, { reject, resolve, timeoutId });

      try {
        child.stdin.write(`${message}\n`, "utf8", (error) => {
          if (!error) return;
          slot.pending.delete(id);
          slot.busyCount = Math.max(0, slot.busyCount - 1);
          clearTimeout(timeoutId);
          reject(error);
          this.dispatchProcessingQueue();
        });
      } catch (error) {
        slot.pending.delete(id);
        slot.busyCount = Math.max(0, slot.busyCount - 1);
        clearTimeout(timeoutId);
        reject(error);
        this.dispatchProcessingQueue();
      }
    });
  }

  private handleProcessingSlotLine(slot: RustWorkerSlot, line: string): void {
    const text = String(line ?? "").trim();
    if (!text) return;

    let message: Record<string, unknown> | null = null;
    try {
      message = JSON.parse(text) as Record<string, unknown>;
    } catch (error) {
      console.warn(
        `[rust:${slot.name}] invalid conductor-rs JSON:`,
        (error as Error)?.message || error,
      );
      return;
    }

    const id = Number(message?.id);
    if (!Number.isFinite(id)) return;
    const pending = slot.pending.get(id);
    if (!pending) return;

    slot.pending.delete(id);
    slot.busyCount = Math.max(0, slot.busyCount - 1);
    clearTimeout(pending.timeoutId);

    if (message?.ok === true) {
      pending.resolve(message.result ?? {});
      this.dispatchProcessingQueue();
      return;
    }

    const errorMessage =
      typeof message?.error === "object" &&
      message.error &&
      typeof (message.error as { message?: unknown }).message === "string" &&
      (message.error as { message: string }).message.trim()
        ? (message.error as { message: string }).message
        : "conductor-rs failed.";
    pending.reject(new Error(errorMessage));
    this.dispatchProcessingQueue();
  }

  private rejectProcessingSlotPending(slot: RustWorkerSlot, error: unknown): void {
    for (const pending of slot.pending.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
    }
    slot.pending.clear();
    slot.busyCount = 0;
  }

  private stopProcessingSlot(
    slot: RustWorkerSlot,
    error: unknown = new Error(`conductor-rs stopped (${slot.name}).`),
  ): void {
    if (!slot.child) return;
    const child = slot.child;
    slot.child = null;
    slot.stdoutBuffer = "";
    this.rejectProcessingSlotPending(slot, error);
    this.forceStopChildProcess(child);
  }

  private stopProcessingEngines(): void {
    const stoppedError = new Error("conductor-rs processing host stopped.");
    for (const request of this.processingQueue.splice(0)) {
      if (request.settled) {
        continue;
      }
      request.settled = true;
      request.reject(stoppedError);
    }
    for (const slot of this.processingSlots) {
      this.stopProcessingSlot(slot, stoppedError);
    }
    this.processingSlots.length = 0;
    this.processingSlotCursor = 0;
  }

  private forceStopChildProcess(child: ChildProcessWithoutNullStreams): void {
    const pid = Number(child.pid);
    try {
      child.kill();
    } catch {
      // Fall through to the stronger Windows cleanup below.
    }
    if (!this.options.isWindows || !Number.isFinite(pid) || pid <= 0) return;
    try {
      execFileSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } catch {
      // The process may already be gone.
    }
  }
}
