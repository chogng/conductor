/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, type Event } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import type {
	IChannel,
	IServerChannel,
} from "../../../base/parts/ipc/common/ipc.js";
import {
	DEFAULT_DESKTOP_UPDATE_STATUS,
	UNSUPPORTED_DESKTOP_UPDATE_STATUS,
	type DesktopUpdateStatus,
	type IUpdateService,
	isDesktopUpdateStatusEqual,
	normalizeDesktopUpdateStatus,
} from "./update.js";

export const UPDATE_CHANNEL_NAME = "update";
const UPDATE_STATUS_EVENT = "onDidChangeStatus";

export class UpdateChannel implements IServerChannel<string> {
	constructor(private readonly updateService: IUpdateService) {}

	public listen<T>(
		_ctx: string,
		event: string,
	): Event<T> {
		if (event === UPDATE_STATUS_EVENT) {
			return this.updateService.onDidChangeStatus as Event<T>;
		}

		throw new Error(`Unknown update event '${event}'.`);
	}

	public call<T>(
		_ctx: string,
		command: string,
		arg?: unknown,
	): Promise<T> {
		switch (command) {
			case "getStatus":
				return Promise.resolve(this.updateService.getStatus() as T);
			case "checkForUpdates":
				return this.updateService.checkForUpdates(
					isObject(arg) ? { manual: arg.manual === true } : undefined,
				) as Promise<T>;
			case "checkForUpdatesAndInstall":
				return this.updateService.checkForUpdatesAndInstall() as Promise<T>;
			case "installDownloadedUpdate":
				return this.updateService.installDownloadedUpdate() as Promise<T>;
			case "applySpecificUpdate":
				return this.updateService.applySpecificUpdate(toPackagePath(arg)) as Promise<T>;
			default:
				throw new Error(`Unknown update command '${command}'.`);
		}
	}
}

export class UpdateChannelClient extends Disposable implements IUpdateService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeStatusEmitter =
		this._register(new Emitter<DesktopUpdateStatus>());
	public readonly onDidChangeStatus = this.onDidChangeStatusEmitter.event;

	private status = DEFAULT_DESKTOP_UPDATE_STATUS;

	constructor(private readonly channel: IChannel) {
		super();

		this._register(this.channel.listen<DesktopUpdateStatus>(
			UPDATE_STATUS_EVENT,
		)(status => this.setStatus(status)));
		void this.channel.call<DesktopUpdateStatus>("getStatus")
			.then(status => this.setStatus(status))
			.catch(() => this.setStatus(UNSUPPORTED_DESKTOP_UPDATE_STATUS));
	}

	public canCheckForUpdates(): boolean {
		return !this.status.isStoreManaged &&
			this.status.status !== "disabled" &&
			this.status.status !== "unsupported";
	}

	public checkForUpdates(
		options: { readonly manual?: boolean } = { manual: true },
	): Promise<unknown> {
		return this.channel.call("checkForUpdates", options);
	}

	public checkForUpdatesAndInstall(): Promise<unknown> {
		return this.channel.call("checkForUpdatesAndInstall");
	}

	public getStatus(): DesktopUpdateStatus {
		return { ...this.status };
	}

	public installDownloadedUpdate(): Promise<unknown> {
		return this.channel.call("installDownloadedUpdate");
	}

	public applySpecificUpdate(packagePath: string): Promise<unknown> {
		return this.channel.call("applySpecificUpdate", packagePath);
	}

	private setStatus(value: unknown): void {
		const nextStatus = normalizeDesktopUpdateStatus(value, this.status);
		if (isDesktopUpdateStatusEqual(this.status, nextStatus)) {
			return;
		}

		this.status = nextStatus;
		this.onDidChangeStatusEmitter.fire(this.getStatus());
	}
}

function toPackagePath(value: unknown): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error("Update package path must not be empty.");
	}

	return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
