/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { isThenable } from "src/cs/base/common/async";
import { CancellationTokenSource } from "src/cs/base/common/cancellation";
import { isCancellationError } from "src/cs/base/common/errors";
import { DebounceEmitter, Emitter, type Event } from "src/cs/base/common/event";
import { DisposableStore, toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { ResourceTree } from "src/cs/base/common/resourceTree";
import { extUri } from "src/cs/base/common/resources";
import type { URI } from "src/cs/base/common/uri";
import { LinkedList } from "src/cs/base/common/linkedList";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
	IDecorationsService,
	type IDecoration,
	type IDecorationData,
	type IDecorationsProvider,
	type IResourceDecorationChangeEvent,
} from "src/cs/workbench/services/decorations/common/decorations";

class ResourceDecorationChangeEvent implements IResourceDecorationChangeEvent {
	private readonly treesByRootKey: Map<string, ResourceTree<true, undefined>> | null;
	private readonly rootResourceKeys = new Set<string>();

	public constructor(
		resources: readonly URI[] | undefined,
	) {
		if (!resources) {
			this.treesByRootKey = null;
			return;
		}

		this.treesByRootKey = new Map();
		for (const resource of resources) {
			const root = getResourceTreeRoot(resource);
			const rootKey = getResourceKey(root);
			let tree = this.treesByRootKey.get(rootKey);
			if (!tree) {
				tree = new ResourceTree<true, undefined>(undefined, root);
				this.treesByRootKey.set(rootKey, tree);
			}

			if (extUri.isEqual(resource, root)) {
				this.rootResourceKeys.add(getResourceKey(resource));
			} else {
				tree.add(resource, true);
			}
		}
	}

	public affectsResource(uri: URI): boolean {
		if (!this.treesByRootKey) {
			return true;
		}

		if (this.rootResourceKeys.has(getResourceKey(uri))) {
			return true;
		}

		const tree = this.treesByRootKey.get(getResourceKey(getResourceTreeRoot(uri)));
		const node = tree?.getNode(uri);
		return Boolean(node && (node.element || node.childrenCount > 0));
	}
}

class DecorationDataRequest {
	public constructor(
		public readonly source: CancellationTokenSource,
		public readonly thenable: Promise<void>,
	) {}
}

type DecorationEntry = Map<IDecorationsProvider, DecorationDataRequest | IDecorationData | null>;

export class DecorationsService implements IDecorationsService {
	public declare readonly _serviceBrand: undefined;

	private readonly store = new DisposableStore();
	private readonly onDidChangeDecorationsEmitter = this.store.add(new Emitter<IResourceDecorationChangeEvent>());
	public readonly onDidChangeDecorations: Event<IResourceDecorationChangeEvent> =
		this.onDidChangeDecorationsEmitter.event;

	private readonly providers = new LinkedList<IDecorationsProvider>();
	private readonly data = new Map<string, { readonly uri: URI; readonly entry: DecorationEntry }>();
	private readonly onDidChangeDecorationsDelayed = this.store.add(new DebounceEmitter<readonly URI[] | undefined>({
		delay: 0,
		merge: mergeDecorationChangeEvents,
	}));

	public constructor() {
		this.store.add(this.onDidChangeDecorationsDelayed.event(resources => {
			this.onDidChangeDecorationsEmitter.fire(new ResourceDecorationChangeEvent(resources));
		}));
	}

	public dispose(): void {
		this.store.dispose();
		for (const { entry } of this.data.values()) {
			for (const value of entry.values()) {
				if (value instanceof DecorationDataRequest) {
					value.source.cancel();
					value.source.dispose();
				}
			}
		}
		this.data.clear();
		this.providers.clear();
	}

	public registerDecorationsProvider(provider: IDecorationsProvider): IDisposable {
		const removeProvider = this.providers.unshift(provider);
		this.onDidChangeDecorationsEmitter.fire(new ResourceDecorationChangeEvent(undefined));

		const removeAll = (): void => {
			const changedResources: URI[] = [];
			for (const [key, item] of this.data) {
				const value = item.entry.get(provider);
				if (value instanceof DecorationDataRequest) {
					value.source.cancel();
					value.source.dispose();
				}
				if (item.entry.delete(provider)) {
					changedResources.push(item.uri);
				}
				if (item.entry.size === 0) {
					this.data.delete(key);
				}
			}
			if (changedResources.length > 0) {
				this.onDidChangeDecorationsDelayed.fire(changedResources);
			}
		};

		const listener = provider.onDidChange(resources => {
			if (!resources) {
				removeAll();
				this.onDidChangeDecorationsDelayed.fire(undefined);
				return;
			}

			for (const resource of resources) {
				const entry = this.ensureEntry(resource);
				this.fetchData(entry, resource, provider);
			}
		});

		return toDisposable(() => {
			removeProvider();
			listener.dispose();
			removeAll();
		});
	}

