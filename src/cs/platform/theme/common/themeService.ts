/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, type Event } from '../../../base/common/event.js';
import { Disposable, type IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Registry } from '../../registry/common/platform.js';
import { Color } from '../../../base/common/color.js';
import type { ColorIdentifier } from './colorUtils.js';
import { ColorScheme, ThemeTypeSelector } from './theme.js';

export const IThemeService = createDecorator<IThemeService>('themeService');

export const themeColorFromId = (
	id: ColorIdentifier,
): { readonly id: ColorIdentifier } => ({ id });

export function getThemeTypeSelector(type: ColorScheme): ThemeTypeSelector {
	switch (type) {
		case ColorScheme.DARK: return ThemeTypeSelector.VS_DARK;
		case ColorScheme.HIGH_CONTRAST_DARK: return ThemeTypeSelector.HC_BLACK;
		case ColorScheme.HIGH_CONTRAST_LIGHT: return ThemeTypeSelector.HC_LIGHT;
		default: return ThemeTypeSelector.VS;
	}
}

export interface ITokenStyle {
	readonly foreground: number | undefined;
	readonly bold: boolean | undefined;
	readonly underline: boolean | undefined;
	readonly strikethrough: boolean | undefined;
	readonly italic: boolean | undefined;
}

export interface IFontTokenOptions {
	readonly fontFamily?: string;
	readonly fontSizeMultiplier?: number;
	readonly lineHeightMultiplier?: number;
}

export interface IColorTheme {
	readonly type: ColorScheme;
	readonly label: string;
	readonly tokenColorMap: readonly string[];
	readonly tokenFontMap: readonly IFontTokenOptions[];
	readonly semanticHighlighting: boolean;

	getColor(color: ColorIdentifier, useDefault?: boolean): Color | undefined;
	defines(color: ColorIdentifier): boolean;
	getTokenStyleMetadata(type: string, modifiers: readonly string[], modelLanguage: string): ITokenStyle | undefined;
}

export interface IThemeService {
	readonly _serviceBrand: undefined;
	readonly onDidColorThemeChange: Event<IColorTheme>;
	getColorTheme(): IColorTheme;
}

export interface ICssStyleCollector {
	addRule(rule: string): void;
}

export interface IThemingParticipant {
	(theme: IColorTheme, collector: ICssStyleCollector): void;
}

export const Extensions = {
	ThemingContribution: 'base.contributions.theming',
} as const;

export interface IThemingRegistry {
	readonly onThemingParticipantAdded: Event<IThemingParticipant>;
	onColorThemeChange(participant: IThemingParticipant): IDisposable;
	getThemingParticipants(): readonly IThemingParticipant[];
}

class ThemingRegistry extends Disposable implements IThemingRegistry {
	private readonly themingParticipants: IThemingParticipant[] = [];
	private readonly onThemingParticipantAddedEmitter = this._register(new Emitter<IThemingParticipant>());
	public readonly onThemingParticipantAdded = this.onThemingParticipantAddedEmitter.event;

	public onColorThemeChange(participant: IThemingParticipant): IDisposable {
		this.themingParticipants.push(participant);
		this.onThemingParticipantAddedEmitter.fire(participant);
		return toDisposable(() => {
			const index = this.themingParticipants.indexOf(participant);
			if (index >= 0) {
				this.themingParticipants.splice(index, 1);
			}
		});
	}

	public getThemingParticipants(): readonly IThemingParticipant[] {
		return this.themingParticipants;
	}
}

const themingRegistry = new ThemingRegistry();
Registry.add(Extensions.ThemingContribution, themingRegistry);

export const registerThemingParticipant = (
	participant: IThemingParticipant,
): IDisposable => themingRegistry.onColorThemeChange(participant);

export class Themable extends Disposable {
	protected theme: IColorTheme;

	public constructor(
		protected readonly themeService: IThemeService,
	) {
		super();
		this.theme = themeService.getColorTheme();
		this._register(themeService.onDidColorThemeChange(theme => this.onThemeChange(theme)));
	}

	protected onThemeChange(theme: IColorTheme): void {
		this.theme = theme;
		this.updateStyles();
	}

	protected updateStyles(): void {
		// Subclasses override.
	}

	protected getColor(id: ColorIdentifier, modify?: (color: Color, theme: IColorTheme) => Color): string | null {
		const color = this.theme.getColor(id);
		const resolved = color && modify ? modify(color, this.theme) : color;
		return resolved ? resolved.toString() : null;
	}
}
