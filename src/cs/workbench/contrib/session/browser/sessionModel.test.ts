import test from "node:test";
import assert from "node:assert/strict";

import { SessionModel } from "./sessionModel.ts";

test("SessionModel.batch emits one change for multiple state writes", () => {
  const session = new SessionModel();
  let changeCount = 0;
  const dispose = session.subscribe(() => {
    changeCount += 1;
  });

  session.batch(() => {
    session.setCleanedData([]);
    session.setAnalysisResults({});
  });

  assert.equal(changeCount, 1);
  dispose();
});

test("SessionModel.batch keeps nested writes in the same notification", () => {
  const session = new SessionModel();
  let changeCount = 0;
  const dispose = session.subscribe(() => {
    changeCount += 1;
  });

  session.batch(() => {
    session.setTemplateMode("edit");
    session.batch(() => {
      session.setSelectedTemplateId("template-a");
      session.setTemplateConfig((previous) => ({
        ...previous,
        name: "Template A",
      }));
    });
  });

  const snapshot = session.getSnapshot();
  assert.equal(changeCount, 1);
  assert.equal(snapshot.templateMode, "edit");
  assert.equal(snapshot.selectedTemplateId, "template-a");
  assert.equal(snapshot.templateConfig.name, "Template A");
  dispose();
});
