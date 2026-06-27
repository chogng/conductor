/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { extUri as defaultExtUri, type IExtUri } from "./resources.js";
import { memoize } from "./decorators.js";
import { URI } from "./uri.js";

export interface IResourceNode<T, C = void> {
	readonly uri: URI;
	readonly relativePath: string;
	readonly name: string;
	readonly element: T | undefined;
	readonly children: Iterable<IResourceNode<T, C>>;
	readonly childrenCount: number;
	readonly parent: IResourceNode<T, C> | undefined;
	readonly context: C;
	get(childName: string): IResourceNode<T, C> | undefined;
}

class ResourceNode<T, C> implements IResourceNode<T, C> {
	private readonly childrenByName = new Map<string, ResourceNode<T, C>>();

	public get childrenCount(): number {
		return this.childrenByName.size;
	}

	public get children(): Iterable<ResourceNode<T, C>> {
		return this.childrenByName.values();
	}

	@memoize
	public get name(): string {
		return basename(this.relativePath);
	}

	public constructor(
		public readonly uri: URI,
		public readonly relativePath: string,
		public readonly context: C,
		public element: T | undefined = undefined,
		public readonly parent: IResourceNode<T, C> | undefined = undefined,
	) {}

	public get(path: string): ResourceNode<T, C> | undefined {
		return this.childrenByName.get(path);
	}

	public set(path: string, child: ResourceNode<T, C>): void {
		this.childrenByName.set(path, child);
	}

	public delete(path: string): void {
		this.childrenByName.delete(path);
	}

	public clear(): void {
		this.childrenByName.clear();
	}
}

function basename(path: string): string {
	const trimmed = path.replace(/\/+$/, "");
	const index = trimmed.lastIndexOf("/");
	return index === -1 ? trimmed : trimmed.slice(index + 1);
}

function splitPath(path: string): string[] {
	return path
		.replace(/\/+$/, "")
		.split("/")
		.filter(segment => segment.length > 0);
}

function collect<T, C>(node: IResourceNode<T, C>, result: T[]): T[] {
	if (typeof node.element !== "undefined") {
		result.push(node.element);
	}

	for (const child of node.children) {
		collect(child, result);
	}

	return result;
}

export class ResourceTree<T extends NonNullable<unknown>, C = void> {
	public readonly root: ResourceNode<T, C>;

	public static getRoot<T, C>(node: IResourceNode<T, C>): IResourceNode<T, C> {
		while (node.parent) {
			node = node.parent;
		}

		return node;
	}

	public static collect<T, C>(node: IResourceNode<T, C>): T[] {
		return collect(node, []);
	}

	public static isResourceNode<T, C>(obj: unknown): obj is IResourceNode<T, C> {
		return obj instanceof ResourceNode;
	}

	public constructor(
		context: C,
		rootURI: URI = URI.file("/"),
		private readonly extUri: IExtUri = defaultExtUri,
	) {
		this.root = new ResourceNode(rootURI, "", context);
	}

	public add(uri: URI, element: T): void {
		const segments = this.getSegments(uri);
		let node = this.root;
		let path = "";

		for (let index = 0; index < segments.length; index += 1) {
			const name = segments[index];
			path = `${path}/${name}`;
			let child = node.get(name);

			if (!child) {
				child = new ResourceNode(
					this.extUri.joinPath(this.root.uri, path),
					path,
					this.root.context,
					index === segments.length - 1 ? element : undefined,
					node,
				);
				node.set(name, child);
			} else if (index === segments.length - 1) {
				child.element = element;
			}

			node = child;
		}
	}

	public delete(uri: URI): T | undefined {
		const segments = this.getSegments(uri);
		if (segments.length === 0) {
			return undefined;
		}

		return this.deleteSegments(this.root, segments, 0);
	}

	public clear(): void {
		this.root.clear();
	}

	public getNode(uri: URI): IResourceNode<T, C> | undefined {
		const segments = this.getSegments(uri);
		let node: ResourceNode<T, C> | undefined = this.root;

		for (const segment of segments) {
			node = node.get(segment);
			if (!node) {
				return undefined;
			}
		}

		return node;
	}

	private deleteSegments(
		node: ResourceNode<T, C>,
		segments: readonly string[],
		index: number,
	): T | undefined {
		const name = segments[index];
		const child = node.get(name);
		if (!child) {
			return undefined;
		}

		if (index < segments.length - 1) {
			const result = this.deleteSegments(child, segments, index + 1);
			if (typeof result !== "undefined" && child.childrenCount === 0) {
				node.delete(name);
			}
			return result;
		}

		node.delete(name);
		return child.element;
	}

	private getSegments(uri: URI): string[] {
		const key = this.extUri.relativePath(this.root.uri, uri) || uri.path;
		return splitPath(key);
	}
}
