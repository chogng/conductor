import assert from "assert";

import {
  defaultSessionModel,
  getSession,
} from "../../browser/session.ts";

suite("workbench/contrib/session/test/browser/session", () => {
  test("getSession reflects the default session model snapshot and setters", () => {
    const previous = getSession();

    try {
      defaultSessionModel.setTemplateMode("save");
      defaultSessionModel.setSelectedTemplateId("template-a");

      const session = getSession();
      assert.equal(session.templateMode, "save");
      assert.equal(session.selectedTemplateId, "template-a");

      session.setSelectedTemplateId("template-b");
      assert.equal(defaultSessionModel.getSnapshot().selectedTemplateId, "template-b");
    } finally {
      defaultSessionModel.batch(() => {
        defaultSessionModel.setTemplateMode(previous.templateMode);
        defaultSessionModel.setSelectedTemplateId(previous.selectedTemplateId);
        defaultSessionModel.setTemplateConfig(previous.templateConfig);
      });
    }
  });
});
