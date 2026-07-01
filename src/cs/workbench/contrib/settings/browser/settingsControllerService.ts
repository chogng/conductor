/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { ICommandService } from "src/cs/platform/commands/common/commands";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import { SettingsController } from "src/cs/workbench/contrib/settings/browser/settingsController";
import {
  ISettingsService,
  type ISettingsService as ISettingsServiceType,
  type SettingsViewInput,
} from "src/cs/workbench/services/settings/common/settings";
import { INotificationService } from "src/cs/workbench/services/notification/common/notificationService";

export const ISettingsControllerService = createDecorator<ISettingsControllerService>("settingsControllerService");

export interface ISettingsControllerService {
  readonly _serviceBrand: undefined;

  attachContent(container: HTMLElement): IDisposable;
  attachNavigation(container: HTMLElement): IDisposable;
}

export class SettingsControllerService extends Disposable implements ISettingsControllerService {
  public declare readonly _serviceBrand: undefined;

  private controller: SettingsController | null = null;
  private input: SettingsViewInput | null;

  public constructor(
    @ISettingsService private readonly settingsService: ISettingsServiceType,
    @ICommandService private readonly commandService: ICommandService,
    @INotificationService private readonly notificationService: INotificationService,
  ) {
    super();

    this.input = this.settingsService.getSettingsViewInput();
    this._register(this.settingsService.onDidChangeSettingsViewInput(() => {
      this.input = this.settingsService.getSettingsViewInput();
      if (this.input) {
        this.getOrCreateController(this.input).update(this.input);
      }
    }));
  }

  public attachContent(container: HTMLElement): IDisposable {
    const controller = this.getCurrentController();
    return controller?.attachContent(container) ?? toDisposable(() => undefined);
  }

  public attachNavigation(container: HTMLElement): IDisposable {
    const controller = this.getCurrentController();
    return controller?.attachNavigation(container) ?? toDisposable(() => undefined);
  }

  public override dispose(): void {
    this.controller?.dispose();
    this.controller = null;
    super.dispose();
  }

  private getCurrentController(): SettingsController | null {
    return this.input ? this.getOrCreateController(this.input) : null;
  }

  private getOrCreateController(input: SettingsViewInput): SettingsController {
    if (!this.controller) {
      this.controller = new SettingsController(
        null,
        input,
        this.settingsService,
        this.commandService,
        this.notificationService,
      );
    }
    return this.controller;
  }
}

registerSingleton(ISettingsControllerService, SettingsControllerService, InstantiationType.Delayed);
