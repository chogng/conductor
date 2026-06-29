/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { asCssVariableName, getColorRegistry } from "src/cs/platform/theme/common/colorRegistry";
import { ColorScheme } from "src/cs/platform/theme/common/theme";
import type { IColorTheme, ITokenStyle } from "src/cs/platform/theme/common/themeService";
import { isThemeMode, type ThemeMode } from "src/cs/workbench/common/theme";
import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";
import {
	IWorkbenchThemeService,
	normalizeWorkbenchBackgroundColor,
	normalizeWorkbenchAppearance,
	type WorkbenchAppearance,
} from "src/cs/workbench/services/themes/common/themeService";

const WORKBENCH_TRANSPARENT_CHROME_CLASS = "workbench-transparent-chrome";
const WORKBENCH_MACOS_TRANSPARENT_CHROME_CLASS = "workbench-transparent-chrome-macos";
const WORKBENCH_WINDOWS_TRANSPARENT_CHROME_CLASS = "workbench-transparent-chrome-windows";
const WORKBENCH_OPAQUE_SURFACE_CLASS = "workbench-opaque-surface";

type DesktopConductorProcess = {
	readonly platform?: string;
	readonly versions?: {
		readonly electron?: string;
	};
};

type DesktopConductorWindow = Window & typeof globalThis & {
	readonly conductor?: {
		readonly process?: DesktopConductorProcess;
	};
};

export class BrowserWorkbenchThemeService extends Disposable implements IWorkbenchThemeService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeAppearanceEmitter = this._register(new Emitter<void>());
	public readonly onDidChangeAppearance = this.onDidChangeAppearanceEmitter.event;
	private readonly onDidChangeThemeEmitter = this._register(new Emitter<ThemeMode>());
	public readonly onDidChangeTheme = this.onDidChangeThemeEmitter.event;

	private appearance = normalizeWorkbenchAppearance(null);
	private appearanceApplicationId = 0;
	private desktopOpaqueSurface = false;
	private workbenchOpaqueSurfaceApplied = false;
	private mediaQuery: MediaQueryList | null = null;
	private started = false;
	private theme: ThemeMode = this.getInitialTheme();

	public start(): void {
		if (this.started || typeof window === "undefined") {
			return;
		}

		this.started = true;
		this.installDesktopOpaqueSurfaceListener();
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

		const previousAppearance = this.appearance;
		this.appearance = normalizedAppearance;
		this.applyAppearanceInPaintOrder(previousAppearance, normalizedAppearance);
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
		applyWorkbenchColorTokens(resolvedTheme);
		window.__CONDUCTOR_INITIAL_THEME__ = theme;
	}

	private applyWorkbenchAppearance(appearance: WorkbenchAppearance): void {
		applyWorkbenchAppearance(appearance);
		this.applyWorkbenchOpaqueSurface();
	}

	private applyAppearanceInPaintOrder(
		previousAppearance: WorkbenchAppearance,
		appearance: WorkbenchAppearance,
	): void {
		const applicationId = ++this.appearanceApplicationId;
		const waitForDesktopBeforeTransparentCss =
			!previousAppearance.transparentChrome && appearance.transparentChrome;

		if (waitForDesktopBeforeTransparentCss) {
			// Native transparency must be ready before CSS exposes transparent
			// chrome, otherwise the window briefly shows the stale opaque layer.
			void this.applyDesktopAppearance(appearance).finally(() => {
				if (
					applicationId === this.appearanceApplicationId &&
					isSameAppearance(this.appearance, appearance)
				) {
					this.applyWorkbenchAppearance(appearance);
				}
			});
			return;
		}

		this.applyWorkbenchAppearance(appearance);
		void this.applyDesktopAppearance(appearance);
	}

	private applyDesktopAppearance(appearance: WorkbenchAppearance): Promise<unknown> {
		const ipcRenderer = window.conductor?.ipcRenderer as
			| { invoke?: (channel: string, ...args: unknown[]) => Promise<unknown> }
			| undefined;
		if (typeof ipcRenderer?.invoke !== "function") {
			return Promise.resolve(undefined);
		}

		try {
			return ipcRenderer.invoke(workbenchIpcChannels.desktopAppearanceSet, {
				...appearance,
				theme: this.theme,
			})
				.then(result => {
					this.applyDesktopOpaqueSurfacePayload(result);
					return result;
				})
				.catch(() => {
					// Older shells may not expose desktop appearance IPC.
				});
		} catch {
			return Promise.resolve(undefined);
		}
	}

	private installDesktopOpaqueSurfaceListener(): void {
		const ipcRenderer = window.conductor?.ipcRenderer as
			| {
				on?: (channel: string, listener: DesktopOpaqueSurfaceListener) => unknown;
				removeListener?: (
					channel: string,
					listener: DesktopOpaqueSurfaceListener,
				) => unknown;
			}
			| undefined;
		if (
			typeof ipcRenderer?.on !== "function" ||
			typeof ipcRenderer.removeListener !== "function"
		) {
			return;
		}

		const listener: DesktopOpaqueSurfaceListener = (_event, payload) => {
			this.applyDesktopOpaqueSurfacePayload(payload);
		};
		ipcRenderer.on(workbenchIpcChannels.desktopOpaqueSurfaceChanged, listener);
		this._register({
			dispose: () => {
				ipcRenderer.removeListener?.(
					workbenchIpcChannels.desktopOpaqueSurfaceChanged,
					listener,
				);
			},
		});
	}

	private applyDesktopOpaqueSurfacePayload(payload: unknown): void {
		const state = readDesktopOpaqueSurfaceState(payload);
		if (!state) {
			return;
		}

		this.desktopOpaqueSurface = state.opaqueSurface;
		document.documentElement.style.setProperty(
			"--desktop-opaque-surface-background",
			hexToRgbTriplet(state.backgroundColor),
		);
		this.applyWorkbenchOpaqueSurface();
	}

	private applyWorkbenchOpaqueSurface(): void {
		const enabled = this.appearance.transparentChrome && this.desktopOpaqueSurface;
		if (enabled === this.workbenchOpaqueSurfaceApplied) {
			return;
		}

		this.workbenchOpaqueSurfaceApplied = enabled;
		applyWorkbenchOpaqueSurface(enabled);
	}
}

