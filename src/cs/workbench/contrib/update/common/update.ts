/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { RawContextKey } from "src/cs/platform/contextkey/common/contextkey";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const UpdateContributionId = "workbench.contrib.update";

export const UpdateCommandId = {
  applyUpdate: "_update.applyupdate",
  check: "update.check",
  checking: "update.checking",
  downloadNow: "update.downloadNow",
  downloading: "update.downloading",
  install: "update.install",
  restart: "update.restart",
  showCurrentReleaseNotes: "update.showCurrentReleaseNotes",
  state: "_update.state",
  updating: "update.updating",
} as const;

export type UpdateCommandId = typeof UpdateCommandId[keyof typeof UpdateCommandId];

export type DesktopUpdateChannel =
  | "github"
  | "generic"
  | "store"
  | "none"
  | "unsupported";

export type DesktopUpdateState =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "updating"
  | "error"
  | "disabled"
  | "unsupported";

/**
 * Renderer snapshot of the main-process updater. The main process produces the
 * raw payload; IWorkbenchUpdateService owns the normalized workbench state.
 */
export type DesktopUpdateStatus = {
  readonly status: DesktopUpdateState;
  readonly version: string | null;
  readonly channel: DesktopUpdateChannel;
  readonly isStoreManaged: boolean;
  readonly message: string | null;
  readonly progressPercent: number | null;
};

export const DEFAULT_DESKTOP_UPDATE_STATUS: DesktopUpdateStatus = Object.freeze({
  status: "idle",
  version: null,
  channel: "none",
  isStoreManaged: false,
  message: null,
  progressPercent: null,
});

export const CONTEXT_UPDATE_STATE = new RawContextKey<DesktopUpdateState>(
  "updateState",
  DEFAULT_DESKTOP_UPDATE_STATUS.status,
);

export const IWorkbenchUpdateService =
  createDecorator<IWorkbenchUpdateService>("workbenchUpdateService");

export interface IWorkbenchUpdateService {
  readonly _serviceBrand: undefined;

  readonly onDidChangeStatus: Event<DesktopUpdateStatus>;

  canCheckForUpdates(): boolean;
  checkForUpdates(): Promise<unknown>;
  checkForUpdatesAndInstall(): Promise<unknown>;
  getStatus(): DesktopUpdateStatus;
  installDownloadedUpdate(): Promise<unknown>;
  applySpecificUpdate(packagePath: string): Promise<unknown>;
}

const DESKTOP_UPDATE_STATES = new Set<DesktopUpdateState>([
  "idle",
  "checking",
  "available",
  "downloading",
  "downloaded",
  "updating",
  "error",
  "disabled",
  "unsupported",
]);

const DESKTOP_UPDATE_CHANNELS = new Set<DesktopUpdateChannel>([
  "github",
  "generic",
  "store",
  "none",
  "unsupported",
]);

export const normalizeDesktopUpdateStatus = (
  value: unknown,
  fallback: DesktopUpdateStatus = DEFAULT_DESKTOP_UPDATE_STATUS,
): DesktopUpdateStatus => {
  const raw = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const status = isDesktopUpdateState(raw.status)
    ? raw.status
    : fallback.status;
  const channel = isDesktopUpdateChannel(raw.channel)
    ? raw.channel
    : fallback.channel;
  const version = normalizeNullableString(raw.version);
  const message = normalizeNullableString(raw.message);
  const progressPercent = normalizeProgressPercent(raw.progressPercent);

  return {
    status,
    version,
    channel,
    isStoreManaged: channel === "store" || raw.isStoreManaged === true,
    message,
    progressPercent,
  };
};

const isDesktopUpdateState = (value: unknown): value is DesktopUpdateState =>
  typeof value === "string" && DESKTOP_UPDATE_STATES.has(value as DesktopUpdateState);

const isDesktopUpdateChannel = (value: unknown): value is DesktopUpdateChannel =>
  typeof value === "string" && DESKTOP_UPDATE_CHANNELS.has(value as DesktopUpdateChannel);

export const isDesktopUpdateStatusEqual = (
  current: DesktopUpdateStatus,
  next: DesktopUpdateStatus,
): boolean =>
  current.status === next.status &&
  current.version === next.version &&
  current.channel === next.channel &&
  current.isStoreManaged === next.isStoreManaged &&
  current.message === next.message &&
  current.progressPercent === next.progressPercent;

export const isDesktopUpdateReadyToInstall = (
  status: DesktopUpdateStatus,
): boolean => status.status === "downloaded";

const normalizeNullableString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
};

const normalizeProgressPercent = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
};
