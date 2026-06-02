import { createButton } from "src/cs/base/browser/ui/button/button";
import {
  createMenuButton,
  MenuButton,
} from "src/cs/base/browser/ui/menu/menu";
import type { IAction } from "src/cs/base/common/actions";
import { lxChevronDown } from "src/cs/base/common/lxicon";
import {
  createSwitch as createBaseSwitch,
  updateSwitch,
} from "src/cs/base/browser/ui/switch/switch";
import { localize } from "src/cs/nls";

export type TemplateApplyViewOptions = {
  readonly createTemplateActions: () => IAction[];
  readonly onApplyTemplate: (incremental: boolean) => void;
  readonly onDeleteTemplate: () => void;
  readonly onExportTemplate: () => void;
  readonly onMatchCaseChange: (checked: boolean) => void;
  readonly onStopOnErrorChange: (checked: boolean) => void;
};

export type TemplateApplyViewState = {
  readonly canDeleteTemplate: boolean;
  readonly canExportTemplate: boolean;
  readonly fileNameMatchCaseSensitive: boolean;
  readonly selectedTemplateLabel: string;
  readonly stopOnError: boolean;
};

export class TemplateApplyView {
  public readonly element: HTMLElement;
  private readonly menuButton: MenuButton;
  private readonly deleteButton: HTMLButtonElement;
  private readonly exportButton: HTMLButtonElement;
  private readonly stopSwitch: HTMLButtonElement;
  private readonly matchCaseSwitch: HTMLButtonElement;
  private readonly autoCard: HTMLElement;

  constructor(
    private readonly options: TemplateApplyViewOptions,
    state: TemplateApplyViewState,
  ) {
    this.element = document.createElement("div");
    this.element.className = "template_config_panel_content";

    const dropdownRow = document.createElement("div");
    dropdownRow.className = "template_select_field";

    const dropdownLabel = document.createElement("span");
    dropdownLabel.className = "template_field_label";
    dropdownLabel.textContent = localize("da_template_select_label", "Select template");
    dropdownRow.append(dropdownLabel);

    const selectContainer = document.createElement("div");
    selectContainer.className = "template_button_row template_select_actions";

    this.menuButton = createMenuButton({
      label: state.selectedTemplateLabel,
      items: this.options.createTemplateActions,
      menuClassName: "template_select_menu",
      surfaceClassName: "template_select_menu_surface",
      triggerIcon: lxChevronDown,
    });
    selectContainer.append(this.menuButton.domNode);

    this.deleteButton = createButton({
      label: localize("da_delete_template", "Delete template"),
      size: "sm",
      variant: "secondary",
    });
    this.deleteButton.className = `${this.deleteButton.className} template_button`;
    this.deleteButton.addEventListener("click", () => this.options.onDeleteTemplate());
    selectContainer.append(this.deleteButton);

    dropdownRow.append(selectContainer);
    this.element.append(dropdownRow);

    const applyActions = document.createElement("div");
    applyActions.className = "template_apply_actions";

    const applyAllButton = createButton({
      label: localize("da_apply_template", "Apply Template"),
      size: "md",
      variant: "primary",
    });
    applyAllButton.className = `${applyAllButton.className} template_button`;
    applyAllButton.addEventListener("click", () => this.options.onApplyTemplate(false));

    const applyNewButton = createButton({
      label: localize("da_apply_new_files", "Apply New Files"),
      size: "md",
      variant: "secondary",
    });
    applyNewButton.className = `${applyNewButton.className} template_button`;
    applyNewButton.addEventListener("click", () => this.options.onApplyTemplate(true));

    applyActions.append(applyAllButton, applyNewButton);
    this.element.append(applyActions);

    const importExportRow = document.createElement("div");
    importExportRow.className = "template_button_row template_button_row--inset";

    this.exportButton = createButton({
      label: localize("da_template_export_btn", "Export templates"),
      size: "sm",
      variant: "secondary",
    });
    this.exportButton.className = `${this.exportButton.className} template_button template_button--full`;
    this.exportButton.addEventListener("click", () => this.options.onExportTemplate());

    importExportRow.append(this.exportButton);
    this.element.append(importExportRow);

    const divider = document.createElement("div");
    divider.className = "template_divider";
    this.element.append(divider);

    const togglesRow = document.createElement("div");
    togglesRow.className = "template_toggle_rows";

    this.stopSwitch = this.createToggleRow(
      togglesRow,
      localize("da_template_stop_on_error", "Stop at first invalid item"),
      this.options.onStopOnErrorChange,
    );

    this.matchCaseSwitch = this.createToggleRow(
      togglesRow,
      localize("da_template_match_case", "Match field case"),
      this.options.onMatchCaseChange,
    );

    this.element.append(togglesRow);

    this.autoCard = document.createElement("div");
    this.autoCard.className = "template_auto_card";

    const autoTitle = document.createElement("h3");
    autoTitle.className = "template_auto_card_title";
    autoTitle.textContent = localize("da_auto_extract_title", "Smart auto extraction");

    const autoDescription = document.createElement("p");
    autoDescription.className = "template_auto_card_description";
    autoDescription.textContent = localize("da_auto_extract_desc", "The system analyzes imported file formats and extracts variables and related parameters automatically. Suitable for standard IV/CV data formats.");

    this.autoCard.append(autoTitle, autoDescription);
    this.element.append(this.autoCard);

    const spacer = document.createElement("div");
    spacer.className = "template_spacer";
    this.element.append(spacer);

    this.update(state);
  }

  public update(state: TemplateApplyViewState): void {
    this.menuButton.update({
      label: state.selectedTemplateLabel,
      items: this.options.createTemplateActions,
      menuClassName: "template_select_menu",
      surfaceClassName: "template_select_menu_surface",
      triggerIcon: lxChevronDown,
    });

    this.deleteButton.style.display = state.canDeleteTemplate ? "" : "none";
    this.exportButton.disabled = !state.canExportTemplate;
    updateSwitch(this.stopSwitch, { checked: state.stopOnError });
    updateSwitch(this.matchCaseSwitch, { checked: state.fileNameMatchCaseSensitive });
    this.autoCard.style.display = state.canDeleteTemplate ? "none" : "";
  }

  public dispose(): void {
    this.menuButton.dispose();
    this.element.replaceChildren();
    this.element.remove();
  }

  private createToggleRow(
    container: HTMLElement,
    labelText: string,
    onToggle: (checked: boolean) => void,
  ): HTMLButtonElement {
    const row = document.createElement("div");
    row.className = "template_toggle_row";
    const title = document.createElement("div");
    title.className = "template_toggle_title";
    const label = document.createElement("p");
    label.className = "template_toggle_label";
    label.textContent = labelText;
    title.append(label);
    const control = document.createElement("div");
    control.className = "template_toggle_control";
    const toggle = createToggleSwitch(false, onToggle);
    control.append(toggle);
    row.append(title, control);
    container.append(row);
    return toggle;
  }
}

const createToggleSwitch = (
  initialChecked: boolean,
  onCheckedChange: (checked: boolean) => void,
): HTMLButtonElement => {
  const button = createBaseSwitch({
    checked: initialChecked,
  });
  button.addEventListener("click", () => {
    const nextChecked = button.getAttribute("aria-checked") !== "true";
    updateSwitch(button, {
      checked: nextChecked,
    });
    onCheckedChange(nextChecked);
  });
  return button;
};
