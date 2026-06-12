import { localize } from "src/cs/nls";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import { SettingsViewId } from "src/cs/workbench/services/settings/common/settings";
import { SettingsController } from "src/cs/workbench/contrib/settings/browser/settingsController";
import {
  ISettingsService,
  type ISettingsService as ISettingsServiceType,
  type SettingsViewInput,
} from "src/cs/workbench/services/settings/common/settings";
import { ICommandService } from "src/cs/platform/commands/common/commands";

export class SettingsViewPane extends ViewPane {
  private controller: SettingsController | null = null;

  constructor(
    @ISettingsService private readonly settingsService: ISettingsServiceType,
    @ICommandService private readonly commandService: ICommandService,
  ) {
    super({
      id: SettingsViewId,
      title: localize("settings.title", "Settings"),
      className: "settings-view-pane",
      bodyClassName: "workbench-part-view-pane__body",
    });
    this._register(this.settingsService.onDidChangeSettingsViewInput(() => {
      const input = this.settingsService.getSettingsViewInput();
      if (input) {
        this.update(input);
      }
    }));
    const input = this.settingsService.getSettingsViewInput();
    if (input) {
      this.update(input);
    }
  }

  public update(options: SettingsViewInput): void {
    if (this.controller) {
      this.controller.update(options);
      return;
    }

    this.controller = new SettingsController(
      this.body,
      options,
      this.settingsService,
      this.commandService,
    );
  }

  public dispose(): void {
    this.controller?.dispose();
    this.controller = null;
    super.dispose();
  }
}
