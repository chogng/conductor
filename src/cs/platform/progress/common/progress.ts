/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'src/cs/platform/instantiation/common/instantiation';

export const IProgressService = createDecorator<IProgressService>('progressService');

export interface IProgressService {
	readonly _serviceBrand: undefined;

	withProgress<R>(
		options: IProgressOptions,
		task: (progress: IProgress<IProgressStep>) => Promise<R>,
		onDidCancel?: () => void,
	): Promise<R>;
}

export const enum ProgressLocation {
	Explorer = 1,
	Scm = 3,
	Extensions = 5,
	Window = 10,
	Notification = 15,
	Dialog = 20,
}

export interface IProgressOptions {
	readonly location: ProgressLocation | string;
	readonly title?: string;
	readonly total?: number;
	readonly cancellable?: boolean | string;
	readonly delay?: number;
}

export interface IProgressStep {
	readonly message?: string;
	readonly increment?: number;
	readonly total?: number;
}

export interface IProgress<T> {
	report(item: T): void;
}

export class Progress<T> implements IProgress<T> {
	private value?: T;

	public constructor(
		private readonly callback: (data: T) => void,
	) {}

	public report(item: T): void {
		this.value = item;
		this.callback(this.value);
	}
}
