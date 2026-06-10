/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Conductor Studio contributors. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';
import path from 'node:path';

/**
 * Returns the sha1 commit version of a repository or undefined in case of failure.
 */
export function getVersion(repo: string): string | undefined {
	const git = path.join(repo, '.git');
	const headPath = path.join(git, 'HEAD');
	let head: string;

	try {
		head = fs.readFileSync(headPath, 'utf8').trim();
	} catch {
		return undefined;
	}

	if (/^[0-9a-f]{40}$/i.test(head)) {
		return head;
	}

	const refMatch = /^ref: (.*)$/.exec(head);
	if (!refMatch) {
		return undefined;
	}

	const ref = refMatch[1];

	try {
		const commit = fs.readFileSync(path.join(git, ref), 'utf8').trim();
		return /^[0-9a-f]{40}$/i.test(commit) ? commit : undefined;
	} catch {
		// Fall through to packed refs.
	}

	let refsRaw: string;
	try {
		refsRaw = fs.readFileSync(path.join(git, 'packed-refs'), 'utf8').trim();
	} catch {
		return undefined;
	}

	const refsRegex = /^([0-9a-f]{40})\s+(.+)$/gm;
	let refsMatch: RegExpExecArray | null;
	const refs: Record<string, string> = {};

	while ((refsMatch = refsRegex.exec(refsRaw))) {
		refs[refsMatch[2]] = refsMatch[1];
	}

	return refs[ref];
}
