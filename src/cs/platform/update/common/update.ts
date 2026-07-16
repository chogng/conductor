/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "../../../base/common/event.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";

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

export interface DesktopUpdateStatus {
	readonly status: DesktopUpdateState;
	readonly version: string | null;
	readonly channel: DesktopUpdateChannel;
	readonly isStoreManaged: boolean;
	readonly message: string | null;
	readonly progressPercent: number | null;
}

export const DEFAULT_DESKTOP_UPDATE_STATUS: DesktopUpdateStatus = Object.freeze({
	status: "idle",
	version: null,
	channel: "none",
	isStoreManaged: false,
	message: null,
	progressPercent: null,
});

export const UNSUPPORTED_DESKTOP_UPDATE_STATUS: DesktopUpdateStatus = Object.freeze({
	status: "unsupported",
	version: null,
	channel: "unsupported",
	isStoreManaged: false,
	message: null,
	progressPercent: null,
});

export const IUpdateService = createDecorator<IUpdateService>("updateService");

export interface IUpdateService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeStatus: Event<DesktopUpdateStatus>;

	canCheckForUpdates(): boolean;
	checkForUpdates(options?: { readonly manual?: boolean }): Promise<unknown>;
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

export function normalizeDesktopUpdateStatus(
	value: unknown,
	fallback: DesktopUpdateStatus = DEFAULT_DESKTOP_UPDATE_STATUS,
): DesktopUpdateStatus {
	const raw = value && typeof value === "object"
		? value as Record<string, unknown>
		: {};
	const status = isDesktopUpdateState(raw.status)
		? raw.status
		: fallback.status;
	const channel = isDesktopUpdateChannel(raw.channel)
		? raw.channel
		: fallback.channel;

	return {
		status,
		version: normalizeNullableString(raw.version),
		channel,
		isStoreManaged: channel === "store" || raw.isStoreManaged === true,
		message: normalizeNullableString(raw.message),
		progressPercent: normalizeProgressPercent(raw.progressPercent),
	};
}

export function isDesktopUpdateStatusEqual(
	current: DesktopUpdateStatus,
	next: DesktopUpdateStatus,
): boolean {
	return current.status === next.status &&
		current.version === next.version &&
		current.channel === next.channel &&
		current.isStoreManaged === next.isStoreManaged &&
		current.message === next.message &&
		current.progressPercent === next.progressPercent;
}

function isDesktopUpdateState(value: unknown): value is DesktopUpdateState {
	return typeof value === "string" &&
		DESKTOP_UPDATE_STATES.has(value as DesktopUpdateState);
}

function isDesktopUpdateChannel(value: unknown): value is DesktopUpdateChannel {
	return typeof value === "string" &&
		DESKTOP_UPDATE_CHANNELS.has(value as DesktopUpdateChannel);
}

function normalizeNullableString(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed || null;
}

function normalizeProgressPercent(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return null;
	}

	return Math.max(0, Math.min(100, Math.round(value)));
}
