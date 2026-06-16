/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import {
  DEFAULT_FILES_EXPLORER_DENSITY,
  DEFAULT_FILES_EXPLORER_BADGE_COLORS,
  DEFAULT_FILES_EXPLORER_SHOW_BADGES,
  normalizeFilesExplorerBadgeColors,
  normalizeFilesExplorerDensity,
  normalizeFilesExplorerShowBadges,
  type ConductorSettings,
  type FilesExplorerBadgeColors,
  type FilesExplorerDensity,
} from "src/cs/workbench/services/settings/common/settings";

export type ExplorerAppearance = {
  readonly actionSize: number;
  readonly badgeFontSize: number;
  readonly badgeColors: FilesExplorerBadgeColors;
  readonly badgeLineHeight: number;
  readonly density: FilesExplorerDensity;
  readonly fontSize: number;
  readonly rowHeight: number;
  readonly showBadges: boolean;
};

export type WorkbenchAppearanceSnapshot = {
  readonly explorer: ExplorerAppearance;
};

const EXPLORER_APPEARANCE_BY_DENSITY: Record<
  FilesExplorerDensity,
  Omit<ExplorerAppearance, "showBadges">
> = {
  compact: {
    actionSize: 22,
    badgeFontSize: 10,
    badgeLineHeight: 14,
    density: "compact",
    fontSize: 13,
    rowHeight: 22,
  },
  default: {
    actionSize: 24,
    badgeFontSize: 10,
    badgeLineHeight: 14,
    density: "default",
    fontSize: 13,
    rowHeight: 26,
  },
  comfortable: {
    actionSize: 26,
    badgeFontSize: 11,
    badgeLineHeight: 16,
    density: "comfortable",
    fontSize: 13,
    rowHeight: 30,
  },
};

export const DEFAULT_EXPLORER_APPEARANCE: ExplorerAppearance = {
  ...EXPLORER_APPEARANCE_BY_DENSITY[DEFAULT_FILES_EXPLORER_DENSITY],
  badgeColors: DEFAULT_FILES_EXPLORER_BADGE_COLORS,
  showBadges: DEFAULT_FILES_EXPLORER_SHOW_BADGES,
};

export const getExplorerAppearance = (
  settings: Pick<ConductorSettings, "filesExplorerBadgeColors" | "filesExplorerDensity" | "filesExplorerShowBadges"> | null | undefined,
): ExplorerAppearance => ({
  ...EXPLORER_APPEARANCE_BY_DENSITY[
    normalizeFilesExplorerDensity(settings?.filesExplorerDensity)
  ],
  badgeColors: normalizeFilesExplorerBadgeColors(settings?.filesExplorerBadgeColors),
  showBadges: normalizeFilesExplorerShowBadges(settings?.filesExplorerShowBadges),
});

export const getWorkbenchAppearanceSnapshot = (
  settings: ConductorSettings | null | undefined,
): WorkbenchAppearanceSnapshot => ({
  explorer: getExplorerAppearance(settings),
});

export const areExplorerAppearancesEqual = (
  first: ExplorerAppearance,
  second: ExplorerAppearance,
): boolean =>
  first.actionSize === second.actionSize &&
  areFilesExplorerBadgeColorsEqual(first.badgeColors, second.badgeColors) &&
  first.badgeFontSize === second.badgeFontSize &&
  first.badgeLineHeight === second.badgeLineHeight &&
  first.density === second.density &&
  first.fontSize === second.fontSize &&
  first.rowHeight === second.rowHeight &&
  first.showBadges === second.showBadges;

export const areWorkbenchAppearanceSnapshotsEqual = (
  first: WorkbenchAppearanceSnapshot,
  second: WorkbenchAppearanceSnapshot,
): boolean =>
  areExplorerAppearancesEqual(first.explorer, second.explorer);

const areFilesExplorerBadgeColorsEqual = (
  first: FilesExplorerBadgeColors,
  second: FilesExplorerBadgeColors,
): boolean => {
  const keys = Object.keys(DEFAULT_FILES_EXPLORER_BADGE_COLORS);
  return keys.every(key => first[key] === second[key]);
};

export const IAppearanceService = createDecorator<IAppearanceService>("appearanceService");

export interface IAppearanceService {
  readonly _serviceBrand: undefined;

  readonly onDidChangeAppearance: Event<void>;

  getAppearance(): WorkbenchAppearanceSnapshot;
}
