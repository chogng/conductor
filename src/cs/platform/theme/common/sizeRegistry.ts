/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export {
	asCssVariable,
	asCssVariableName,
	asCssVariableWithDefault,
	DEFAULT_SIZE_CONFIG_VALUE,
	getSizeRegistry,
	isSizeDefaults,
	registerSize,
	size,
	sizeForAllThemes,
	sizeValueToCss,
	workbenchSizesSchemaId,
	type ISizeRegistry,
	type SizeContribution,
	type SizeDefaults,
	type SizeIdentifier,
	type SizeUnit,
	type SizeValue,
} from './sizeUtils.js';

import './sizes/baseSizes.js';
