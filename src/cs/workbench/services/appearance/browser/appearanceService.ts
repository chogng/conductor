/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  areWorkbenchAppearanceSnapshotsEqual,
  getWorkbenchAppearanceSnapshot,
  IAppearanceService,
  type WorkbenchAppearanceSnapshot,
} from "src/cs/workbench/services/appearance/common/appearance";
import { ISettingsService } from "src/cs/workbench/services/settings/common/settings";

export class BrowserAppearanceService extends Disposable implements IAppearanceService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeAppearanceEmitter = this._register(new Emitter<void>());
  public readonly onDidChangeAppearance = this.onDidChangeAppearanceEmitter.event;

  private appearance: WorkbenchAppearanceSnapshot;

  constructor(
    @ISettingsService private readonly settingsService: ISettingsService,
  ) {
    super();
    this.appearance = getWorkbenchAppearanceSnapshot(
      this.settingsService.getConductorSettings(),
    );
    this._register(this.settingsService.onDidChangeConductorSettings(() => {
      this.updateAppearance();
    }));
  }

  public getAppearance(): WorkbenchAppearanceSnapshot {
    return this.appearance;
  }

  private updateAppearance(): void {
    const nextAppearance = getWorkbenchAppearanceSnapshot(
      this.settingsService.getConductorSettings(),
    );
    if (areWorkbenchAppearanceSnapshotsEqual(this.appearance, nextAppearance)) {
      return;
    }

    this.appearance = nextAppearance;
    this.onDidChangeAppearanceEmitter.fire(undefined);
  }
}

registerSingleton(IAppearanceService, BrowserAppearanceService, InstantiationType.Delayed);
