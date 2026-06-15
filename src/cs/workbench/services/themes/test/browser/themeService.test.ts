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
				theme: "system",
				transparentChrome: true,
			}],
		]);

		desktopAppearance.resolve({ ok: true });
		await desktopAppearance.promise;
		await drainMicrotasks();

		assert.deepStrictEqual(calls, [
			["desktopAppearanceSet", {
				backgroundColor: "#abcdef",
				theme: "system",
				transparentChrome: true,
			}],
			["setProperty", ["--bg-page", "171 205 239"]],
			["toggleClass", ["workbench-transparent-chrome", true]],
		]);
	});

	test("adds macOS transparent chrome class inside Electron renderer", async () => {
		const calls: TestCall[] = [];
		installAppearanceEnvironment(calls, async () => ({ ok: true }), {
			electronVersion: "38.0.0",
			platform: "darwin",
		});
		const service = new BrowserWorkbenchThemeService();

		service.applyAppearance({
			backgroundColor: "#abcdef",
			transparentChrome: true,
		});
		await drainMicrotasks();

		assert.deepStrictEqual(calls, [
			["desktopAppearanceSet", {
				backgroundColor: "#abcdef",
				theme: "system",
				transparentChrome: true,
			}],
			["setProperty", ["--bg-page", "171 205 239"]],
			["toggleClass", ["workbench-transparent-chrome", true]],
			["toggleClass", ["workbench-transparent-chrome-macos", true]],
		]);

		calls.length = 0;
		service.applyAppearance({
			backgroundColor: "#abcdef",
			transparentChrome: false,
		});

		assert.deepStrictEqual(calls, [
			["setProperty", ["--bg-page", "171 205 239"]],
			["toggleClass", ["workbench-transparent-chrome", false]],
			["toggleClass", ["workbench-transparent-chrome-macos", false]],
			["desktopAppearanceSet", {
				backgroundColor: "#abcdef",
				theme: "system",
				transparentChrome: false,
			}],
		]);
	});

	test("adds Windows transparent chrome class inside Electron renderer", async () => {
		const calls: TestCall[] = [];
		installAppearanceEnvironment(calls, async () => ({ ok: true }), {
			electronVersion: "38.0.0",
			platform: "win32",
		});
		const service = new BrowserWorkbenchThemeService();

		service.applyAppearance({
			backgroundColor: "#abcdef",
			transparentChrome: true,
		});
		await drainMicrotasks();

		assert.deepStrictEqual(calls, [
			["desktopAppearanceSet", {
				backgroundColor: "#abcdef",
				theme: "system",
				transparentChrome: true,
			}],
			["setProperty", ["--bg-page", "171 205 239"]],
			["toggleClass", ["workbench-transparent-chrome", true]],
			["toggleClass", ["workbench-transparent-chrome-windows", true]],
		]);

		calls.length = 0;
		service.applyAppearance({
			backgroundColor: "#abcdef",
			transparentChrome: false,
		});

		assert.deepStrictEqual(calls, [
			["setProperty", ["--bg-page", "171 205 239"]],
			["toggleClass", ["workbench-transparent-chrome", false]],
			["toggleClass", ["workbench-transparent-chrome-windows", false]],
			["desktopAppearanceSet", {
				backgroundColor: "#abcdef",
				theme: "system",
				transparentChrome: false,
			}],
		]);
	});

	test("applies opaque surface changes from desktop window events", async () => {
		const calls: TestCall[] = [];
		const environment = installAppearanceEnvironment(calls, async () => ({ ok: true }), {
			electronVersion: "38.0.0",
			platform: "darwin",
		});
		const service = new BrowserWorkbenchThemeService();

		service.start();
		calls.length = 0;
		service.applyAppearance({
			backgroundColor: "#abcdef",
			transparentChrome: true,
		});
		await drainMicrotasks();
		calls.length = 0;

		environment.emit(workbenchIpcChannels.desktopOpaqueSurfaceChanged, {
			backgroundColor: "#f9f9f9",
			opaqueSurface: true,
		});

		assert.deepStrictEqual(calls, [
			["setProperty", ["--desktop-opaque-surface-background", "249 249 249"]],
			["toggleClass", ["workbench-opaque-surface", true]],
		]);

		calls.length = 0;
		environment.emit(workbenchIpcChannels.desktopOpaqueSurfaceChanged, {
			backgroundColor: "#f9f9f9",
			opaqueSurface: false,
		});

		assert.deepStrictEqual(calls, [
			["setProperty", ["--desktop-opaque-surface-background", "249 249 249"]],
			["toggleClass", ["workbench-opaque-surface", false]],
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
		await drainMicrotasks();
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
				theme: "system",
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

const drainMicrotasks = async (): Promise<void> => {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
};

type AppearanceEnvironmentOptions = {
	readonly electronVersion?: string;
	readonly platform?: string;
};

type AppearanceEnvironment = {
	readonly emit: (channel: string, payload: unknown) => void;
};

const installAppearanceEnvironment = (
	calls: TestCall[],
	invoke: (channel: string, ...args: unknown[]) => Promise<unknown>,
	options: AppearanceEnvironmentOptions = {},
): AppearanceEnvironment => {
	const listeners = new Map<string, Array<(event: unknown, payload: unknown) => void>>();
	const conductor: Record<string, unknown> = {
		ipcRenderer: {
			invoke: (channel: string, ...args: unknown[]) => {
				assert.equal(channel, workbenchIpcChannels.desktopAppearanceSet);
				calls.push(["desktopAppearanceSet", args[0]]);
				return invoke(channel, ...args);
			},
			on: (
				channel: string,
				listener: (event: unknown, payload: unknown) => void,
			) => {
				const channelListeners = listeners.get(channel) ?? [];
				channelListeners.push(listener);
				listeners.set(channel, channelListeners);
			},
			removeListener: (
				channel: string,
				listener: (event: unknown, payload: unknown) => void,
			) => {
				const channelListeners = listeners.get(channel) ?? [];
				listeners.set(
					channel,
					channelListeners.filter(candidate => candidate !== listener),
				);
			},
		},
	};
	if (typeof options.platform === "string") {
		conductor.process = {
			platform: options.platform,
			versions: {
				electron: options.electronVersion,
			},
		};
	}

	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: {
			documentElement: {
				classList: {
					add: (...names: string[]) => {
						calls.push(["addClass", names]);
					},
					remove: (...names: string[]) => {
						calls.push(["removeClass", names]);
					},
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
			conductor,
			matchMedia: () => ({
				addEventListener: () => undefined,
				matches: false,
				removeEventListener: () => undefined,
			}),
		},
		writable: true,
	});

	return {
		emit: (channel, payload) => {
			for (const listener of listeners.get(channel) ?? []) {
				listener({}, payload);
			}
		},
	};
};
