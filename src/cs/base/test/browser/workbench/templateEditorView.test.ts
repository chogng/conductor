/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { createEmptyTemplateEditorConfig } from "src/cs/workbench/services/template/common/templateEditorConfig";
import {
  TemplateEditorView,
  type TemplateEditorViewState,
} from "src/cs/workbench/contrib/template/browser/views/templateEditorView";

suite("base/browser/workbench/templateEditorView", () => {
  test("reports selection changes and synchronizes the grouping SelectBox", () => {
    if (typeof document === "undefined") {
      return;
    }

    const updates: Array<{ readonly xSegmentationMode?: "auto" | "points" | "segments" }> = [];
    let state: TemplateEditorViewState = {
      activePickField: null,
      activeColumnPickTarget: "xRanges",
      config: createEmptyTemplateEditorConfig(),
      selectedXRangeLabels: [],
      selectedYColumnLabels: [],
    };
    let view: TemplateEditorView;
    view = new TemplateEditorView({
      contextMenuService: { showContextMenu: () => undefined },
      onCancel: () => undefined,
      onColumnPickTargetChange: () => undefined,
      onPickFieldFocus: () => undefined,
      onSave: () => undefined,
      onUpdateConfig: update => {
        updates.push(update);
        state = {
          ...state,
          config: { ...state.config, ...update },
        };
        view.update(state);
      },
    }, state);
    document.body.append(view.element);

    const select = view.element.querySelector<HTMLButtonElement>("#template_editor_grouping");
    assert.ok(select);

    try {
      select.click();
      const option = Array.from(document.body.querySelectorAll<HTMLButtonElement>(".ui-selectbox__option"))
        .find(candidate => candidate.textContent === "Point count");
      assert.ok(option);
      option.click();

      assert.deepEqual(updates, [{ xSegmentationMode: "points" }]);
      assert.equal(select.querySelector(".ui-selectbox__label")?.textContent, "Point count");
    } finally {
      view.dispose();
    }
  });
});