	public getDecoration(uri: URI, includeChildren: boolean): IDecoration | undefined {
		const data = this.getDecorationData(uri, includeChildren);
		if (data.length === 0) {
			return undefined;
		}

		const sortedData = [...data].sort((first, second) => (second.weight ?? 0) - (first.weight ?? 0));
		const tooltip = distinctStrings(sortedData
			.map(item => item.tooltip)
			.filter((value): value is string => Boolean(String(value ?? "").trim())))
			.join(" - ");
		const key = createDecorationClassKey(sortedData);
		return {
			badgeClassName: `decoration-badge-${key}`,
			data: sortedData,
			dispose: () => undefined,
			iconClassName: `decoration-icon-${key}`,
			labelClassName: `decoration-label-${key}`,
			strikethrough: sortedData.some(item => item.strikethrough === true),
			tooltip,
		};
	}

	public getDecorationData(uri: URI, includeChildren: boolean): readonly IDecorationData[] {
		const result: IDecorationData[] = [];
		const entry = this.ensureEntry(uri);
		this.collectEntryData(uri, entry, result, false);

		if (includeChildren) {
			for (const item of this.data.values()) {
				if (extUri.isEqual(item.uri, uri) || !extUri.isEqualOrParent(item.uri, uri)) {
					continue;
				}
				this.collectEntryData(item.uri, item.entry, result, true);
			}
		}

		return result.sort((first, second) => (second.weight ?? 0) - (first.weight ?? 0));
	}

	private collectEntryData(
		uri: URI,
		entry: DecorationEntry,
		result: IDecorationData[],
		onlyBubble: boolean,
	): void {
		for (const provider of this.providers) {
			let data = entry.get(provider);
			if (data === undefined) {
				data = this.fetchData(entry, uri, provider);
			}
			if (data && !(data instanceof DecorationDataRequest) && (!onlyBubble || data.bubble === true)) {
				result.push(data);
			}
		}
	}

	private ensureEntry(uri: URI): DecorationEntry {
		const key = getResourceKey(uri);
		let item = this.data.get(key);
		if (!item) {
			item = { uri, entry: new Map() };
			this.data.set(key, item);
		}
		return item.entry;
	}

	private fetchData(
		entry: DecorationEntry,
		uri: URI,
		provider: IDecorationsProvider,
	): IDecorationData | DecorationDataRequest | null {
		const pending = entry.get(provider);
		if (pending instanceof DecorationDataRequest) {
			pending.source.cancel();
			pending.source.dispose();
			entry.delete(provider);
		}

		const source = new CancellationTokenSource();
		const dataOrThenable = provider.provideDecorations(uri, source.token);
		if (!isThenable<IDecorationData | undefined>(dataOrThenable)) {
			source.dispose();
			return this.keepItem(entry, provider, uri, dataOrThenable);
		}

		const request = new DecorationDataRequest(
			source,
			Promise.resolve(dataOrThenable)
				.then(data => {
					if (entry.get(provider) === request) {
						this.keepItem(entry, provider, uri, data);
					}
				})
				.catch(error => {
					if (!isCancellationError(error) && entry.get(provider) === request) {
						entry.delete(provider);
					}
				})
				.finally(() => source.dispose()),
		);
		entry.set(provider, request);
		return request;
	}

	private keepItem(
		entry: DecorationEntry,
		provider: IDecorationsProvider,
		uri: URI,
		data: IDecorationData | undefined,
	): IDecorationData | null {
		const decoration = data ?? null;
		const previous = entry.get(provider);
		entry.set(provider, decoration);
		if (decoration || previous) {
			this.onDidChangeDecorationsDelayed.fire([uri]);
		}
		return decoration;
	}
}

const getResourceKey = (
	uri: URI,
): string => extUri.getComparisonKey(uri, false);

const getResourceTreeRoot = (
	uri: URI,
): URI => uri.with({ path: "/" });

const distinctStrings = (
	values: readonly string[],
): readonly string[] => {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const value of values) {
		if (seen.has(value)) {
			continue;
		}
		seen.add(value);
		result.push(value);
	}
	return result;
};

const mergeDecorationChangeEvents = (
	events: readonly (readonly URI[] | undefined)[],
): readonly URI[] | undefined => {
	const resources: URI[] = [];
	for (const event of events) {
		if (!event) {
			return undefined;
		}
		resources.push(...event);
	}
	return resources;
};

const createDecorationClassKey = (
	data: readonly IDecorationData[],
): string => {
	let hash = 0;
	for (const part of data.flatMap(item => [
		item.color ?? "",
		item.letter ?? "",
		item.tooltip ?? "",
		item.strikethrough === true ? "1" : "0",
		item.bubble === true ? "1" : "0",
	])) {
		for (let index = 0; index < part.length; index += 1) {
			hash = ((hash << 5) - hash + part.charCodeAt(index)) | 0;
		}
	}
	return Math.abs(hash).toString(36);
};

registerSingleton(IDecorationsService, DecorationsService, InstantiationType.Delayed);
