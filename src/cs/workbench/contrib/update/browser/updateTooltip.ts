/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as dom from "src/cs/base/browser/dom";
import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import {
  ICommandService,
  type ICommandService as ICommandServiceType,
} from "src/cs/platform/commands/common/commands";
import {
  IUpdateService,
  type DesktopUpdateChannel,
  type DesktopUpdateState,
  type DesktopUpdateStatus,
  type IUpdateService as IUpdateServiceType,
} from "src/cs/platform/update/common/update";
import {
  UpdateCommandId,
} from "src/cs/workbench/contrib/update/common/update";

import "src/cs/workbench/contrib/update/browser/media/updateTooltip.css";

type UpdateTooltipAction = {
  readonly commandId: string;
  readonly label: string;
};

type UpdateTooltipModel = {
  readonly action?: UpdateTooltipAction;
  readonly message: string;
  readonly statusLabel: string;
  readonly title: string;
};

export const getUpdateTooltipText = (
  status: DesktopUpdateStatus,
  canCheckForUpdates = false,
): string => {
  const model = getUpdateTooltipModel(status, canCheckForUpdates);
  const details = [
    model.title,
    status.version
      ? localize("update.tooltip.versionText", "Version: {version}", { version: status.version })
      : "",
    model.message,
  ].filter(Boolean);

  return details.join(" - ");
};

/**
 * Stateful tooltip content for the desktop update status.
 * IUpdateService owns the status; this control renders snapshots only.
 */
export class UpdateTooltip extends Disposable {
  public readonly domNode: HTMLElement;

  private readonly titleNode: HTMLElement;
  private readonly statusValueNode: HTMLElement;
  private readonly versionRow: HTMLElement;
  private readonly versionValueNode: HTMLElement;
  private readonly channelRow: HTMLElement;
  private readonly channelValueNode: HTMLElement;
  private readonly managedRow: HTMLElement;
  private readonly managedValueNode: HTMLElement;
  private readonly messageNode: HTMLElement;
  private readonly buttonBar: HTMLElement;
  private readonly actionButton: HTMLButtonElement;

  public constructor(
    @IUpdateService private readonly updateService: IUpdateServiceType,
    @ICommandService private readonly commandService: ICommandServiceType,
  ) {
    super();

    this.domNode = dom.$(".update-tooltip");

    const header = dom.append(this.domNode, dom.$(".update-tooltip__header"));
    this.titleNode = dom.append(header, dom.$(".update-tooltip__title"));

    const details = dom.append(this.domNode, dom.$(".update-tooltip__details"));
    const statusRow = this.createDetailRow(details, localize("update.tooltip.status", "Status"));
    this.statusValueNode = statusRow.value;

    const versionRow = this.createDetailRow(details, localize("update.tooltip.version", "Version"));
    this.versionRow = versionRow.row;
    this.versionValueNode = versionRow.value;

    const channelRow = this.createDetailRow(details, localize("update.tooltip.channel", "Channel"));
    this.channelRow = channelRow.row;
    this.channelValueNode = channelRow.value;

    const managedRow = this.createDetailRow(details, localize("update.tooltip.managedBy", "Managed by"));
    this.managedRow = managedRow.row;
    this.managedValueNode = managedRow.value;

    this.messageNode = dom.append(this.domNode, dom.$(".update-tooltip__message"));

    this.buttonBar = dom.append(this.domNode, dom.$(".update-tooltip__buttons"));
    this.actionButton = dom.append(
      this.buttonBar,
      dom.$("button.update-tooltip__button.update-tooltip__action"),
    ) as HTMLButtonElement;
    this.actionButton.type = "button";
    this._register(dom.addDisposableListener(this.actionButton, "click", () => {
      const commandId = this.actionButton.dataset.commandId;
      if (commandId) {
        void this.commandService.executeCommand(commandId);
      }
    }));

    this._register(this.updateService.onDidChangeStatus(status => this.renderStatus(status)));
    this.renderStatus(this.updateService.getStatus());
  }

  public renderStatus(status: DesktopUpdateStatus): void {
    const model = getUpdateTooltipModel(status, this.updateService.canCheckForUpdates());

    this.titleNode.textContent = model.title;
    this.statusValueNode.textContent = model.statusLabel;
    this.setOptionalRow(this.versionRow, this.versionValueNode, status.version);
    this.setOptionalRow(this.channelRow, this.channelValueNode, getUpdateChannelLabel(status.channel));
    this.setOptionalRow(
      this.managedRow,
      this.managedValueNode,
      status.isStoreManaged ? localize("update.tooltip.appStore", "App Store") : null,
    );
    this.messageNode.textContent = model.message;

    if (model.action) {
      this.actionButton.textContent = model.action.label;
      this.actionButton.dataset.commandId = model.action.commandId;
      this.buttonBar.style.display = "";
      return;
    }

    this.actionButton.textContent = "";
    this.actionButton.dataset.commandId = "";
    this.buttonBar.style.display = "none";
  }

  private createDetailRow(
    parent: HTMLElement,
    label: string,
  ): { readonly row: HTMLElement; readonly value: HTMLElement } {
    const row = dom.append(parent, dom.$(".update-tooltip__detail-row"));
    const labelNode = dom.append(row, dom.$(".update-tooltip__detail-label"));
    labelNode.textContent = label;
    const value = dom.append(row, dom.$(".update-tooltip__detail-value"));
    return { row, value };
  }

