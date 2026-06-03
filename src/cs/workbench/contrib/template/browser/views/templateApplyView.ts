import { createButton } from "src/cs/base/browser/ui/button/button";
import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { DropdownMenu } from "src/cs/base/browser/ui/dropdown/dropdown";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import type { IAction } from "src/cs/base/common/actions";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { lxChevronDown } from "src/cs/base/common/lxicon";
import type { IContextMenuService } from "src/cs/platform/contextview/browser/contextView";
import {
  createSwitch as createBaseSwitch,
  updateSwitch,
} from "src/cs/base/browser/ui/switch/switch";
import { localize } from "src/cs/nls";

export type TemplateApplyViewOptions = {
  readonly contextMenuService: Pick<IContextMenuService, "showContextMenu">;
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
  private readonly dropdownMenu: DropdownMenu;
  private readonly dropdownLabel: HTMLElement;
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
    dropdownRow.className = "template_picker_field";

    const dropdownLabel = document.createElement("span");
    dropdownLabel.className = "template_field_label";
    dropdownLabel.textContent = localize("template_picker_label", "Template");
    dropdownRow.append(dropdownLabel);

    const selectContainer = document.createElement("div");
    selectContainer.className = "template_button_row template_picker_actions";

    this.dropdownLabel = document.createElement("span");
    this.dropdownLabel.className = "template_picker_button_label";
    this.dropdownMenu = new DropdownMenu(selectContainer, {
      actionProvider: {
        getActions: () => this.options.createTemplateActions(),
      },
      contextMenuProvider: this.options.contextMenuService,
      labelRenderer: container => {
        const disposables = new DisposableStore();
        const button = document.createElement("a");
        button.className = "template_picker_button action-label";
        button.setAttribute("role", "button");
        button.tabIndex = 0;
        button.setAttribute("aria-haspopup", "menu");
        button.setAttribute("aria-expanded", "false");

        const icon = document.createElement("span");
        icon.className = "template_picker_button_icon";
        icon.append(createLxIcon({ icon: lxChevronDown, size: 14 }));

        button.append(this.dropdownLabel, icon);
        container.append(button);

        disposables.add(addDisposableListener(button, EventType.KEY_DOWN, event => {
          if (event.key !== "ArrowDown") {
            return;
          }

          event.preventDefault();
          this.dropdownMenu.show();
        }));

        return disposables;
      },
      matchAnchorWidth: true,
      menuClassName: "template_picker_menu",
      skipTelemetry: true,
    });
    this.dropdownMenu.menuOptions = {
      context: this,
    };
    this.dropdownMenu.onDidChangeVisibility(visible => {
      this.dropdownLabel.parentElement?.setAttribute("aria-expanded", `${visible}`);
    });

    this.deleteButton = createButton({
      label: localize("delete_template", "Delete template"),
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
      label: localize("apply_template", "Apply Template"),
      size: "md",
      variant: "primary",
    });
    applyAllButton.className = `${applyAllButton.className} template_button`;
    applyAllButton.addEventListener("click", () => this.options.onApplyTemplate(false));

    const applyNewButton = createButton({
      label: localize("apply_new_files", "Apply New Files"),
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
      label: localize("template_export_btn", "Export templates"),
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
      localize("template_stop_on_error", "Stop at first invalid item"),
      this.options.onStopOnErrorChange,
    );

    this.matchCaseSwitch = this.createToggleRow(
      togglesRow,
      localize("template_match_case", "Match field case"),
      this.options.onMatchCaseChange,
    );

    this.element.append(togglesRow);

    this.autoCard = document.createElement("div");
    this.autoCard.className = "template_auto_card";

    const autoTitle = document.createElement("h3");
    autoTitle.className = "template_auto_card_title";
    autoTitle.textContent = localize("auto_extract_title", "Smart auto extraction");

    const autoDescription = document.createElement("p");
    autoDescription.className = "template_auto_card_description";
    autoDescription.textContent = localize("auto_extract_desc", "The system analyzes imported file formats and extracts variables and related parameters automatically. Suitable for standard IV/CV data formats.");

    this.autoCard.append(autoTitle, autoDescription);
    this.element.append(this.autoCard);

    const spacer = document.createElement("div");
    spacer.className = "template_spacer";
    this.element.append(spacer);

    this.update(state);
  }

  public update(state: TemplateApplyViewState): void {
    this.dropdownLabel.textContent = state.selectedTemplateLabel;
    this.dropdownLabel.parentElement?.setAttribute("aria-label", state.selectedTemplateLabel);

    this.deleteButton.style.display = state.canDeleteTemplate ? "" : "none";
    this.exportButton.disabled = !state.canExportTemplate;
    updateSwitch(this.stopSwitch, { checked: state.stopOnError });
    updateSwitch(this.matchCaseSwitch, { checked: state.fileNameMatchCaseSensitive });
    this.autoCard.style.display = state.canDeleteTemplate ? "none" : "";
  }

  public dispose(): void {
    this.dropdownMenu.dispose();
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
