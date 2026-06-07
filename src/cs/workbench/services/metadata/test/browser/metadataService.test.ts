import * as assert from "assert";

import { CurveMetadataService } from "src/cs/workbench/services/metadata/browser/metadataService";
import type { CurveChangeEvent } from "src/cs/workbench/services/metadata/common/metadata";

suite("workbench/services/metadata/test/browser/metadataService", () => {
  test("stores metadata, data, and view state as separate curve layers", () => {
    const service = new CurveMetadataService();

    service.setCurveMetadata({
      curveId: "curve-a",
      fileId: "file-a",
      kind: "iv",
      x: { label: "Vd", role: "vd", unit: "V" },
      y: { label: "Id", role: "id", scale: "log", unit: "A" },
    });
    service.setCurveData({
      curveId: "curve-a",
      fileId: "file-a",
      points: [
        { x: 0, y: 1e-9 },
        { x: 1, y: 2e-9 },
      ],
    });
    service.updateCurveViewState(
      { curveId: "curve-a", fileId: "file-a" },
      {
        axisTitleOverrides: { y: "Drain Current" },
        color: "#2563eb",
      },
    );

    const model = service.getCurveModel({ curveId: "curve-a", fileId: "file-a" });

    assert.equal(model?.metadata?.y.scale, "log");
    assert.equal(model?.data?.points.length, 2);
    assert.equal(model?.viewState.axisTitleOverrides?.y, "Drain Current");
    assert.equal(model?.viewState.color, "#2563eb");

    service.dispose();
  });

  test("updates metadata without mixing view state into semantic metadata", () => {
    const service = new CurveMetadataService();

    service.setCurveMetadata({
      curveId: "curve-a",
      fileId: "file-a",
      kind: "iv",
      x: { label: "Vd", unit: "V" },
      y: { label: "Id", scale: "linear", unit: "A" },
    });
    service.updateCurveMetadata(
      { curveId: "curve-a", fileId: "file-a" },
      { y: { scale: "log", unit: "nA" } },
    );

    assert.deepEqual(service.getCurveMetadata({ curveId: "curve-a", fileId: "file-a" })?.y, {
      label: "Id",
      scale: "log",
      unit: "nA",
    });
    assert.deepEqual(service.getCurveViewState({ curveId: "curve-a", fileId: "file-a" }), {});

    service.dispose();
  });

  test("emits changes and prunes removed files", () => {
    const service = new CurveMetadataService();
    const events: CurveChangeEvent[] = [];
    const listener = service.onDidChangeCurve((event) => events.push(event));

    service.setCurveData({
      curveId: "curve-a",
      fileId: "file-a",
      points: [{ x: 0, y: 1 }],
    });
    service.setCurveData({
      curveId: "curve-b",
      fileId: "file-b",
      points: [{ x: 0, y: 2 }],
    });
    service.prune(["file-a"]);

    assert.ok(service.getCurveData({ curveId: "curve-a", fileId: "file-a" }));
    assert.equal(service.getCurveData({ curveId: "curve-b", fileId: "file-b" }), undefined);
    assert.deepEqual(events, [
      { curveId: "curve-a", fileId: "file-a", kind: "data" },
      { curveId: "curve-b", fileId: "file-b", kind: "data" },
      { curveId: "curve-b", fileId: "file-b", kind: "prune" },
    ]);

    listener.dispose();
    service.dispose();
  });
});
