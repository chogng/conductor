/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { ThemeMode } from "src/cs/workbench/common/theme";

export const DEFAULT_WORKBENCH_BACKGROUND_COLOR = "#f3f4f6";

export const RESET_WORKBENCH_BACKGROUND_COMMAND_ID = "workbench.action.resetWorkbenchBackground";
export const SET_DARK_THEME_COMMAND_ID = "workbench.action.setDarkTheme";
export const SET_LIGHT_THEME_COMMAND_ID = "workbench.action.setLightTheme";
export const SET_SYSTEM_THEME_COMMAND_ID = "workbench.action.setSystemTheme";
export const SET_THEME_COMMAND_ID = "workbench.action.setTheme";
export const SET_TRANSPARENT_CHROME_COMMAND_ID = "workbench.action.setTransparentChrome";
export const SET_WORKBENCH_BACKGROUND_COMMAND_ID = "workbench.action.setWorkbenchBackground";
export const TOGGLE_TRANSPARENT_CHROME_COMMAND_ID = "workbench.action.toggleTransparentChrome";

export type WorkbenchAppearance = {
	readonly backgroundColor: string;
	readonly transparentChrome: boolean;
};

export const IWorkbenchThemeService = createDecorator<IWorkbenchThemeService>("workbenchThemeService");

export interface IWorkbenchThemeService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeAppearance: Event<void>;
	readonly onDidChangeTheme: Event<ThemeMode>;

	applyAppearance(appearance: unknown): void;
	getAppearance(): WorkbenchAppearance;
	getTheme(): ThemeMode;
	setTheme(theme: ThemeMode): void;
	start(): void;
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export const normalizeWorkbenchBackgroundColor = (
	value: unknown,
): string =>
	typeof value === "string" && HEX_COLOR_PATTERN.test(value.trim())
		? value.trim().toLowerCase()
		: DEFAULT_WORKBENCH_BACKGROUND_COLOR;

export const normalizeWorkbenchAppearance = (
	value: unknown,
): WorkbenchAppearance => {
	const raw = value && typeof value === "object"
		? value as Record<string, unknown>
		: {};

	return {
		backgroundColor: normalizeWorkbenchBackgroundColor(raw.backgroundColor),
		transparentChrome: raw.transparentChrome === true,
	};
};
