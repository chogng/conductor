import { localize } from "src/cs/nls";
import type { HelpWindowKind } from "src/cs/workbench/contrib/help/common/helpWindow";

export type HelpContentSection = {
  readonly title: string;
  readonly body: readonly string[];
};

export type HelpContent = {
  readonly title: string;
  readonly subtitle: string;
  readonly sections: readonly HelpContentSection[];
};

export const createHelpContent = (kind: HelpWindowKind): HelpContent => {
  if (kind === "guide") {
    return {
      title: localize("help_guide_title", "User Guide"),
      subtitle: localize("help_guide_subtitle", "A concise workflow reference for Conductor Studio."),
      sections: [
        {
          title: localize("help_guide_import_title", "Import data"),
          body: [
            localize("help_guide_import_body_1", "Drag files or folders into the resource manager, or use the import entry to choose local data."),
            localize("help_guide_import_body_2", "Select a file to preview rows before applying extraction templates."),
          ],
        },
        {
          title: localize("help_guide_template_title", "Apply templates"),
          body: [
            localize("help_guide_template_body_1", "Use auto extraction for quick starts, or select a saved template for repeatable column mapping."),
            localize("help_guide_template_body_2", "Apply all to rebuild results, or apply new files to keep existing processed results."),
          ],
        },
        {
          title: localize("help_guide_chart_title", "Review charts"),
          body: [
            localize("help_guide_chart_body_1", "Switch IV, GM, SS, and VTH tabs from the chart header."),
            localize("help_guide_chart_body_2", "Use Inspector for second-pass curves and Search in the side bar to locate values."),
          ],
        },
        {
          title: localize("help_guide_export_title", "Export results"),
          body: [
            localize("help_guide_export_body_1", "Use the right details pane to configure Origin export, calculated parameters, and curve settings."),
            localize("help_guide_export_body_2", "Origin executable and default plot settings are configured from Settings > Origin."),
          ],
        },
      ],
    };
  }

  return {
    title: localize("help_changelog_title", "Update Log"),
    subtitle: localize("help_changelog_subtitle", "Product changes and notes maintained with each release."),
    sections: [
      {
        title: localize("help_changelog_current_title", "Current development build"),
        body: [
          localize("help_changelog_current_body_1", "Added a dedicated help window for update logs and user guide content."),
          localize("help_changelog_current_body_2", "Update log entries can be appended in src/cs/workbench/contrib/help/browser/helpContent.ts."),
        ],
      },
      {
        title: localize("help_changelog_previous_title", "Recent fixes"),
        body: [
          localize("help_changelog_previous_body_1", "Improved chart view container layout after applying templates."),
          localize("help_changelog_previous_body_2", "Kept chart and details panes visible when switching from data preview into analysis."),
        ],
      },
    ],
  };
};
