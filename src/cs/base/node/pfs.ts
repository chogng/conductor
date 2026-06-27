/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { promises as fsPromises } from "node:fs";

export const Promises = new class {
	public async rm(path: string): Promise<void> {
		await fsPromises.rm(path, {
			recursive: true,
			force: true,
			maxRetries: 3,
		});
	}
};
