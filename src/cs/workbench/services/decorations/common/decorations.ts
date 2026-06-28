/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { CancellationToken } from "src/cs/base/common/cancellation";
import type { URI } from "src/cs/base/common/uri";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const IDecorationsService = createDecorator<IDecorationsService>("decorationsService");

export type DecorationColorIdentifier = string;

export type IDecorationData = {
	readonly weight?: number;
	readonly color?: DecorationColorIdentifier;
	readonly letter?: string;
	readonly tooltip?: string;
	readonly strikethrough?: boolean;
	readonly bubble?: boolean;
};

export type IDecoration = IDisposable & {
	readonly tooltip: string;
	readonly strikethrough: boolean;
	readonly labelClassName: string;
	readonly badgeClassName: string;
	readonly iconClassName: string;
	readonly data: readonly IDecorationData[];
};

export interface IDecorationsProvider {
	readonly label: string;
	readonly onDidChange: Event<readonly URI[] | undefined>;
	provideDecorations(
		uri: URI,
		token: CancellationToken,
	): IDecorationData | Promise<IDecorationData | undefined> | undefined;
}

export interface IResourceDecorationChangeEvent {
	affectsResource(uri: URI): boolean;
}

export interface IDecorationsService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeDecorations: Event<IResourceDecorationChangeEvent>;

	registerDecorationsProvider(provider: IDecorationsProvider): IDisposable;
	getDecoration(uri: URI, includeChildren: boolean): IDecoration | undefined;
	getDecorationData(uri: URI, includeChildren: boolean): readonly IDecorationData[];
}
