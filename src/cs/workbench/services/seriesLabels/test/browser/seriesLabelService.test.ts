import * as assert from "assert";

import { SeriesLabelService } from "src/cs/workbench/services/seriesLabels/browser/seriesLabelService";

suite("workbench/services/seriesLabels/test/browser/seriesLabelService", () => {
  test("stores labels and resolves override before source labels", () => {
    const service = new SeriesLabelService();

    service.setLabel("file-a", "series-a", "Edited Label");

    assert.equal(service.getLabel("file-a", "series-a"), "Edited Label");
    assert.deepEqual(service.getLabels("file-a"), {
      "series-a": "Edited Label",
    });
    assert.equal(
      service.resolveLabel(
        { fileId: "file-a" },
        { id: "series-a", legendValue: "Vg=0", name: "Source Label" },
        0,
      ),
      "Edited Label",
    );

    service.dispose();
  });

  test("falls back to legend value, name, and series index", () => {
    const service = new SeriesLabelService();

    assert.equal(
      service.resolveLabel({ fileId: "file-a" }, { id: "series-a", legendValue: "Vg=0" }, 0),
      "Vg=0",
    );
    assert.equal(
      service.resolveLabel({ fileId: "file-a" }, { id: "series-a", name: "Source Label" }, 0),
      "Source Label",
    );
    assert.equal(
      service.resolveLabel({ fileId: "file-a" }, { id: "series-a" }, 2),
      "Series 3",
    );

    service.dispose();
  });

  test("emits changes and prunes stale labels", () => {
    const service = new SeriesLabelService();
    const events: Array<{ fileId: string; label: string | null; seriesId: string }> = [];
    const listener = service.onDidChangeSeriesLabels((event) => events.push(event));

    service.setLabel("file-a", "series-a", "Edited A");
    service.setLabel("file-a", "series-b", "Edited B");
    service.prune([
      {
        fileId: "file-a",
        series: [{ id: "series-a" }],
      },
    ]);

    assert.deepEqual(service.getLabels("file-a"), {
      "series-a": "Edited A",
    });
    assert.deepEqual(events, [
      { fileId: "file-a", label: "Edited A", seriesId: "series-a" },
      { fileId: "file-a", label: "Edited B", seriesId: "series-b" },
      { fileId: "file-a", label: null, seriesId: "series-b" },
    ]);

    listener.dispose();
    service.dispose();
  });
});
