import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type {
  IRustWorkerHost,
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
};

const DEFAULT_TIMEOUT_MS = 120000;
const DISPOSE_TIMEOUT_MS = 30000;
const RUST_PROCESSING_POOL_MIN_SIZE = 2;
const RUST_PROCESSING_POOL_DEFAULT_MAX_SIZE = 8;
const RUST_PROCESSING_POOL_ENV_MAX_SIZE = 16;

export function resolveRustProcessingPoolSize({
  availableParallelism,
  envValue,
}: {
  readonly availableParallelism: number;
  readonly envValue?: string;
}): number {
  const envPoolSize = Number(envValue);
  if (Number.isFinite(envPoolSize) && envPoolSize > 0) {
    return Math.max(
      1,
      Math.min(RUST_PROCESSING_POOL_ENV_MAX_SIZE, Math.floor(envPoolSize)),
    );
  }

  const coreCount = Number.isFinite(availableParallelism)
    ? Math.max(1, Math.floor(availableParallelism))
    : RUST_PROCESSING_POOL_MIN_SIZE * 2;
  const adaptivePoolSize = Math.floor(coreCount / 2);

  return Math.max(
    RUST_PROCESSING_POOL_MIN_SIZE,
    Math.min(RUST_PROCESSING_POOL_DEFAULT_MAX_SIZE, adaptivePoolSize),
  );
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

  private previewChild: ChildProcessWithoutNullStreams | null = null;
  private previewStdoutBuffer = "";
  private previewRequestId = 0;
  private readonly previewPending = new Map<number, PendingRustRequest>();
  private readonly processingSlots: RustWorkerSlot[] = [];
  private processingSlotCursor = 0;

  constructor(private readonly options: RustWorkerHostOptions) {}

  public sendCommand(
    command: string,
    payload: RustWorkerCommandPayload = {},
    options: RustWorkerCommandOptions = {},
  ): Promise<unknown> {
    return this.sendPreviewCommand(command, payload, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  public sendProcessingCommand(
    command: string,
    payload: RustWorkerCommandPayload = {},
    options: RustWorkerCommandOptions = {},
  ): Promise<unknown> {
    const slot = this.getProcessingSlot();
    return this.sendSlotCommand(
      slot,
      command,
      payload,
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
  }

  public async clear(): Promise<void> {
    await this.sendCommand("clear", {}, { timeoutMs: DISPOSE_TIMEOUT_MS });
  }

  public async disposeFile(fileId: string): Promise<void> {
    if (!fileId) return;
    const [previewDispose] = await Promise.allSettled([
      this.sendCommand("dispose", { fileId }, { timeoutMs: DISPOSE_TIMEOUT_MS }),
      this.disposeProcessingFile(fileId),
    ]);
    if (previewDispose.status === "rejected") {
      throw previewDispose.reason;
    }
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
    this.stopPreviewEngine();
  }

  private getExecutablePath(): string {
    const executablePath = this.options.resolveExecutablePath();
    if (!executablePath) {
      throw new Error(formatMissingWorkerMessage(process.platform));
    }

    return executablePath;
  }

  private ensurePreviewEngine(): ChildProcessWithoutNullStreams {
    if (this.previewChild && !this.previewChild.killed) {
      return this.previewChild;
    }

    const child = spawn(this.getExecutablePath(), ["--stdio-worker"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.previewChild = child;
    this.previewStdoutBuffer = "";

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      this.previewStdoutBuffer += String(chunk ?? "");
      while (true) {
        const newlineIndex = this.previewStdoutBuffer.indexOf("\n");
        if (newlineIndex < 0) break;
        const line = this.previewStdoutBuffer.slice(0, newlineIndex);
        this.previewStdoutBuffer = this.previewStdoutBuffer.slice(newlineIndex + 1);
        this.handlePreviewLine(line);
      }
    });

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk ?? "").trim();
      if (text) console.warn("[rust]", text);
    });

    child.on("error", (error) => {
      if (this.previewChild === child) this.previewChild = null;
      this.rejectPreviewPending(error);
    });

    child.on("exit", (code, signal) => {
      if (this.previewChild === child) this.previewChild = null;
      this.rejectPreviewPending(
        new Error(
          `conductor-rs exited (code=${code ?? "null"} signal=${signal ?? "null"}).`,
        ),
      );
    });

    return child;
  }

  private sendPreviewCommand(
    command: string,
    payload: RustWorkerCommandPayload,
    timeoutMs: number,
  ): Promise<unknown> {
    const child = this.ensurePreviewEngine();
    const id = (this.previewRequestId += 1);
    const message = JSON.stringify({ id, command, ...payload });

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.previewPending.delete(id);
        reject(new Error(`conductor-rs command timed out: ${command}`));
      }, timeoutMs);

      this.previewPending.set(id, { reject, resolve, timeoutId });

      try {
        child.stdin.write(`${message}\n`, "utf8", (error) => {
          if (!error) return;
          this.previewPending.delete(id);
          clearTimeout(timeoutId);
          reject(error);
        });
      } catch (error) {
        this.previewPending.delete(id);
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  private handlePreviewLine(line: string): void {
    const text = String(line ?? "").trim();
    if (!text) return;

    let message: Record<string, unknown> | null = null;
    try {
      message = JSON.parse(text) as Record<string, unknown>;
    } catch (error) {
      console.warn("[rust] invalid conductor-rs JSON:", (error as Error)?.message || error);
      return;
    }

    const id = Number(message?.id);
    if (!Number.isFinite(id)) return;
    const pending = this.previewPending.get(id);
    if (!pending) return;

    this.previewPending.delete(id);
    clearTimeout(pending.timeoutId);

    if (message?.ok === true) {
      pending.resolve(message.result ?? {});
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
  }

  private rejectPreviewPending(error: unknown): void {
    for (const pending of this.previewPending.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
    }
    this.previewPending.clear();
  }

  private stopPreviewEngine(): void {
    if (!this.previewChild) return;
    const child = this.previewChild;
    this.previewChild = null;
    this.previewStdoutBuffer = "";
    this.rejectPreviewPending(new Error("conductor-rs stopped."));
    this.forceStopChildProcess(child);
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

    const child = spawn(this.getExecutablePath(), ["--stdio-worker"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    slot.child = child;
    slot.stdoutBuffer = "";

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
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
      const text = String(chunk ?? "").trim();
      if (text) console.warn(`[rust:${slot.name}]`, text);
    });

    child.on("error", (error) => {
      if (slot.child === child) slot.child = null;
      this.rejectProcessingSlotPending(slot, error);
    });

    child.on("exit", (code, signal) => {
      if (slot.child === child) slot.child = null;
      this.rejectProcessingSlotPending(
        slot,
        new Error(
          `conductor-rs exited (${slot.name}, code=${code ?? "null"} signal=${signal ?? "null"}).`,
        ),
      );
    });

    return child;
  }

  private getProcessingSlot(): RustWorkerSlot {
    while (this.processingSlots.length < this.options.processingPoolSize) {
      this.processingSlots.push(
        this.createProcessingSlot(`process-${this.processingSlots.length + 1}`),
      );
    }

    let selected = this.processingSlots[0];
    for (let offset = 0; offset < this.processingSlots.length; offset += 1) {
      const index = (this.processingSlotCursor + offset) % this.processingSlots.length;
      const slot = this.processingSlots[index];
      if (slot.busyCount < selected.busyCount) {
        selected = slot;
      }
    }

    this.processingSlotCursor =
      (this.processingSlots.indexOf(selected) + 1) % this.processingSlots.length;
    return selected;
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
        slot.pending.delete(id);
        slot.busyCount = Math.max(0, slot.busyCount - 1);
        reject(new Error(`conductor-rs command timed out: ${command}`));
      }, timeoutMs);

      slot.pending.set(id, { reject, resolve, timeoutId });

      try {
        child.stdin.write(`${message}\n`, "utf8", (error) => {
          if (!error) return;
          slot.pending.delete(id);
          slot.busyCount = Math.max(0, slot.busyCount - 1);
          clearTimeout(timeoutId);
          reject(error);
        });
      } catch (error) {
        slot.pending.delete(id);
        slot.busyCount = Math.max(0, slot.busyCount - 1);
        clearTimeout(timeoutId);
        reject(error);
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
  }

  private rejectProcessingSlotPending(slot: RustWorkerSlot, error: unknown): void {
    for (const pending of slot.pending.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
    }
    slot.pending.clear();
    slot.busyCount = 0;
  }

  private stopProcessingSlot(slot: RustWorkerSlot): void {
    if (!slot.child) return;
    const child = slot.child;
    slot.child = null;
    slot.stdoutBuffer = "";
    this.rejectProcessingSlotPending(
      slot,
      new Error(`conductor-rs stopped (${slot.name}).`),
    );
    this.forceStopChildProcess(child);
  }

  private stopProcessingEngines(): void {
    for (const slot of this.processingSlots) {
      this.stopProcessingSlot(slot);
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
