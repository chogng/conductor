import test from "node:test";
import assert from "node:assert/strict";

import { SessionModel } from "../../browser/sessionModel.ts";

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
    session.setTemplateMode("save");
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
  assert.equal(snapshot.templateMode, "save");
  assert.equal(snapshot.selectedTemplateId, "template-a");
  assert.equal(snapshot.templateConfig.name, "Template A");
  dispose();
});

test("SessionModel subscription dispose stops future notifications", () => {
  const session = new SessionModel();
  let changeCount = 0;
  const dispose = session.subscribe(() => {
    changeCount += 1;
  });

  session.setTemplateMode("save");
  dispose();
  session.setTemplateMode("select");

  assert.equal(changeCount, 1);
  assert.equal(session.getSnapshot().templateMode, "select");
});

test("SessionModel skips notifications when the value is unchanged", () => {
  const session = new SessionModel();
  let changeCount = 0;
  const dispose = session.subscribe(() => {
    changeCount += 1;
  });

  session.setTemplateMode("select");
  session.setSelectedTemplateId(null);

  assert.equal(changeCount, 0);
  dispose();
});

test("SessionModel notifies each active subscription", () => {
  const session = new SessionModel();
  let firstChangeCount = 0;
  let secondChangeCount = 0;
  const disposeFirst = session.subscribe(() => {
    firstChangeCount += 1;
  });
  const disposeSecond = session.subscribe(() => {
    secondChangeCount += 1;
  });

  session.setTemplateMode("save");
  disposeFirst();
  session.setTemplateMode("select");

  assert.equal(firstChangeCount, 1);
  assert.equal(secondChangeCount, 2);
  disposeSecond();
});

test("SessionModel.batch restores notification state after thrown callback", () => {
  const session = new SessionModel();
  let changeCount = 0;
  const dispose = session.subscribe(() => {
    changeCount += 1;
  });

  assert.throws(
    () => {
      session.batch(() => {
        session.setTemplateMode("save");
        throw new Error("fail batch");
      });
    },
    /fail batch/,
  );

  assert.equal(changeCount, 1);
  assert.equal(session.getSnapshot().templateMode, "save");

  session.setSelectedTemplateId("template-a");

  assert.equal(changeCount, 2);
  assert.equal(session.getSnapshot().selectedTemplateId, "template-a");
  dispose();
});
