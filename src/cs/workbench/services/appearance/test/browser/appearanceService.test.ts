/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter } from "src/cs/base/common/event";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { BrowserAppearanceService } from "src/cs/workbench/services/appearance/browser/appearanceService";
import type {
  ConductorSettings,
  ISettingsService,
} from "src/cs/workbench/services/settings/common/settings";

suite("workbench/services/appearance/browser/appearanceService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("publishes appearance changes from settings", () => {
    const settings = store.add(new TestSettingsService({
      filesExplorerBadgeColors: {
        output: "green",
      },
      filesExplorerDensity: "compact",
      filesExplorerShowBadges: true,
    }));
    const service = store.add(new BrowserAppearanceService(settings as unknown as ISettingsService));
    let changes = 0;
    const disposable = store.add(service.onDidChangeAppearance(() => {
      changes += 1;
    }));

    assert.equal(service.getAppearance().explorer.rowHeight, 22);
    assert.equal(service.getAppearance().explorer.showBadges, true);
    assert.equal(service.getAppearance().explorer.badgeColors.output, "green");

    settings.emitSettings({
      filesExplorerBadgeColors: {
        output: "blue",
      },
      filesExplorerDensity: "comfortable",
      filesExplorerShowBadges: false,
    });

    assert.equal(changes, 1);
    assert.equal(service.getAppearance().explorer.rowHeight, 30);
    assert.equal(service.getAppearance().explorer.showBadges, false);
    assert.equal(service.getAppearance().explorer.badgeColors.output, "blue");

    settings.emitSettings({
      filesExplorerDensity: "wide",
      filesExplorerShowBadges: "false",
    } as unknown as ConductorSettings);

    assert.equal(changes, 2);
    assert.equal(service.getAppearance().explorer.rowHeight, 22);
    assert.equal(service.getAppearance().explorer.showBadges, true);

    settings.emitSettings({
      filesExplorerDensity: "wide",
      filesExplorerShowBadges: "false",
    } as unknown as ConductorSettings);

    assert.equal(changes, 2);

    disposable.dispose();
    service.dispose();
    settings.dispose();
  });
});

class TestSettingsService implements Partial<ISettingsService> {
  private readonly onDidChangeConductorSettingsEmitter =
    new Emitter<ConductorSettings | null>();
  public readonly onDidChangeConductorSettings =
    this.onDidChangeConductorSettingsEmitter.event;

  constructor(private settings: ConductorSettings | null) {}

  public getConductorSettings(): ConductorSettings | null {
    return this.settings;
  }

  public emitSettings(settings: ConductorSettings | null): void {
    this.settings = settings;
    this.onDidChangeConductorSettingsEmitter.fire(settings);
  }

  public dispose(): void {
    this.onDidChangeConductorSettingsEmitter.dispose();
  }
}
