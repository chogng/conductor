import assert from "assert";

import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";

suite("workbench/services/session/test/browser/sessionService", () => {
  test("batches multiple state writes into one notification", () => {
    const session = new SessionService();
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

  test("keeps nested writes in the same batch notification", () => {
    const session = new SessionService();
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

  test("subscription dispose stops future notifications", () => {
    const session = new SessionService();
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

  test("skips notifications when the value is unchanged", () => {
    const session = new SessionService();
    let changeCount = 0;
    const dispose = session.subscribe(() => {
      changeCount += 1;
    });

    session.setTemplateMode("select");
    session.setSelectedTemplateId(null);

    assert.equal(changeCount, 0);
    dispose();
  });

  test("stores file template selections", () => {
    const session = new SessionService();

    session.setFileTemplateSelectionsByFileId({
      "file-a": { kind: "template", templateId: "template-a" },
      "file-b": { kind: "auto" },
    });

    assert.deepEqual(session.getSnapshot().fileTemplateSelectionsByFileId, {
      "file-a": { kind: "template", templateId: "template-a" },
      "file-b": { kind: "auto" },
    });
  });

  test("notifies each active subscription", () => {
    const session = new SessionService();
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

  test("restores notification state after thrown batch callback", () => {
    const session = new SessionService();
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

  test("stores file metadata and curve data in the session metadata table", () => {
    const session = new SessionService();
    let changes = 0;
    session.subscribe(() => changes++);

    session.batch(() => {
      session.setFileMetadata({
        fileId: " file-a ",
        kind: "iv",
        sourceFileName: "Output.csv",
        x: {
          label: "Vd",
          unit: "V",
        },
        y: {
          label: "Id",
          scale: "log",
          unit: "A",
        },
      });
      session.setCurveData({
        curveKind: "iv",
        fileId: "file-a",
        seriesId: "series-1",
        points: [
          { x: 0, y: 1 },
          { x: 1, y: 2 },
        ],
        signature: "sig:series-1",
      });
      session.setSeriesLabel("file-a", "series-1", "Vg=1");
    });

    const metadata = session.getFileMetadata("file-a");
    const curve = session.getCurveData({
      curveKind: "iv",
      fileId: "file-a",
      seriesId: "series-1",
    });

    assert.equal(changes, 1);
    assert.equal(metadata?.fileId, "file-a");
    assert.equal(metadata?.x.unit, "V");
    assert.equal(metadata?.y.scale, "log");
    assert.equal(curve?.points.length, 2);
    assert.equal(session.getSeriesLabel("file-a", "series-1"), "Vg=1");
    assert.deepEqual(Object.keys(session.getSnapshot().metadata.filesById), ["file-a"]);
  });

  test("updates file metadata without duplicating curve-level axis state", () => {
    const session = new SessionService();
    session.setFileMetadata({
      fileId: "file-a",
      kind: "iv",
      x: {
        label: "Vd",
        unit: "V",
      },
      y: {
        label: "Id",
        scale: "linear",
        unit: "A",
      },
    });

    session.updateFileMetadata("file-a", {
      x: { unit: "mV" },
      y: { scale: "log" },
    });

    const metadata = session.getFileMetadata("file-a");
    assert.equal(metadata?.x.label, "Vd");
    assert.equal(metadata?.x.unit, "mV");
    assert.equal(metadata?.y.label, "Id");
    assert.equal(metadata?.y.scale, "log");
  });

  test("prunes stale metadata by file id and curve key", () => {
    const session = new SessionService();
    session.batch(() => {
      session.setFileMetadata({
        fileId: "file-a",
        kind: "iv",
        x: { unit: "V" },
        y: { scale: "linear", unit: "A" },
      });
      session.setFileMetadata({
        fileId: "file-b",
        kind: "iv",
        x: { unit: "V" },
        y: { scale: "linear", unit: "A" },
      });
      session.setCurveData({
        curveKind: "iv",
        fileId: "file-a",
        seriesId: "series-1",
        points: [{ x: 0, y: 1 }],
      });
      session.setCurveData({
        curveKind: "iv",
        fileId: "file-b",
        seriesId: "series-2",
        points: [{ x: 0, y: 2 }],
      });
    });

    session.pruneMetadata([
      "file-a",
    ], [{
      curveKind: "iv",
      fileId: "file-a",
      seriesId: "series-1",
    }]);

    assert.ok(session.getFileMetadata("file-a"));
    assert.equal(session.getFileMetadata("file-b"), undefined);
    assert.ok(session.getCurveData({
      curveKind: "iv",
      fileId: "file-a",
      seriesId: "series-1",
    }));
    assert.equal(session.getCurveData({
      curveKind: "iv",
      fileId: "file-b",
      seriesId: "series-2",
    }), undefined);
  });

  test("stores series labels and resolves overrides before source labels", () => {
    const session = new SessionService();

    session.setSeriesLabel("file-a", "series-a", "Edited Label");

    assert.equal(session.getSeriesLabel("file-a", "series-a"), "Edited Label");
    assert.deepEqual(session.getSeriesLabels("file-a"), {
      "series-a": "Edited Label",
    });
    assert.equal(
      session.resolveSeriesLabel(
        { fileId: "file-a" },
        { id: "series-a", legendValue: "Vg=0", name: "Source Label" },
        0,
      ),
      "Edited Label",
    );
  });

  test("resolves series label fallback from legend value, name, and series index", () => {
    const session = new SessionService();

    assert.equal(
      session.resolveSeriesLabel({ fileId: "file-a" }, { id: "series-a", legendValue: "Vg=0" }, 0),
      "Vg=0",
    );
    assert.equal(
      session.resolveSeriesLabel({ fileId: "file-a" }, { id: "series-a", name: "Source Label" }, 0),
      "Source Label",
    );
    assert.equal(
      session.resolveSeriesLabel({ fileId: "file-a" }, { id: "series-a" }, 2),
      "Series 3",
    );
  });

  test("prunes stale series labels", () => {
    const session = new SessionService();

    session.setSeriesLabel("file-a", "series-a", "Edited A");
    session.setSeriesLabel("file-a", "series-b", "Edited B");
    session.setSeriesLabel("file-b", "series-c", "Edited C");
    session.pruneSeriesLabels([
      {
        fileId: "file-a",
        series: [{ id: "series-a" }],
      },
    ]);

    assert.deepEqual(session.getSeriesLabels("file-a"), {
      "series-a": "Edited A",
    });
    assert.deepEqual(session.getSeriesLabels("file-b"), {});
    assert.deepEqual(session.getSnapshot().metadata.seriesLabelsByFileId, {
      "file-a": {
        "series-a": "Edited A",
      },
    });
  });
});
