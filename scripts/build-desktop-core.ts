#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Conductor Studio contributors. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { getVersion } from '../build/lib/git.ts';

const packageJsonMarkerId = 'BUILD_INSERT_PACKAGE_CONFIGURATION';
const tscWatchReadyMarker = 'Watching for file changes.';
const desktopBuildReadyMarker = '[desktop-build] ready';
const tscExtraArgs = process.argv.slice(2);
const isWatch = tscExtraArgs.includes('--watch') || tscExtraArgs.includes('-w');
const projectRoot = process.cwd();
const desktopOutDir = path.join(projectRoot, 'out', 'desktop');
const packageJsonPath = path.join(projectRoot, 'package.json');
const bootstrapMetaPath = path.join(desktopOutDir, 'src', 'bootstrap-meta.js');
const packageMarker = new RegExp(
	`${packageJsonMarkerId}:\\s*"${packageJsonMarkerId}"`,
);

const isWin = process.platform === 'win32';
const tscCmd = isWin ? 'cmd.exe' : 'npx';
const tscArgs = isWin
	? ['/d', '/s', '/c', 'npx', 'tsc', '-p', 'src/tsconfig.desktop.json', ...tscExtraArgs]
	: ['tsc', '-p', 'src/tsconfig.desktop.json', ...tscExtraArgs];

const inlinePackageConfiguration = (throwOnMissingMarker: boolean): void => {
	mkdirSync(desktopOutDir, { recursive: true });
	copyFileSync(packageJsonPath, path.join(desktopOutDir, 'package.json'));

	const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
	const commit = getVersion(projectRoot);
	if (commit) {
		// Conductor keeps product identity in bootstrap-meta instead of a separate
		// product.json, so inject the build commit into the inlined package metadata.
		packageJson.commit = commit;
	}
	const packageJsonFields = JSON.stringify(packageJson).slice(1, -1);
	const bootstrapMeta = readFileSync(bootstrapMetaPath, 'utf8');

	if (!packageMarker.test(bootstrapMeta)) {
		if (throwOnMissingMarker) {
			throw new Error(`Package configuration marker not found in ${bootstrapMetaPath}`);
		}
		return;
	}

	writeFileSync(
		bootstrapMetaPath,
		bootstrapMeta.replace(packageMarker, packageJsonFields),
	);
};

const getDesktopBuildFingerprint = (): string => {
	const hash = createHash('sha256');

	const hashDirectory = (directoryPath: string): void => {
		const entries = readdirSync(directoryPath, { withFileTypes: true })
			.sort((left, right) => left.name.localeCompare(right.name));

		for (const entry of entries) {
			const entryPath = path.join(directoryPath, entry.name);
			if (entry.isDirectory()) {
				hashDirectory(entryPath);
				continue;
			}

			const relativePath = path.relative(desktopOutDir, entryPath).replaceAll(path.sep, '/');
			hash.update(relativePath);
			hash.update('\0');
			hash.update(readFileSync(entryPath));
			hash.update('\0');
		}
	};

	hashDirectory(desktopOutDir);
	return hash.digest('hex');
};

const reportDesktopBuildReady = (): void => {
	inlinePackageConfiguration(false);
	console.log(`${desktopBuildReadyMarker} ${getDesktopBuildFingerprint()}`);
};

rmSync(desktopOutDir, { recursive: true, force: true });

if (isWatch) {
	const proc = spawn(tscCmd, tscArgs, { stdio: ['inherit', 'pipe', 'pipe'] });

	const relayOutput = (
		stream: NodeJS.ReadableStream,
		outputTarget: NodeJS.WritableStream,
	): void => {
		stream.setEncoding('utf8');
		let pending = '';
		stream.on('data', chunk => {
			const text = String(chunk);
			outputTarget.write(text);
			pending += text;

			let markerIndex = pending.indexOf(tscWatchReadyMarker);
			while (markerIndex >= 0) {
				reportDesktopBuildReady();
				pending = pending.slice(markerIndex + tscWatchReadyMarker.length);
				markerIndex = pending.indexOf(tscWatchReadyMarker);
			}

			if (pending.length >= tscWatchReadyMarker.length) {
				pending = pending.slice(-(tscWatchReadyMarker.length - 1));
			}
		});
	};

	relayOutput(proc.stdout, process.stdout);
	relayOutput(proc.stderr, process.stderr);

	proc.on('exit', code => {
		process.exit(code ?? 1);
	});
	proc.on('error', error => {
		console.error(error.message);
		process.exit(1);
	});
} else {
	const res = spawnSync(tscCmd, tscArgs, { stdio: 'inherit' });
	if ((res.status ?? 1) !== 0) {
		process.exit(res.status ?? 1);
	}

	inlinePackageConfiguration(true);
}
