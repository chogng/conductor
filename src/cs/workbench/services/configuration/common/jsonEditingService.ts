/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { isObjectRecord } from "src/cs/base/common/json";
import { parse as parseJsonc } from "src/cs/base/common/jsonc";
import type { URI } from "src/cs/base/common/uri";
import { IFileService } from "src/cs/platform/files/common/files";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
	IJSONEditingService,
	JSONEditingError,
	JSONEditingErrorCode,
	type IJSONValue,
	type JSONPath,
} from "src/cs/workbench/services/configuration/common/jsonEditing";

type JsonContainer = Record<string, unknown> | unknown[];

const createContainerForSegment = (segment: string | number): JsonContainer =>
	typeof segment === "number" ? [] : {};

export class JSONEditingService implements IJSONEditingService {
	public declare readonly _serviceBrand: undefined;

	private queue = Promise.resolve();

	public constructor(
		@IFileService private readonly fileService: IFileService,
	) {}

	public write(resource: URI, values: readonly IJSONValue[], _save: boolean): Promise<void> {
		const operation = this.queue.then(() => this.doWrite(resource, values));
		this.queue = operation.catch(() => undefined);
		return operation;
	}

	private async doWrite(resource: URI, values: readonly IJSONValue[]): Promise<void> {
		const current = await this.read(resource);
		let next: unknown = current;

		for (const value of values) {
			next = setJSONValue(next, value.path, value.value);
		}

		await this.fileService.writeFile(resource, `${JSON.stringify(next, null, 2)}\n`);
	}

	private async read(resource: URI): Promise<unknown> {
		if (!await this.fileService.exists(resource)) {
			return {};
		}

		const content = await this.fileService.readFile(resource);
		const raw = new TextDecoder().decode(content.value).trim();
		if (!raw) {
			return {};
		}

		try {
			return parseJsonc(raw);
		} catch {
			throw new JSONEditingError(
				JSONEditingErrorCode.ERROR_INVALID_FILE,
				`Unable to write JSON because the file contains invalid JSON: ${resource.toString()}`,
			);
		}
	}
}

function setJSONValue(source: unknown, path: JSONPath, value: unknown): unknown {
	if (!path.length) {
		return value;
	}

	const root = ensureContainer(source, path[0]);
	setJSONValueAtPath(root, path, value);
	return root;
}

function setJSONValueAtPath(target: JsonContainer, path: JSONPath, value: unknown): void {
	const [segment, ...rest] = path;

	if (!rest.length) {
		if (Array.isArray(target) && typeof segment === "number") {
			if (value === undefined) {
				target.splice(segment, 1);
			} else {
				target[segment] = value;
			}
			return;
		}

		if (!Array.isArray(target)) {
			if (value === undefined) {
				delete target[String(segment)];
			} else {
				target[String(segment)] = value;
			}
		}
		return;
	}

	const child = getOrCreateChildContainer(target, segment, rest[0]);
	setJSONValueAtPath(child, rest, value);
}

function ensureContainer(source: unknown, nextSegment: string | number): JsonContainer {
	if (Array.isArray(source) || isObjectRecord(source)) {
		return source;
	}

	return createContainerForSegment(nextSegment);
}

function getOrCreateChildContainer(
	target: JsonContainer,
	segment: string | number,
	nextSegment: string | number,
): JsonContainer {
	if (Array.isArray(target) && typeof segment === "number") {
		const existing = target[segment];
		if (Array.isArray(existing) || isObjectRecord(existing)) {
			return existing;
		}

		const child = createContainerForSegment(nextSegment);
		target[segment] = child;
		return child;
	}

	if (!Array.isArray(target)) {
		const key = String(segment);
		const existing = target[key];
		if (Array.isArray(existing) || isObjectRecord(existing)) {
			return existing;
		}

		const child = createContainerForSegment(nextSegment);
		target[key] = child;
		return child;
	}

	return createContainerForSegment(nextSegment);
}

registerSingleton(IJSONEditingService, JSONEditingService, InstantiationType.Delayed);