  private setOptionalRow(
    row: HTMLElement,
    valueNode: HTMLElement,
    value: string | null,
  ): void {
    if (value) {
      valueNode.textContent = value;
      row.style.display = "";
      return;
    }

    valueNode.textContent = "";
    row.style.display = "none";
  }
}

const getUpdateTooltipModel = (
  status: DesktopUpdateStatus,
  canCheckForUpdates: boolean,
): UpdateTooltipModel => {
  switch (status.status) {
    case "idle":
      return {
        action: canCheckForUpdates
          ? {
              commandId: UpdateCommandId.check,
              label: localize("update.tooltip.checkButton", "Check for Updates"),
            }
          : undefined,
        message: status.message ?? localize("update.tooltip.idleMessage", "No update is ready to install."),
        statusLabel: getUpdateStateLabel(status.status),
        title: localize("update.tooltip.idleTitle", "Up to Date"),
      };
    case "checking":
      return {
        message: status.message ?? localize("update.tooltip.checkingMessage", "Checking for updates."),
        statusLabel: getUpdateStateLabel(status.status),
        title: localize("update.tooltip.checkingTitle", "Checking for Updates"),
      };
    case "available":
      return {
        action: {
          commandId: UpdateCommandId.downloadNow,
          label: localize("update.tooltip.downloadButton", "Download Update"),
        },
        message: status.message ?? localize("update.tooltip.availableMessage", "A new update is available to download."),
        statusLabel: getUpdateStateLabel(status.status),
        title: localize("update.tooltip.availableTitle", "Update Available"),
      };
    case "downloading":
      return {
        message: status.message ?? getDownloadingUpdateMessage(status.progressPercent),
        statusLabel: getUpdateStateLabel(status.status),
        title: localize("update.tooltip.downloadingTitle", "Downloading Update"),
      };
    case "downloaded":
      return {
        action: {
          commandId: UpdateCommandId.install,
          label: localize("update.tooltip.installButton", "Install Update"),
        },
        message: status.message ?? localize("update.tooltip.downloadedMessage", "The update is ready to install."),
        statusLabel: getUpdateStateLabel(status.status),
        title: localize("update.tooltip.downloadedTitle", "Update Ready to Install"),
      };
    case "updating":
      return {
        message: status.message ?? localize("update.tooltip.updatingMessage", "Installing the update."),
        statusLabel: getUpdateStateLabel(status.status),
        title: localize("update.tooltip.updatingTitle", "Installing Update"),
      };
    case "error":
      return {
        action: canCheckForUpdates
          ? {
              commandId: UpdateCommandId.check,
              label: localize("update.tooltip.retryButton", "Check Again"),
            }
          : undefined,
        message: status.message ?? localize("update.tooltip.errorMessage", "The last update check failed."),
        statusLabel: getUpdateStateLabel(status.status),
        title: localize("update.tooltip.errorTitle", "Update Error"),
      };
    case "disabled":
      return {
        message: status.message ?? localize("update.tooltip.disabledMessage", "Updates are disabled."),
        statusLabel: getUpdateStateLabel(status.status),
        title: localize("update.tooltip.disabledTitle", "Updates Disabled"),
      };
    case "unsupported":
      return {
        message: status.message ?? localize("update.tooltip.unsupportedMessage", "Updates are not available in this environment."),
        statusLabel: getUpdateStateLabel(status.status),
        title: localize("update.tooltip.unsupportedTitle", "Updates Unsupported"),
      };
  }
};

const getDownloadingUpdateMessage = (progressPercent: number | null): string =>
  progressPercent === null
    ? localize("update.tooltip.downloadingMessage", "Downloading the update.")
    : localize("update.tooltip.downloadingProgressMessage", "Downloading the update ({percent}% complete).", {
        percent: progressPercent,
      });

const getUpdateStateLabel = (state: DesktopUpdateState): string => {
  switch (state) {
    case "idle":
      return localize("update.tooltip.state.idle", "Idle");
    case "checking":
      return localize("update.tooltip.state.checking", "Checking");
    case "available":
      return localize("update.tooltip.state.available", "Available");
    case "downloading":
      return localize("update.tooltip.state.downloading", "Downloading");
    case "downloaded":
      return localize("update.tooltip.state.downloaded", "Downloaded");
    case "updating":
      return localize("update.tooltip.state.updating", "Installing");
    case "error":
      return localize("update.tooltip.state.error", "Error");
    case "disabled":
      return localize("update.tooltip.state.disabled", "Disabled");
    case "unsupported":
      return localize("update.tooltip.state.unsupported", "Unsupported");
  }
};

const getUpdateChannelLabel = (channel: DesktopUpdateChannel): string | null => {
  switch (channel) {
    case "github":
      return localize("update.tooltip.channel.github", "GitHub");
    case "generic":
      return localize("update.tooltip.channel.generic", "Generic");
    case "store":
      return localize("update.tooltip.channel.store", "Store");
    case "unsupported":
      return localize("update.tooltip.channel.unsupported", "Unsupported");
    case "none":
      return null;
  }
};
