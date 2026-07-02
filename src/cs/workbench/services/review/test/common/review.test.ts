/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { createReviewEvidenceSignature } from "src/cs/workbench/services/review/common/review";
import type { ReviewEvidence } from "src/cs/workbench/services/review/common/reviewModel";

suite("workbench/services/review/test/common/review", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("includes URI-backed source versions in evidence signatures", () => {
    const baseSignature = createReviewEvidenceSignature(createReviewEvidence());
    const uriSignature = createReviewEvidenceSignature(createReviewEvidence({
      sourceModelVersion: 6,
      sourceUri: "file:///workspace/data/source.csv",
      sourceVersion: 5,
    }));

    assert.notEqual(baseSignature, uriSignature);
    assert.deepEqual(JSON.parse(uriSignature).sourceMetadata, {
      columnCount: 2,
      fileName: "transfer.csv",
      rowCount: 2,
      sourceModelVersion: 6,
      sourceUri: "file:///workspace/data/source.csv",
      sourceVersion: 5,
    });
  });

  test("includes URI sheet targets in evidence signatures", () => {
    const firstSheetSignature = createReviewEvidenceSignature(createReviewEvidence({
      sourceModelVersion: 6,
      sourceUri: "file:///workspace/data/source.xlsx",
      sourceVersion: 5,
    }), {
      sheetId: "sheet-a",
    });
    const secondSheetSignature = createReviewEvidenceSignature(createReviewEvidence({
      sourceModelVersion: 6,
      sourceUri: "file:///workspace/data/source.xlsx",
      sourceVersion: 5,
    }), {
      sheetId: "sheet-b",
    });

    assert.notEqual(firstSheetSignature, secondSheetSignature);
    assert.equal(JSON.parse(firstSheetSignature).sourceMetadata.sheetId, "sheet-a");
  });

  test("includes URI content hashes in evidence signatures", () => {
    const firstContentSignature = createReviewEvidenceSignature(createReviewEvidence({
      sourceModelVersion: 6,
      sourceUri: "file:///workspace/data/source.csv",
      sourceVersion: 5,
    }), {
      contentHash: "sha256:first",
    });
    const secondContentSignature = createReviewEvidenceSignature(createReviewEvidence({
      sourceModelVersion: 6,
      sourceUri: "file:///workspace/data/source.csv",
      sourceVersion: 5,
    }), {
      contentHash: "sha256:second",
    });

    assert.notEqual(firstContentSignature, secondContentSignature);
    assert.equal(JSON.parse(firstContentSignature).sourceMetadata.contentHash, "sha256:first");
  });

  test("includes structured content evidence in signatures", () => {
    const signature = createReviewEvidenceSignature(createReviewEvidence());

    assert.deepEqual(JSON.parse(signature).structuredContent.blocks, []);
  });
});

const createReviewEvidence = (
  sourceMetadata: Partial<ReviewEvidence["sourceMetadata"]> = {},
): ReviewEvidence => ({
  sourceMetadata: {
    fileName: "transfer.csv",
    rowCount: 2,
    columnCount: 2,
    ...sourceMetadata,
  },
  structuredContent: {
    structure: {
      headerRows: [],
      unitRows: [],
      dataRegions: [],
      blockRegions: [],
      fingerprint: "schema-a",
    },
    columnProfiles: [],
    xRangeCandidates: [],
    xGroupCandidates: [],
    dataBlockCandidates: [],
    dependentValueCandidates: [],
    columnTitleSpans: [],
    infoCellNeighborhoods: [],
    bindingCandidates: [],
    semanticRulesFingerprint: "semantic:test",
    semanticCandidates: [],
    groups: [],
    blocks: [],
    diagnostics: [],
  },
});
