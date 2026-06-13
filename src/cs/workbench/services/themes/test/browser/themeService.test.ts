/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "node:assert/strict";

import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";
import { BrowserWorkbenchThemeService } from "src/cs/workbench/services/themes/browser/themeService";

type TestCall = readonly [string, unknown?];

suite("workbench/services/themes/browser/themeService", () => {
	const originalDocument = globalThis.document;
	const originalWindow = globalThis.window;

	teardown(() => {
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			value: originalDocument,
			writable: true,
		});
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: originalWindow,
			writable: true,
		});
	});

	test("waits for native transparent appearance before making workbench chrome transparent", async () => {
		const calls: TestCall[] = [];
		const desktopAppearance = createDeferredPromise();
		installAppearanceEnvironment(calls, () => desktopAppearance.promise);
		const service = new BrowserWorkbenchThemeService();

		service.applyAppearance({
			backgroundColor: "#abcdef",
			transparentChrome: true,
		});

		assert.deepStrictEqual(calls, [
			["desktopAppearanceSet", {
				backgroundColor: "#abcdef",
				transparentChrome: true,
			}],
		]);

		desktopAppearance.resolve({ ok: true });
		await desktopAppearance.promise;
		await Promise.resolve();

		assert.deepStrictEqual(calls, [
			["desktopAppearanceSet", {
				backgroundColor: "#abcdef",
				transparentChrome: true,
			}],
			["setProperty", ["--bg-page", "171 205 239"]],
			["toggleClass", ["workbench-transparent-chrome", true]],
		]);
	});

	test("restores opaque workbench chrome before disabling native transparent appearance", async () => {
		const calls: TestCall[] = [];
		installAppearanceEnvironment(calls, async () => ({ ok: true }));
		const service = new BrowserWorkbenchThemeService();

		service.applyAppearance({
			backgroundColor: "#abcdef",
			transparentChrome: true,
		});
		await Promise.resolve();
		await Promise.resolve();
		calls.length = 0;

		service.applyAppearance({
			backgroundColor: "#abcdef",
			transparentChrome: false,
		});

		assert.deepStrictEqual(calls, [
			["setProperty", ["--bg-page", "171 205 239"]],
			["toggleClass", ["workbench-transparent-chrome", false]],
			["desktopAppearanceSet", {
				backgroundColor: "#abcdef",
				transparentChrome: false,
			}],
		]);
	});
});

const createDeferredPromise = (): {
	readonly promise: Promise<unknown>;
	readonly resolve: (value: unknown) => void;
} => {
	let resolvePromise: (value: unknown) => void = () => {};
	const promise = new Promise<unknown>(resolve => {
		resolvePromise = resolve;
	});
	return {
		promise,
		resolve: resolvePromise,
	};
};

const installAppearanceEnvironment = (
	calls: TestCall[],
	invoke: (channel: string, ...args: unknown[]) => Promise<unknown>,
): void => {
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: {
			documentElement: {
				classList: {
					toggle: (name: string, force?: boolean) => {
						calls.push(["toggleClass", [name, force]]);
					},
				},
				style: {
					setProperty: (name: string, value: string) => {
						calls.push(["setProperty", [name, value]]);
					},
				},
			},
		},
		writable: true,
	});
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: {
			conductor: {
				ipcRenderer: {
					invoke: (channel: string, ...args: unknown[]) => {
						assert.equal(channel, workbenchIpcChannels.desktopAppearanceSet);
						calls.push(["desktopAppearanceSet", args[0]]);
						return invoke(channel, ...args);
					},
				},
			},
		},
		writable: true,
	});
};
