/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export {
	asCssVariable,
	asCssVariableName,
	asCssVariableWithDefault,
	darken,
	DEFAULT_COLOR_CONFIG_VALUE,
	executeTransform,
	getColorRegistry,
	ifDefinedThenElse,
	lessProminent,
	lighten,
	opaque,
	oneOf,
	registerColor,
	resolveColorValue,
	transparent,
	workbenchColorsSchemaId,
	ColorTransformType,
	type ColorContribution,
	type ColorDefaults,
	type ColorIdentifier,
	type ColorTransform,
	type ColorValue,
	type IColorRegistry,
} from './colorUtils.js';

import './colors/baseColors.js';
import './colors/chartsColors.js';
import './colors/editorColors.js';
import './colors/inputColors.js';
import './colors/listColors.js';
import './colors/menuColors.js';
import './colors/minimapColors.js';
import './colors/miscColors.js';
import './colors/notificationColors.js';
import './colors/quickpickColors.js';
import './colors/searchColors.js';
import './colors/tableColors.js';
