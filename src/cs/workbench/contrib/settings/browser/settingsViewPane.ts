import { localize } from "src/cs/nls";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import {
  SettingsNavigationViewId,
  SettingsViewId,
} from "src/cs/workbench/services/settings/common/settings";
import {
  ISettingsControllerService,
  type ISettingsControllerService as ISettingsControllerServiceType,
} from "src/cs/workbench/contrib/settings/browser/settingsControllerService";

export class SettingsViewPane extends ViewPane {
  constructor(
    @ISettingsControllerService settingsControllerService: ISettingsControllerServiceType,
  ) {
    super({
      id: SettingsViewId,
      title: localize("settings.title", "Settings"),
      className: "settings-view-pane",
      bodyClassName: "workbench-part-view-pane__body",
    });
    this._register(settingsControllerService.attachContent(this.body));
  }
}

export class SettingsNavigationViewPane extends ViewPane {
  constructor(
    @ISettingsControllerService settingsControllerService: ISettingsControllerServiceType,
  ) {
    super({
      id: SettingsNavigationViewId,
      title: localize("settings.title", "Settings"),
      className: "settings-navigation-view-pane",
      bodyClassName: "workbench-part-view-pane__body",
    });
    this._register(settingsControllerService.attachNavigation(this.body));
  }
}
