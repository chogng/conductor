import assert from "assert";

import {
  createCalculatedData,
  createCalculatedDataByKey,
  createCalculatedDataKey,
  createCalculatedSeries,
  createSecondCalculatedData,
  getCalculatedData,
  getCalculatedYUnitLabel,
} from "../../common/calculatedData.ts";

suite("workbench/contrib/calculation/test/common/calculatedData", () => {
  const createFile = (overrides = {}) => ({
    fileId: "file-a",
    fileName: "file-a.csv",
    xGroups: [[0, 1, 2]],
    xUnit: "V",
    yUnit: "A",
    series: [
      {
        id: "series-a",
        groupIndex: 0,
        legendValue: "Vd=0.1",
        y: [1, 2, 4],
      },
    ],
    ...overrides,
  });

  test("createCalculatedData builds drawable IV series for the active file", () => {
    const model = createCalculatedData({
      activeFileId: "file-b",
      plotType: "iv",
      cleanedData: [
        createFile(),
        createFile({
          fileId: "file-b",
          xGroups: [[-1, 0, 1]],
          series: [{ id: "series-b", groupIndex: 0, y: [-2, 0, 2] }],
        }),
      ],
    });

    assert.equal(model.activeFile?.fileId, "file-b");
    assert.equal(model.kind, "iv");
    assert.deepEqual(model.source, { fileId: "file-b", inputKind: "cleaned" });
    assert.equal(model.seriesList.length, 1);
    assert.equal(model.seriesList[0].kind, "iv");
    assert.equal(model.pointsCount, 3);
    assert.deepEqual(model.xDomain, [-1, 1]);
    assert.deepEqual(model.yDomain, [-2, 2]);
    assert.equal(typeof model.signature, "string");
    assert.notEqual(model.signature, "");
    assert.deepEqual(
      model.seriesList[0].data.map((point) => point.yAbsPositive),
      [2, null, 2],
    );
  });

  test("createCalculatedSeries derives GM points from IV source points", () => {
    const series = createCalculatedSeries(createFile(), "gm");

    assert.equal(series.length, 1);
    assert.deepEqual(
      series[0].data.map((point) => point.y),
      [1, 1.5, 2],
    );
  });

  test("createCalculatedSeries keeps curves without explicit ids", () => {
    const series = createCalculatedSeries(
      createFile({
        fileId: "file-c",
        series: [
          {
            groupIndex: 0,
            legendValue: "Vg=-60",
            y: [1, 2, 3],
            yCol: 3,
          },
        ],
      }),
      "iv",
    );

    assert.equal(series.length, 1);
    assert.equal(series[0].id, "file-c:x0:y3");
    assert.equal(series[0].name, "Vg=-60");
    assert.deepEqual(
      series[0].data.map((point) => point.y),
      [1, 2, 3],
    );
  });

  test("createCalculatedSeries keeps duplicate source ids separate", () => {
    const series = createCalculatedSeries(
      createFile({
        series: [
          { id: "series-a", groupIndex: 0, legendValue: "Vg=-60", y: [1, 2, 3] },
          { id: "series-a", groupIndex: 0, legendValue: "Vg=-40", y: [4, 5, 6] },
        ],
      }),
      "iv",
    );

    assert.deepEqual(series.map((item) => item.id), ["series-a", "series-a:1"]);
    assert.deepEqual(series.map((item) => item.name), ["Vg=-60", "Vg=-40"]);
  });

  test("createCalculatedSeries reads array-like y values like thumbnails", () => {
    const series = createCalculatedSeries(
      createFile({
        xGroups: [Float64Array.from([0, 1, 2])],
        series: [
          {
            groupIndex: 0,
            legendValue: "Vg=-40",
            y: Float64Array.from([1e-5, 2e-5, 3e-5]),
            yCol: 4,
          },
        ],
      }),
      "iv",
    );

    assert.equal(series.length, 1);
    assert.deepEqual(
      series[0].data.map((point) => point.y),
      [1e-5, 2e-5, 3e-5],
    );
  });

  test("createCalculatedSeries derives VTH sqrt current points", () => {
    const series = createCalculatedSeries(
      createFile({
        series: [{ id: "series-a", groupIndex: 0, y: [-4, 0, 9] }],
      }),
      "vth",
    );

    assert.deepEqual(
      series[0].data.map((point) => point.y),
      [2, 0, 3],
    );
    assert.equal(getCalculatedYUnitLabel("vth", createFile()), "sqrt(|I|)");
  });

  test("createCalculatedData falls back to an empty drawable domain", () => {
    const model = createCalculatedData({
      activeFileId: "missing",
      plotType: "iv",
      cleanedData: [
        createFile({
          xGroups: [[]],
          series: [{ id: "series-a", groupIndex: 0, y: [] }],
        }),
      ],
    });

    assert.equal(model.seriesList.length, 0);
    assert.deepEqual(model.xDomain, [0, 1]);
    assert.deepEqual(model.yDomain, [0, 1]);
  });

  test("createCalculatedDataByKey stores each file and plot type in session-friendly keys", () => {
    const byKey = createCalculatedDataByKey([
      createFile(),
      createFile({ fileId: "file-b" }),
    ]);

    assert.equal(
      getCalculatedData(byKey, "gm", "file-b")?.activeFile?.fileId,
      "file-b",
    );
    assert.deepEqual(
      getCalculatedData(byKey, "vth", "file-a")?.seriesList[0].data.map((point) => point.y),
      [1, Math.SQRT2, 2],
    );
    assert.equal(
      byKey[createCalculatedDataKey({ fileId: "file-a", plotType: "ss" })]?.activeFile?.fileId,
      "file-a",
    );
  });

  test("getCalculatedData falls back to the first file for a plot type", () => {
    const byKey = createCalculatedDataByKey([
      createFile(),
      createFile({ fileId: "file-b" }),
    ]);

    assert.equal(getCalculatedData(byKey, "iv")?.activeFile?.fileId, "file-a");
  });

  test("createCalculatedData signature changes when point data changes", () => {
    const left = createCalculatedData({
      activeFileId: "file-a",
      plotType: "iv",
      cleanedData: [createFile({ series: [{ id: "series-a", groupIndex: 0, y: [1, 2, 4] }] })],
    });
    const right = createCalculatedData({
      activeFileId: "file-a",
      plotType: "iv",
      cleanedData: [createFile({ series: [{ id: "series-a", groupIndex: 0, y: [1, 3, 4] }] })],
    });

    assert.deepEqual(left.yDomain, right.yDomain);
    assert.notEqual(left.signature, right.signature);
  });

  test("createSecondCalculatedData derives drawable second-pass data from calculated data", () => {
    const source = createCalculatedData({
      activeFileId: "file-a",
      plotType: "gm",
      cleanedData: [createFile()],
    });
    const second = createSecondCalculatedData(source);

    assert.equal(second.kind, "secondDerivative");
    assert.deepEqual(second.source, { fileId: "file-a", inputKind: "gm" });
    assert.equal(second.seriesList[0].kind, "secondDerivative");
    assert.deepEqual(
      second.seriesList[0].data.map((point) => point.y),
      [0.5, 0.5, 0.5],
    );
  });
});
