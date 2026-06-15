import assert from "assert";

import {
  ConfigurationTarget,
  type IConfigurationChangeEvent,
} from "src/cs/platform/configuration/common/configuration";
import { ConfigurationService } from "src/cs/platform/configuration/common/configurationService";
import {
  Extensions,
  type IConfigurationRegistry,
} from "src/cs/platform/configuration/common/configurationRegistry";
import { Registry } from "src/cs/platform/registry/common/platform";

suite("platform/configuration/common/configurationService", () => {
  test("reads Conductor defaults from the configuration registry", () => {
    const service = new ConfigurationService();

    assert.equal(service.getValue("theme"), "system");
    assert.equal(service.getValue("originRuntimeKeepSuccessJobs"), 1);
    assert.deepEqual(service.getValue("plotAxisSettings"), {
      xMin: "",
      xMax: "",
      xTicks: "auto",
      xTickCount: 6,
      xStep: "",
      xTooltipDigits: "",
      yMin: "",
      yMax: "",
      yScale: "linear",
      yLogCurrentMode: "all",
      yTicks: "nice",
      yTickCount: 6,
      yStep: "",
      yDecadeStep: 1,
      showGrid: true,
      showMajorTicks: true,
      showMinorTicks: true,
      minorTickCount: "",
      tickLabelFontSize: "",
      axisTitleFontSize: "",
      originTickLabelOffset: "",
      originAxisTitleGap: "",
    });

    service.dispose();
  });

  test("reads defaults from configuration registry", () => {
    const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
    const configuration = {
      id: "serviceDefaults",
      properties: {
        "service.defaultValue": {
          type: "number" as const,
          default: 12,
        },
      },
    };

    registry.registerConfiguration(configuration);
    const service = new ConfigurationService();

    assert.equal(service.getValue("service.defaultValue"), 12);
    assert.equal(service.inspect("service.defaultValue").defaultValue, 12);

    service.dispose();
    registry.deregisterConfigurations([configuration]);
  });

  test("updates user values and emits change events", async () => {
    const service = new ConfigurationService();
    const events: IConfigurationChangeEvent[] = [];
    const disposable = service.onDidChangeConfiguration(event => {
      events.push(event);
    });

    await service.updateValue("service.userValue", "configured", ConfigurationTarget.USER);

    assert.equal(service.getValue("service.userValue"), "configured");
    assert.equal(service.inspect("service.userValue").userLocalValue, "configured");
    assert.equal(events.length, 1);
    assert.equal(events[0].affectsConfiguration("service"), true);

    disposable.dispose();
    service.dispose();
  });

  test("updates override values", async () => {
    const service = new ConfigurationService();

    await service.updateValue(
      "editor.tabSize",
      2,
      { overrideIdentifiers: ["json"] },
      ConfigurationTarget.USER,
    );

    assert.equal(
      service.getValue("editor.tabSize", { overrideIdentifier: "json" }),
      2,
    );
    assert.deepEqual(service.inspect("editor.tabSize").overrideIdentifiers, ["json"]);

    service.dispose();
  });
});
