import assert from "node:assert/strict";

import { ConfigurationTarget } from "src/cs/platform/configuration/common/configuration";
import { ConfigurationService } from "src/cs/platform/configuration/common/configurationService";
import { OriginMainService } from "src/cs/platform/origin/electron-main/originMainServiceImpl";

suite("platform/origin/electron-main/originMainService", () => {
  test("reads Origin defaults from IConfigurationService", () => {
    const configurationService = new ConfigurationService();
    const service = new OriginMainService(configurationService);

    assert.equal(service.getOriginExePath(), null);
    assert.deepEqual(service.getRuntimeCleanupPolicy(), {
      enabled: true,
      keepSuccessJobs: 1,
      failedRetentionDays: 7,
    });
    assert.deepEqual(service.getPlotOptions(), {
      plotType: 202,
      xyPairs: "((1,2))",
      plotCommand: "",
      postPlotCommands: [],
      lineWidth: 2,
    });

    configurationService.dispose();
  });

  test("writes origin executable path through IConfigurationService", async () => {
    const configurationService = new ConfigurationService();
    const service = new OriginMainService(configurationService);

    await service.setOriginExePath(" C:\\Origin\\Origin64.exe ");

    assert.equal(service.getOriginExePath(), "C:\\Origin\\Origin64.exe");
    assert.equal(
      configurationService.inspect<string | null>("originExePath").userValue,
      "C:\\Origin\\Origin64.exe",
    );

    configurationService.dispose();
  });

  test("normalizes configured Origin plot defaults", async () => {
    const configurationService = new ConfigurationService();
    await configurationService.updateValue("originPlotTypeDefault", 201, ConfigurationTarget.USER);
    await configurationService.updateValue("originPlotXyPairsDefault", " ((2,3)) ", ConfigurationTarget.USER);
    await configurationService.updateValue("originPlotCommandDefault", " plotxy iy:=((1,2)) ", ConfigurationTarget.USER);
    await configurationService.updateValue("originPlotPostCommandsDefault", "rescale;\nlegend -s;", ConfigurationTarget.USER);
    await configurationService.updateValue("originPlotLineWidthDefault", 3.25, ConfigurationTarget.USER);
    const service = new OriginMainService(configurationService);

    assert.deepEqual(service.getPlotOptions(), {
      plotType: 201,
      xyPairs: "((2,3))",
      plotCommand: "plotxy iy:=((1,2))",
      postPlotCommands: ["rescale;", "legend -s;"],
      lineWidth: 3.25,
    });

    configurationService.dispose();
  });
});