type DesktopOpaqueSurfaceListener = (event: unknown, payload: unknown) => void;

type DesktopOpaqueSurfaceState = {
	readonly backgroundColor: string;
	readonly opaqueSurface: boolean;
};

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
	document.documentElement.classList.toggle(
		WORKBENCH_TRANSPARENT_CHROME_CLASS,
		appearance.transparentChrome,
	);
	if (isMacOSElectronWorkbench()) {
		document.documentElement.classList.toggle(
			WORKBENCH_MACOS_TRANSPARENT_CHROME_CLASS,
			appearance.transparentChrome,
		);
	}
	if (isWindowsElectronWorkbench()) {
		document.documentElement.classList.toggle(
			WORKBENCH_WINDOWS_TRANSPARENT_CHROME_CLASS,
			appearance.transparentChrome,
		);
	}
};

const applyWorkbenchOpaqueSurface = (enabled: boolean): void => {
	if (typeof document === "undefined") {
		return;
	}

	document.documentElement.classList.toggle(
		WORKBENCH_OPAQUE_SURFACE_CLASS,
		enabled,
	);
};

const applyWorkbenchColorTokens = (theme: "light" | "dark"): void => {
	const colorTheme = createWorkbenchDefaultColorTheme(theme);
	const style = document.documentElement.style;
	for (const color of getColorRegistry().getColors()) {
		const value = colorTheme.getColor(color.id, true);
		const property = asCssVariableName(color.id);
		if (value) {
			style.setProperty(property, value.toString());
			continue;
		}
		style.removeProperty(property);
	}
};

const createWorkbenchDefaultColorTheme = (theme: "light" | "dark"): IColorTheme => {
	let colorTheme: IColorTheme;
	colorTheme = {
		type: theme === "dark" ? ColorScheme.DARK : ColorScheme.LIGHT,
		label: theme,
		tokenColorMap: [],
		tokenFontMap: [],
		semanticHighlighting: false,
		getColor: color => getColorRegistry().resolveDefaultColor(color, colorTheme),
		defines: () => false,
		getTokenStyleMetadata: (): ITokenStyle | undefined => undefined,
	};
	return colorTheme;
};

const readDesktopOpaqueSurfaceState = (
	payload: unknown,
): DesktopOpaqueSurfaceState | null => {
	if (!payload || typeof payload !== "object") {
		return null;
	}

	const raw = payload as Record<string, unknown>;
	if (typeof raw.opaqueSurface !== "boolean") {
		return null;
	}

	return {
		backgroundColor: normalizeWorkbenchBackgroundColor(raw.backgroundColor),
		opaqueSurface: raw.opaqueSurface,
	};
};

const isMacOSElectronWorkbench = (): boolean => {
	const conductorProcess = getDesktopConductorProcess();

	return conductorProcess?.platform === "darwin" &&
		typeof conductorProcess.versions?.electron === "string";
};

const isWindowsElectronWorkbench = (): boolean => {
	const conductorProcess = getDesktopConductorProcess();

	return conductorProcess?.platform === "win32" &&
		typeof conductorProcess.versions?.electron === "string";
};

const getDesktopConductorProcess = (): DesktopConductorProcess | undefined => {
	if (typeof window === "undefined") {
		return undefined;
	}

	return (window as DesktopConductorWindow).conductor?.process;
};

const isSameAppearance = (
	current: WorkbenchAppearance,
	next: WorkbenchAppearance,
): boolean =>
	current.backgroundColor === next.backgroundColor &&
	current.transparentChrome === next.transparentChrome;

registerSingleton(IWorkbenchThemeService, BrowserWorkbenchThemeService, InstantiationType.Delayed);
