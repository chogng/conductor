/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { LxIcon } from "src/cs/base/common/lxicon";

export type SettingsSectionId = "general" | "template" | "appearance" | "origin" | "about";

export type SettingsNavGroupId = "personal" | "integrations" | "system";

export type SettingsSectionDefinition = {
  readonly groupId: SettingsNavGroupId;
  readonly icon: LxIcon;
  readonly id: SettingsSectionId;
  readonly label: string;
  readonly order: number;
};

export type SettingsNavGroup = {
  readonly label: string;
  readonly sectionIds: readonly SettingsSectionId[];
};

type SettingsNavGroupDefinition = {
  readonly id: SettingsNavGroupId;
  readonly label: string;
  readonly order: number;
};

export const createSettingsSections = (): readonly SettingsSectionDefinition[] => [
  {
    groupId: "personal",
    icon: LxIcon.gear,
    id: "general",
    label: localize("settings.nav.general", "General"),
    order: 0,
  },
  {
    groupId: "personal",
    icon: LxIcon.listUnordered,
    id: "template",
    label: localize("settings.nav.template", "Template"),
    order: 10,
  },
  {
    groupId: "personal",
    icon: LxIcon.appearance,
    id: "appearance",
    label: localize("settings.nav.appearance", "Appearance"),
    order: 20,
  },
  {
    groupId: "integrations",
    icon: LxIcon.origin,
    id: "origin",
    label: localize("settings.nav.origin", "Origin"),
    order: 30,
  },
  {
    groupId: "system",
    icon: LxIcon.infoCircle,
    id: "about",
    label: localize("settings.nav.about", "About"),
    order: 40,
  },
];

export const createSettingsNavGroups = (): readonly SettingsNavGroup[] => {
  const sections = createSettingsSections();
  return createSettingsNavGroupDefinitions().map(group => ({
    label: group.label,
    sectionIds: sections
      .filter(section => section.groupId === group.id)
      .sort((first, second) => first.order - second.order)
      .map(section => section.id),
  }));
};

function createSettingsNavGroupDefinitions(): readonly SettingsNavGroupDefinition[] {
  const groups: SettingsNavGroupDefinition[] = [
    {
      id: "personal",
      label: localize("settings.nav.group.personal", "Personal"),
      order: 0,
    },
    {
      id: "integrations",
      label: localize("settings.nav.group.integrations", "Integrations"),
      order: 10,
    },
    {
      id: "system",
      label: localize("settings.nav.group.system", "System"),
      order: 20,
    },
  ];
  return groups.sort((first, second) => first.order - second.order);
}
