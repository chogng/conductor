import { createButton } from "src/cs/base/browser/ui/button/button";
import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { DropdownMenu } from "src/cs/base/browser/ui/dropdown/dropdown";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { SwitchWidget } from "src/cs/base/browser/ui/switch/switchWidget";
import type { IAction } from "src/cs/base/common/actions";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { LxIcon } from "src/cs/base/common/lxicon";
import type { IContextMenuService } from "src/cs/platform/contextview/browser/contextView";
import type { ICommandService } from "src/cs/platform/commands/common/commands";
import { localize } from "src/cs/nls";
import {
  RUN_SLICE_WITH_TEMPLATE_COMMAND_ID,
  RUN_SLICE_WITH_TEMPLATE_INCREMENTAL_COMMAND_ID,
} from "src/cs/workbench/contrib/slice/browser/sliceActions";
import { SET_TEMPLATE_STOP_ON_ERROR_COMMAND_ID } from "src/cs/workbench/contrib/template/browser/templateCommands";

export type TemplateManagementViewOptions = {
  readonly commandService: Pick<ICommandService, "executeCommand">;
  readonly contextMenuService: Pick<IContextMenuService, "showContextMenu">;
  readonly createTemplateActions: () => IAction[];
};

export type TemplateManagementViewState = {
  readonly canDeleteTemplate: boolean;
  readonly selectedTemplateLabel: string;
  readonly stopOnError: boolean;
};

export class TemplateManagementView {
  public readonly element: HTMLElement;
  private readonly disposables = new DisposableStore();
  private readonly dropdownMenu: DropdownMenu;
  private readonly dropdownLabel: HTMLElement;
  private readonly stopSwitch: SwitchWidget;
  private readonly autoCard: HTMLElement;

  constructor(
    private readonly options: TemplateManagementViewOptions,
    state: TemplateManagementViewState,
  ) {
    this.element = document.createElement("div");
    this.element.className = "template_management_view template_view_content";

    const dropdownRow = document.createElement("div");
    dropdownRow.className = "template_picker_field";

    const dropdownLabel = document.createElement("span");
    dropdownLabel.className = "template_field_label";
    dropdownLabel.textContent = localize("template.picker.label", "模板名称");
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
        icon.append(createLxIcon({ icon: LxIcon.chevronDown, size: 14 }));

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

    dropdownRow.append(selectContainer);
    this.element.append(dropdownRow);

    const applyActions = document.createElement("div");
    applyActions.className = "template_management_actions";

    const applyAllButton = createButton({
      label: localize("template.applyAll.label", "Apply to All"),
      size: "md",
      variant: "primary",
    });
    applyAllButton.className = `${applyAllButton.className} template_button`;
    applyAllButton.addEventListener("click", () => {
      void this.options.commandService.executeCommand(RUN_SLICE_WITH_TEMPLATE_COMMAND_ID);
    });

    const applyNewButton = createButton({
      label: localize("template.applyNewFiles.label", "Apply to New"),
      size: "md",
      variant: "secondary",
    });
    applyNewButton.className = `${applyNewButton.className} template_button`;
    applyNewButton.addEventListener("click", () => {
      void this.options.commandService.executeCommand(RUN_SLICE_WITH_TEMPLATE_INCREMENTAL_COMMAND_ID);
    });

    applyActions.append(applyAllButton, applyNewButton);
    this.element.append(applyActions);

    const divider = document.createElement("div");
    divider.className = "template_divider";
    this.element.append(divider);

    const togglesRow = document.createElement("div");
    togglesRow.className = "template_toggle_rows";

    this.stopSwitch = this.createToggleRow(
      togglesRow,
      localize("template.stopOnError", "Stop at first invalid item"),
      (checked) => {
        void this.options.commandService.executeCommand(SET_TEMPLATE_STOP_ON_ERROR_COMMAND_ID, checked);
      },
    );

    this.element.append(togglesRow);

    this.autoCard = document.createElement("div");
    this.autoCard.className = "template_auto_card";

    const autoTitle = document.createElement("h3");
    autoTitle.className = "template_auto_card_title";
    autoTitle.textContent = localize("template.recommendedTemplate.title", "Recommended template");

    const autoDescription = document.createElement("p");
    autoDescription.className = "template_auto_card_description";
    autoDescription.textContent = localize("template.recommendedTemplate.description", "The system uses table model, semantic rules, and review results to choose the template for slicing.");

    this.autoCard.append(autoTitle, autoDescription);
    this.element.append(this.autoCard);

    const spacer = document.createElement("div");
    spacer.className = "template_spacer";
    this.element.append(spacer);

    this.update(state);
  }

  public update(state: TemplateManagementViewState): void {
    this.dropdownLabel.textContent = state.selectedTemplateLabel;
    this.dropdownLabel.parentElement?.setAttribute("aria-label", state.selectedTemplateLabel);

    this.stopSwitch.update({ checked: state.stopOnError });
    this.autoCard.style.display = state.canDeleteTemplate ? "none" : "";
  }

  public dispose(): void {
    this.disposables.dispose();
    this.dropdownMenu.dispose();
    this.element.replaceChildren();
    this.element.remove();
  }

  private createToggleRow(
    container: HTMLElement,
    labelText: string,
    onToggle: (checked: boolean) => void,
  ): SwitchWidget {
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
    const toggle = this.disposables.add(new SwitchWidget({
      checked: false,
      onDidChangeChecked: onToggle,
    }));
    control.append(toggle.domNode);
    row.append(title, control);
    container.append(row);
    return toggle;
  }
}
