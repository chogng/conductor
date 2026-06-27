/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from "src/cs/base/common/network";
import { URI } from "src/cs/base/common/uri";
import {
	IFileService,
	type IFileService as IFileServiceType,
	type IFileStat,
} from "src/cs/platform/files/common/files";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
	INativeHostService,
	type INativeHostService as INativeHostServiceType,
} from "src/cs/platform/native/common/native";
import {
	IElevatedFileService,
	type IElevatedFileService as IElevatedFileServiceType,
} from "src/cs/workbench/services/files/common/elevatedFileService";

export class NativeElevatedFileService implements IElevatedFileServiceType {
	public declare readonly _serviceBrand: undefined;

	public constructor(
		@IFileService private readonly fileService: IFileServiceType,
		@INativeHostService private readonly nativeHostService: INativeHostServiceType,
	) {}

	public isSupported(resource: URI): boolean {
		return URI.revive(resource).scheme === Schemas.file;
	}

	public async writeFileElevated(resource: URI, content: string): Promise<IFileStat> {
		const target = URI.revive(resource);
		if (!this.isSupported(target)) {
			throw new Error(`Elevated file writes are not supported for '${target.scheme}' resources.`);
		}

		const source = await this.createTempSource();
		await this.fileService.writeFile(source, content, { atomic: true });
		try {
			await this.nativeHostService.writeElevated(source, target);
		} finally {
			await this.fileService.deleteFile(source).catch(() => undefined);
		}
		return this.fileService.stat(target);
	}

	private async createTempSource(): Promise<URI> {
		const environment = await this.nativeHostService.getEnvironment();
		const userDataPath = String(environment.userDataPath ?? "").trim();
		if (!userDataPath) {
			throw new Error("Cannot resolve a user data path for elevated file writes.");
		}

		return URI.joinPath(URI.file(userDataPath), `conductor-elevated-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	}
}

registerSingleton(IElevatedFileService, NativeElevatedFileService, InstantiationType.Delayed);
