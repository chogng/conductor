/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { RawContextKey } from "src/cs/platform/contextkey/common/contextkey";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const UpdateContributionId = "workbench.contrib.update";

export const UpdateCommandId = {
  check: "update.check",
  checking: "update.checking",
  downloadNow: "update.downloadNow",
  downloading: "update.downloading",
  install: "update.install",
  restart: "update.restart",
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
};

export const DEFAULT_DESKTOP_UPDATE_STATUS: DesktopUpdateStatus = Object.freeze({
  status: "idle",
  version: null,
  channel: "none",
  isStoreManaged: false,
  message: null,
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
  const status = typeof raw.status === "string" && DESKTOP_UPDATE_STATES.has(raw.status as DesktopUpdateState)
    ? raw.status as DesktopUpdateState
    : fallback.status;
  const channel = typeof raw.channel === "string" && DESKTOP_UPDATE_CHANNELS.has(raw.channel as DesktopUpdateChannel)
    ? raw.channel as DesktopUpdateChannel
    : fallback.channel;
  const version = normalizeNullableString(raw.version);
  const message = normalizeNullableString(raw.message);

  return {
    status,
    version,
    channel,
    isStoreManaged: channel === "store" || raw.isStoreManaged === true,
    message,
  };
};

export const isDesktopUpdateStatusEqual = (
  current: DesktopUpdateStatus,
  next: DesktopUpdateStatus,
): boolean =>
  current.status === next.status &&
  current.version === next.version &&
  current.channel === next.channel &&
  current.isStoreManaged === next.isStoreManaged &&
  current.message === next.message;

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
