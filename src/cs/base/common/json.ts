/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from "./types";

export const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
	isObject(value);
