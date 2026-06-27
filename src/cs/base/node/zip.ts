/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createWriteStream, promises as fsPromises, type WriteStream } from "node:fs";
import * as nodePath from "node:path";
import type { Readable } from "node:stream";
import { open as openYauzl, type Entry, type ZipFile } from "yauzl";
import { ZipFile as YazlZipFile } from "yazl";

import { CancellationError, createCancelablePromise, type CancellationToken } from "../common/async.js";
import { localize } from "../../nls.js";
import { Promises } from "./pfs.js";

export const CorruptZipMessage: string = "end of central directory record signature not found";
const CORRUPT_ZIP_PATTERN = new RegExp(CorruptZipMessage);

export interface IExtractOptions {
	overwrite?: boolean;

	/**
	 * Source path within the ZIP archive. Only the files contained in this
	 * path will be extracted.
	 */
	sourcePath?: string;
}

export type ExtractErrorType = "CorruptZip" | "Incomplete";

export class ExtractError extends Error {
	readonly type?: ExtractErrorType;

	constructor(type: ExtractErrorType | undefined, cause: Error) {
		let message = cause.message;

		switch (type) {
			case "CorruptZip":
				message = `Corrupt ZIP: ${message}`;
				break;
		}

		super(message);
		this.type = type;
		this.cause = cause;
	}
}

export interface IFile {
	path: string;
	contents?: Buffer | string;
	localPath?: string;
}

function toExtractError(error: unknown): ExtractError {
	if (error instanceof ExtractError) {
		return error;
	}

	const cause = error instanceof Error ? error : new Error(String(error));
	const type = CORRUPT_ZIP_PATTERN.test(cause.message) ? "CorruptZip" : undefined;
	return new ExtractError(type, cause);
}

function throwIfCancelled(token: CancellationToken): void {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
}

function normalizeArchivePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function normalizeSourcePath(sourcePath: string | undefined): string {
	if (!sourcePath) {
		return "";
	}

	const normalized = normalizeArchivePath(sourcePath).replace(/\/+$/, "");
	return normalized ? `${normalized}/` : "";
}

function getRelativeArchivePath(fileName: string, sourcePath: string): string | undefined {
	const normalized = normalizeArchivePath(fileName);
	if (!sourcePath) {
		return normalized;
	}

	if (normalized === sourcePath.slice(0, -1)) {
		return "";
	}

	return normalized.startsWith(sourcePath) ? normalized.slice(sourcePath.length) : undefined;
}

function resolveTargetPath(targetPath: string, archivePath: string): string {
	const targetRoot = nodePath.resolve(targetPath);
	const targetFileName = nodePath.resolve(targetRoot, archivePath);
	const relative = nodePath.relative(targetRoot, targetFileName);

	if (relative === "" || (!relative.startsWith("..") && !nodePath.isAbsolute(relative))) {
		return targetFileName;
	}

	throw new Error(localize("zip.extract.invalidFile", "Error extracting {fileName}. Invalid file.", { fileName: archivePath }));
}

function modeFromEntry(entry: Entry): number {
	const attr = entry.externalFileAttributes >> 16 || 33188;

	return [448 /* S_IRWXU */, 56 /* S_IRWXG */, 7 /* S_IRWXO */]
		.map(mask => attr & mask)
		.reduce((a, b) => a + b, attr & 61440 /* S_IFMT */);
}

function openZip(zipFile: string, lazy = false): Promise<ZipFile> {
	return new Promise<ZipFile>((resolve, reject) => {
		const callback = (error: Error | null, zipfile?: ZipFile): void => {
			if (error) {
				reject(toExtractError(error));
				return;
			}

			if (!zipfile) {
				reject(new Error(localize("zip.open.missingZipFile", "Failed to open zip file.")));
				return;
			}

			resolve(zipfile);
		};

		if (lazy) {
			openYauzl(zipFile, { lazyEntries: true }, callback);
			return;
		}

		openYauzl(zipFile, callback);
	});
}

function openZipStream(zipFile: ZipFile, entry: Entry): Promise<Readable> {
	return new Promise<Readable>((resolve, reject) => {
		zipFile.openReadStream(entry, (error: Error | null, stream?: Readable) => {
			if (error) {
				reject(toExtractError(error));
				return;
			}

			if (!stream) {
				reject(new Error(localize("zip.open.missingEntryStream", "Failed to open zip entry stream.")));
				return;
			}

			resolve(stream);
		});
	});
}

async function extractEntry(
	stream: Readable,
	fileName: string,
	mode: number,
	targetPath: string,
	token: CancellationToken,
): Promise<void> {
	const targetFileName = resolveTargetPath(targetPath, fileName);
	const targetDirName = nodePath.dirname(targetFileName);
	let outputStream: WriteStream | undefined;

	const listener = token.onCancellationRequested(() => {
		const error = new CancellationError();
		stream.destroy(error);
		outputStream?.destroy(error);
	});

	try {
		throwIfCancelled(token);
		await fsPromises.mkdir(targetDirName, { recursive: true });
		throwIfCancelled(token);

		await new Promise<void>((resolve, reject) => {
			let settled = false;
			const settle = (callback: () => void): void => {
				if (settled) {
					return;
				}

				settled = true;
				callback();
			};

			outputStream = createWriteStream(targetFileName, { mode });
			outputStream.once("close", () => settle(resolve));
			outputStream.once("error", error => settle(() => reject(error)));
			stream.once("error", error => settle(() => reject(error)));
			stream.pipe(outputStream);
		});
	} finally {
		listener.dispose();
	}
}

