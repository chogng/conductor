import { localize } from "src/cs/nls";
import { LxIcon, type LxIconDefinition } from "src/cs/base/common/lxicon";

export type SettingsSectionId = "general" | "template" | "appearance" | "origin" | "about";

export type SettingsSectionEntry = {
  id: SettingsSectionId;
  label: string;
};

export type SettingsNavGroup = {
  label: string;
  sectionIds: readonly SettingsSectionId[];
};

export const createSettingsNavGroups = (): readonly SettingsNavGroup[] => [
  {
    label: localize("settings.nav.group.personal", "Personal"),
    sectionIds: ["general", "template", "appearance"],
  },
  {
    label: localize("settings.nav.group.integrations", "Integrations"),
    sectionIds: ["origin"],
  },
  {
    label: localize("settings.nav.group.system", "System"),
    sectionIds: ["about"],
  },
];

export function getSettingsSectionIcon(sectionId: SettingsSectionId): LxIconDefinition {
  if (sectionId === "appearance") {
    return LxIcon.appearance;
  }

  if (sectionId === "origin") {
    return LxIcon.origin;
  }

  if (sectionId === "template") {
    return LxIcon.listUnordered;
  }

  if (sectionId === "about") {
    return LxIcon.infoCircle;
  }

  return LxIcon.gear;
}
