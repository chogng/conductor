/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { registerColor, transparent } from '../colorUtils.js';
import { foreground } from './baseColors.js';

export const tableTemplateBlockBackground = registerColor('table.templateBlockBackground',
	{ dark: transparent(foreground, 0.08), light: transparent(foreground, 0.05), hcDark: transparent(foreground, 0.16), hcLight: transparent(foreground, 0.10) },
	nls.localize('tableTemplateBlockBackground', 'Background color for table template block ranges.'));

export const tableTemplateXBackground = registerColor('table.templateXBackground',
	{ dark: '#60A5FA26', light: '#2563EB1A', hcDark: '#60A5FA40', hcLight: '#0F4A8526' },
	nls.localize('tableTemplateXBackground', 'Background color for table template X-axis ranges.'));

export const tableTemplateYBackground = registerColor('table.templateYBackground',
	{ dark: '#4ADE8026', light: '#16A34A1A', hcDark: '#4ADE8040', hcLight: '#374E0626' },
	nls.localize('tableTemplateYBackground', 'Background color for table template Y-axis ranges.'));

export const tableTemplateSelectionOutline = registerColor('table.templateSelectionOutline',
	{ dark: '#60A5FA33', light: '#2563EB2E', hcDark: '#FFFFFF66', hcLight: '#0F4A8559' },
	nls.localize('tableTemplateSelectionOutline', 'Outline color for selected table template decoration ranges.'));
