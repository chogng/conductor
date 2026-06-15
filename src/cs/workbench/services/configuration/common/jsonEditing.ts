/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from "src/cs/base/common/uri";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const IJSONEditingService = createDecorator<IJSONEditingService>("jsonEditingService");

export const enum JSONEditingErrorCode {
	ERROR_INVALID_FILE = 0,
}

export class JSONEditingError extends Error {
	public constructor(
		public readonly code: JSONEditingErrorCode,
		message: string,
	) {
		super(message);
		this.name = "JSONEditingError";
	}
}

export type JSONPath = readonly (string | number)[];

export type IJSONValue = {
	readonly path: JSONPath;
	readonly value: unknown;
};

export interface IJSONEditingService {
	readonly _serviceBrand: undefined;

	write(resource: URI, values: readonly IJSONValue[], save: boolean): Promise<void>;
}
