/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export type WebWorkerModuleLocation = string | URL | (() => string | URL);

export class WebWorkerDescriptor {
	public readonly esmModuleLocationBundler: WebWorkerModuleLocation;
	public readonly label: string;

	public constructor(args: {
		readonly esmModuleLocationBundler: WebWorkerModuleLocation;
		readonly label: string;
	}) {
		this.esmModuleLocationBundler = args.esmModuleLocationBundler;
		this.label = args.label;
	}
}
