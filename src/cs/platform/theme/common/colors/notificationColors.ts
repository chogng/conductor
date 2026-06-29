/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { registerColor } from '../colorUtils.js';
import { contrastBorder, textLinkForeground } from './baseColors.js';
import {
	editorErrorForeground,
	editorInfoForeground,
	editorWarningForeground,
	editorWidgetBackground,
	editorWidgetForeground,
	widgetBorder,
} from './editorColors.js';

export const notificationsForeground = registerColor('notifications.foreground',
	editorWidgetForeground,
	nls.localize('notificationsForeground', 'Notifications foreground color.'));

export const notificationsBackground = registerColor('notifications.background',
	editorWidgetBackground,
	nls.localize('notificationsBackground', 'Notifications background color.'));

export const notificationToastBorder = registerColor('notificationToast.border',
	{ dark: widgetBorder, light: widgetBorder, hcDark: contrastBorder, hcLight: contrastBorder },
	nls.localize('notificationToastBorder', 'Notification toast border color.'));

export const notificationLinkForeground = registerColor('notificationLink.foreground',
	textLinkForeground,
	nls.localize('notificationLinkForeground', 'Notification link foreground color.'));

export const notificationsErrorIconForeground = registerColor('notificationsErrorIcon.foreground',
	editorErrorForeground,
	nls.localize('notificationsErrorIconForeground', 'The color used for the icon of error notifications.'));

export const notificationsWarningIconForeground = registerColor('notificationsWarningIcon.foreground',
	editorWarningForeground,
	nls.localize('notificationsWarningIconForeground', 'The color used for the icon of warning notifications.'));

export const notificationsInfoIconForeground = registerColor('notificationsInfoIcon.foreground',
	editorInfoForeground,
	nls.localize('notificationsInfoIconForeground', 'The color used for the icon of info notifications.'));

export const notificationsSuccessIconForeground = registerColor('notificationsSuccessIcon.foreground',
	{ dark: '#10B981', light: '#10B981', hcDark: '#10B981', hcLight: '#10B981' },
	nls.localize('notificationsSuccessIconForeground', 'The color used for the icon of Conductor success notifications.'));
