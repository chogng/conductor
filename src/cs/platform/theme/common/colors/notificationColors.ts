/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { registerColor } from '../colorUtils.js';

export const notificationsForeground = registerColor('notifications.foreground',
	{ dark: '#cccccc', light: '#616161', hcDark: '#FFFFFF', hcLight: '#292929' },
	nls.localize('notificationsForeground', 'Notifications foreground color.'));

export const notificationsBackground = registerColor('notifications.background',
	{ dark: '#252526', light: '#ffffff', hcDark: '#0C141F', hcLight: '#FFFFFF' },
	nls.localize('notificationsBackground', 'Notifications background color.'));

export const notificationToastBorder = registerColor('notificationToast.border',
	{ dark: null, light: null, hcDark: '#6FC3DF', hcLight: '#0F4A85' },
	nls.localize('notificationToastBorder', 'Notification toast border color.'));

export const notificationLinkForeground = registerColor('notificationLink.foreground',
	{ dark: '#3794FF', light: '#006AB1', hcDark: '#21A6FF', hcLight: '#0F4A85' },
	nls.localize('notificationLinkForeground', 'Notification link foreground color.'));

export const notificationsErrorIconForeground = registerColor('notificationsErrorIcon.foreground',
	{ dark: '#F14C4C', light: '#E51400', hcDark: '#F48771', hcLight: '#B5200D' },
	nls.localize('notificationsErrorIconForeground', 'The color used for the icon of error notifications.'));

export const notificationsWarningIconForeground = registerColor('notificationsWarningIcon.foreground',
	{ dark: '#CCA700', light: '#BF8803', hcDark: '#FFD370', hcLight: '#895503' },
	nls.localize('notificationsWarningIconForeground', 'The color used for the icon of warning notifications.'));

export const notificationsInfoIconForeground = registerColor('notificationsInfoIcon.foreground',
	{ dark: '#59A4F9', light: '#0063D3', hcDark: '#59A4F9', hcLight: '#0063D3' },
	nls.localize('notificationsInfoIconForeground', 'The color used for the icon of info notifications.'));

export const notificationsSuccessIconForeground = registerColor('notificationsSuccessIcon.foreground',
	{ dark: '#10B981', light: '#10B981', hcDark: '#10B981', hcLight: '#10B981' },
	nls.localize('notificationsSuccessIconForeground', 'The color used for the icon of Conductor success notifications.'));
