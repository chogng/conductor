/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { isThemeMode, type ThemeMode } from "src/cs/workbench/common/theme";
import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";
import {
	IWorkbenchThemeService,
	normalizeWorkbenchAppearance,
	type WorkbenchAppearance,
} from "src/cs/workbench/services/themes/common/themeService";

export class BrowserWorkbenchThemeService extends Disposable implements IWorkbenchThemeService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeAppearanceEmitter = this._register(new Emitter<void>());
	public readonly onDidChangeAppearance = this.onDidChangeAppearanceEmitter.event;
	private readonly onDidChangeThemeEmitter = this._register(new Emitter<ThemeMode>());
	public readonly onDidChangeTheme = this.onDidChangeThemeEmitter.event;

	private appearance = normalizeWorkbenchAppearance(null);
	private mediaQuery: MediaQueryList | null = null;
	private started = false;
	private theme: ThemeMode = this.getInitialTheme();

	public start(): void {
		if (this.started || typeof window === "undefined") {
			return;
		}

		this.started = true;
		this.mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		this.mediaQuery.addEventListener("change", this.handleColorSchemeChange);
		this._register({
			dispose: () => {
				this.mediaQuery?.removeEventListener("change", this.handleColorSchemeChange);
				this.mediaQuery = null;
			},
		});
		this.applyThemeMode(this.theme);
		this.applyWorkbenchAppearance(this.appearance);
	}

	public getAppearance(): WorkbenchAppearance {
		return this.appearance;
	}

	public getTheme(): ThemeMode {
		return this.theme;
	}

	public setTheme(theme: ThemeMode): void {
		if (!isThemeMode(theme) || theme === this.theme) {
			return;
		}

		this.theme = theme;
		this.applyThemeMode(theme);
		this.onDidChangeThemeEmitter.fire(theme);
	}

	public applyAppearance(appearance: unknown): void {
		const normalizedAppearance = normalizeWorkbenchAppearance(appearance);
		if (isSameAppearance(this.appearance, normalizedAppearance)) {
			return;
		}

		this.appearance = normalizedAppearance;
		this.applyWorkbenchAppearance(normalizedAppearance);
		this.applyDesktopAppearance(normalizedAppearance);
		this.onDidChangeAppearanceEmitter.fire(undefined);
	}

	private getInitialTheme(): ThemeMode {
		if (typeof window === "undefined") {
			return "system";
		}

		return isThemeMode(window.__CONDUCTOR_INITIAL_THEME__)
			? window.__CONDUCTOR_INITIAL_THEME__
			: "system";
	}

	private readonly handleColorSchemeChange = (): void => {
		if (this.theme === "system") {
			this.applyThemeMode("system");
			this.onDidChangeThemeEmitter.fire(this.theme);
		}
	};

	private resolveThemeMode(theme: ThemeMode): "light" | "dark" {
		if (theme === "light" || theme === "dark") {
			return theme;
		}

		return this.mediaQuery?.matches ? "dark" : "light";
	}

	private applyThemeMode(theme: ThemeMode): void {
		if (typeof document === "undefined") {
			return;
		}

		const resolvedTheme = this.resolveThemeMode(theme);
		document.documentElement.classList.remove("light", "dark");
		document.documentElement.classList.add(resolvedTheme);
		document.documentElement.style.colorScheme = resolvedTheme;
		window.__CONDUCTOR_INITIAL_THEME__ = theme;
	}

	private applyWorkbenchAppearance(appearance: WorkbenchAppearance): void {
		applyWorkbenchAppearance(appearance);
	}

	private applyDesktopAppearance(appearance: WorkbenchAppearance): void {
		const ipcRenderer = window.conductor?.ipcRenderer as
			| { invoke?: (channel: string, ...args: unknown[]) => Promise<unknown> }
			| undefined;
		if (typeof ipcRenderer?.invoke !== "function") {
			return;
		}

		try {
			void ipcRenderer.invoke(workbenchIpcChannels.desktopAppearanceSet, appearance).catch(() => {
				// Web and older desktop shells fall back to CSS-only appearance.
			});
		} catch {
			// Web and older desktop shells fall back to CSS-only appearance.
		}
	}
}

const hexToRgbTriplet = (hex: string): string => {
	const normalized = normalizeWorkbenchAppearance({ backgroundColor: hex }).backgroundColor;
	const value = normalized.slice(1);
	const red = Number.parseInt(value.slice(0, 2), 16);
	const green = Number.parseInt(value.slice(2, 4), 16);
	const blue = Number.parseInt(value.slice(4, 6), 16);

	return `${red} ${green} ${blue}`;
};

export const applyWorkbenchAppearance = (
	appearance: WorkbenchAppearance,
): void => {
	if (typeof document === "undefined") {
		return;
	}

	document.documentElement.style.setProperty(
		"--bg-page",
		hexToRgbTriplet(appearance.backgroundColor),
	);
	document.documentElement.dataset.transparentChrome =
		appearance.transparentChrome ? "true" : "false";
};

const isSameAppearance = (
	current: WorkbenchAppearance,
	next: WorkbenchAppearance,
): boolean =>
	current.backgroundColor === next.backgroundColor &&
	current.transparentChrome === next.transparentChrome;

registerSingleton(IWorkbenchThemeService, BrowserWorkbenchThemeService, InstantiationType.Delayed);
