import { localize } from "src/cs/nls";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import { SettingsViewId } from "src/cs/workbench/services/settings/common/settings";
import {
  SettingsController,
  type SettingsControllerOptions,
} from "src/cs/workbench/contrib/settings/browser/settingsController";
import {
  ISettingsService,
  type ISettingsService as ISettingsServiceType,
  type SettingsViewInput,
} from "src/cs/workbench/services/settings/common/settings";

export type SettingsViewPaneProps = SettingsViewInput;

export class SettingsViewPane extends ViewPane {
  private controller: SettingsController | null = null;

  constructor(
    @ISettingsService private readonly settingsService: ISettingsServiceType,
  ) {
    super({
      id: SettingsViewId,
      title: localize("settings.title", "Settings"),
      className: "settings-view-pane",
      bodyClassName: "workbench-part-view-pane__body",
    });
    this._register(this.settingsService.onDidChangeSettingsViewInput(input => {
      this.update(input);
    }));
    const input = this.settingsService.getSettingsViewInput();
    if (input) {
      this.update(input);
    }
  }

  public update(options: SettingsViewPaneProps): void {
    if (this.controller) {
      this.controller.update(toControllerOptions(options));
      return;
    }

    this.controller = new SettingsController(
      this.body,
      toControllerOptions(options),
      this.settingsService,
    );
  }

  public dispose(): void {
    this.controller?.dispose();
    this.controller = null;
    super.dispose();
  }
}

const toControllerOptions = ({
  appUpdateSettings,
  conductorSettings,
  conductorSettingsLoaded,
  handleLanguageChange,
  handleResetLayoutState,
  handleThemeChange,
  updateConductorSettings,
  isWindowsDesktopShell,
  language,
  mergeConductorSettings,
  theme,
}: SettingsViewPaneProps): SettingsControllerOptions => ({
  appUpdateSettings,
  conductorSettings,
  conductorSettingsLoaded,
  handleLanguageChange,
  handleResetLayoutState,
  handleThemeChange,
  updateConductorSettings,
  isWindowsDesktopShell,
  language,
  mergeConductorSettings,
  theme,
});
