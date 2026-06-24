/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { evaluateRecipeSelector } from "src/cs/workbench/services/template/common/recipeSelectorEvaluator";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/tableFacts/common/rawTableStructure";
import type {
  MeasurementBlockRecord,
  MeasurementColumnRef,
} from "src/cs/workbench/services/tableFacts/common/measurement";
import { builtinRecipes } from "src/cs/workbench/services/recipe/common/builtinRecipes.generated";
import type { RawTableFacts } from "src/cs/workbench/services/template/common/tableFacts";

suite("workbench/services/template/test/common/recipeSelectorEvaluator", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("matches builtin IV transfer recipe against table-fact block evidence", () => {
    const recipe = builtinRecipes.find(candidate => candidate.id === "builtin.iv.transfer");
    assert.ok(recipe);

    const evaluation = evaluateRecipeSelector(recipe, createTableFacts({
      family: "iv",
      ivMode: "transfer",
      columns: [{
        rawCol: 0,
        headerText: "Vg",
        role: "vg",
        unit: "V",
      }, {
        rawCol: 1,
        headerText: "Id",
        role: "id",
        unit: "A",
      }],
    }));

    assert.equal(evaluation.matched, true);
    assert.deepEqual(evaluation.matches.map(match => match.blockId), ["block-a"]);
    assert.deepEqual(evaluation.matches[0]?.captures, {
      x: {
        kind: "columns",
        columns: [0],
        unit: "V",
      },
      y: {
        kind: "columns",
        columns: [1],
        unit: "A",
      },
    });
  });

  test("rejects a recipe when required canonical units are missing", () => {
    const recipe = builtinRecipes.find(candidate => candidate.id === "builtin.iv.transfer");
    assert.ok(recipe);

    const evaluation = evaluateRecipeSelector(recipe, createTableFacts({
      family: "iv",
      ivMode: "transfer",
      columns: [{
        rawCol: 0,
        headerText: "Vg",
        role: "vg",
        unit: "V",
      }, {
        rawCol: 1,
        headerText: "Id",
        role: "id",
        unit: "mA",
      }],
    }));

    assert.equal(evaluation.matched, false);
    assert.deepEqual(evaluation.diagnosticCodes, ["recipeSelector.columnRoleMismatch"]);
  });
});

const createTableFacts = ({
  columns,
  family,
  ivMode,
}: {
  readonly columns: readonly MeasurementColumnRef[];
  readonly family: MeasurementBlockRecord["family"];
  readonly ivMode?: MeasurementBlockRecord["ivMode"];
}): RawTableFacts => ({
  structure: {
    ...createEmptyRawTableStructure(),
    fingerprint: "schema-a",
  },
  columnProfiles: [],
  layoutCandidates: [{
    id: "layout-a",
    layoutKind: "simpleXY",
    confidence: 0.9,
    bindings: [{
      xCol: 0,
      yCols: [1],
    }],
    reasons: [],
  }],
  semanticCandidates: [],
  blocks: [{
    id: "block-a",
    fileId: "file-a",
    rawTableId: "table-a",
    label: "Block A",
    family,
    ivMode,
    source: {
      fullRange: {
        startRow: 0,
        endRow: 1,
        startCol: 0,
        endCol: 1,
      },
    },
    columns: {
      columns,
    },
    rowCount: 2,
    columnCount: 2,
    confidence: 0.95,
    diagnosticCodes: [],
  }],
  sourceMetadata: {
    fileId: "file-a",
    rawTableId: "table-a",
    fileName: "transfer.csv",
    rowCount: 2,
    columnCount: 2,
    sourceRawTableVersion: 1,
  },
});