function extractZip(zipfile: ZipFile, targetPath: string, sourcePath: string, token: CancellationToken): Promise<void> {
	let current = createCancelablePromise<void>(() => Promise.resolve());
	let processedEntriesCount = 0;
	let settled = false;

	return new Promise<void>((resolve, reject) => {
		const resolveOnce = (): void => {
			if (settled) {
				return;
			}

			settled = true;
			listener.dispose();
			resolve();
		};

		const rejectOnce = (error: unknown): void => {
			if (settled) {
				return;
			}

			settled = true;
			listener.dispose();
			zipfile.close();
			reject(toExtractError(error));
		};

		const readNextEntry = (): void => {
			if (!settled && !token.isCancellationRequested) {
				zipfile.readEntry();
			}
		};

		const finishEntry = (): void => {
			if (settled) {
				return;
			}

			processedEntriesCount += 1;
			readNextEntry();
		};

		const listener = token.onCancellationRequested(() => {
			current.cancel();
			zipfile.close();
		});

		zipfile.once("error", error => {
			if (!token.isCancellationRequested) {
				rejectOnce(error);
			}
		});
		zipfile.once("close", () => {
			current.then(() => {
				if (token.isCancellationRequested || zipfile.entryCount === processedEntriesCount) {
					resolveOnce();
					return;
				}

				rejectOnce(new ExtractError("Incomplete", new Error(localize(
					"zip.extract.incomplete",
					"Incomplete. Found {found} of {total} entries",
					{ found: processedEntriesCount, total: zipfile.entryCount },
				))));
			}, error => {
				if (token.isCancellationRequested) {
					resolveOnce();
					return;
				}

				rejectOnce(error);
			});
		});
		zipfile.on("entry", (entry: Entry) => {
			if (token.isCancellationRequested) {
				return;
			}

			const fileName = getRelativeArchivePath(entry.fileName, sourcePath);
			if (typeof fileName === "undefined" || fileName.length === 0) {
				finishEntry();
				return;
			}

			if (/\/$/.test(fileName)) {
				current = createCancelablePromise(async token => {
					throwIfCancelled(token);
					await fsPromises.mkdir(resolveTargetPath(targetPath, fileName), { recursive: true });
				});
			} else {
				current = createCancelablePromise(async token => {
					const stream = await openZipStream(zipfile, entry);
					await extractEntry(stream, fileName, modeFromEntry(entry), targetPath, token);
				});
			}

			current.then(finishEntry, error => {
				if (token.isCancellationRequested) {
					return;
				}

				rejectOnce(error);
			});
		});

		readNextEntry();
	});
}

export async function zip(zipPath: string, files: IFile[]): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const archive = new YazlZipFile();
		for (const file of files) {
			if (typeof file.contents !== "undefined") {
				archive.addBuffer(typeof file.contents === "string" ? Buffer.from(file.contents, "utf8") : file.contents, normalizeArchivePath(file.path));
			} else if (file.localPath) {
				archive.addFile(file.localPath, normalizeArchivePath(file.path));
			}
		}
		archive.end();

		const zipStream = createWriteStream(zipPath);
		archive.outputStream.pipe(zipStream);

		archive.outputStream.once("error", reject);
		zipStream.once("error", reject);
		zipStream.once("finish", () => resolve(zipPath));
	});
}

export async function extract(
	zipPath: string,
	targetPath: string,
	options: IExtractOptions = {},
	token: CancellationToken,
): Promise<void> {
	throwIfCancelled(token);

	const sourcePath = normalizeSourcePath(options.sourcePath);
	const zipfile = await openZip(zipPath, true);

	if (options.overwrite) {
		await Promises.rm(targetPath);
	}

	await extractZip(zipfile, targetPath, sourcePath, token);
}

export async function buffer(zipPath: string, filePath: string): Promise<Buffer> {
	const stream = await read(zipPath, filePath);
	return new Promise<Buffer>((resolve, reject) => {
		const buffers: Buffer[] = [];
		stream.once("error", reject);
		stream.on("data", (buffer: Buffer) => buffers.push(buffer));
		stream.on("end", () => resolve(Buffer.concat(buffers)));
	});
}

function read(zipPath: string, filePath: string): Promise<Readable> {
	return openZip(zipPath).then(zipfile => {
		return new Promise<Readable>((resolve, reject) => {
			zipfile.once("error", error => reject(toExtractError(error)));
			zipfile.on("entry", (entry: Entry) => {
				if (entry.fileName === normalizeArchivePath(filePath)) {
					openZipStream(zipfile, entry).then(stream => resolve(stream), reject);
				}
			});

			zipfile.once("close", () => reject(new Error(localize("zip.read.notFound", "{filePath} not found inside zip.", { filePath }))));
		});
	});
}
