/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { strFromU8, strToU8, unzipSync, zipSync, type Unzipped, type ZipOptions, type Zippable } from "fflate";

export type ZipEntryContent = string | Uint8Array<ArrayBufferLike>;

export type ZipEntry = {
	readonly path: string;
	readonly contents: ZipEntryContent;
};

export function normalizeZipEntryPath(path: string): string {
	return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function createZipBuffer(
	entries: readonly ZipEntry[],
	options: Pick<ZipOptions, "level"> = {},
): Uint8Array<ArrayBuffer> {
	const zippable: Zippable = {};
	for (const entry of entries) {
		zippable[normalizeZipEntryPath(entry.path)] = typeof entry.contents === "string"
			? strToU8(entry.contents)
			: entry.contents;
	}

	return zipSync(zippable, {
		level: options.level ?? 6,
	});
}

export function readZipEntries(bytes: ArrayBuffer | Uint8Array): ReadonlyMap<string, Uint8Array<ArrayBuffer>> {
	const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	const entries: Unzipped = unzipSync(data);
	return new Map(Object.entries(entries).map(([path, contents]) => [
		normalizeZipEntryPath(path),
		contents,
	]));
}

export function readZipText(entries: ReadonlyMap<string, Uint8Array<ArrayBuffer>>, path: string): string {
	const normalizedPath = normalizeZipEntryPath(path);
	const contents = entries.get(normalizedPath);
	if (!contents) {
		throw new Error(`The zip archive is missing ${normalizedPath}.`);
	}

	return strFromU8(contents);
}
