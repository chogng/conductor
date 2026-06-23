/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { ASSESSMENT_RULE_VERSION } from "src/cs/workbench/services/assessment/common/assessment";
import { AssessmentService } from "src/cs/workbench/services/assessment/browser/assessmentService";
import type {
	ISchemaProfileService,
	SchemaProfile,
	SchemaProfileSnapshot,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfile";
import {
	createSchemaProfileFromConfirmation,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfileConfirmation";

suite("workbench/services/assessment/test/browser/assessmentService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("creates import assessment seed through the service owner", async () => {
    const service = store.add(new AssessmentService());
    const result = await service.createImportAssessmentSeedFromRows("transfer.csv", [
      ["SetupTitle", "Transfer_DB"],
      ["TestParameter", "Channel.VName", "Vg", "Vd", "Vs"],
      ["TestParameter", "Channel.Func", "VAR1", "VAR2", "CONST"],
      ["TestParameter", "Output.Graph.XAxis.Data", "Vg"],
      ["DataName", "Vg", "Id", "Ig"],
      ["DataValue", "-1", "-2.63E-12", "-2.05E-12"],
    ]);

    assert.equal(result.curveFamily, "iv");
    assert.equal(result.curveType, "transfer (vg)");
    assert.equal(result.curveTypeConfidence, "high");
    assert.equal(result.curveTypeNeedsReview, false);
    assert.equal(result.ivMode, "transfer");
    assert.equal(result.xAxisRole, "vg");
  });

  test("wraps raw table assessment records with source version", async () => {
    const service = store.add(new AssessmentService());
    const result = await service.assessRawTable({
      fileId: "file-a",
      rawTableId: "raw-a",
      sourceRawTableVersion: 3,
      fileName: "transfer.csv",
      rows: [
        ["DataName", "Vg", "Id"],
        ["DataValue", "-1", "-2.63E-12"],
      ],
    });

    assert.equal(result.fileId, "file-a");
    assert.equal(result.rawTableId, "raw-a");
    assert.equal(result.assessmentRuleVersion, ASSESSMENT_RULE_VERSION);
    assert.equal(result.sourceRawTableVersion, 3);
    assert.deepEqual(result.structure.headerRows.map(row => ({
      rowIndex: row.rowIndex,
      source: row.source,
    })), [{
      rowIndex: 0,
      source: "dataName",
    }]);
    assert.deepEqual(result.structure.dataRegions.map(region => ({
      id: region.id,
      range: region.range,
      rowCount: region.rowCount,
    })), [{
      id: "data:0",
      range: {
        startRow: 1,
        endRow: 1,
        startCol: 0,
        endCol: 2,
      },
      rowCount: 1,
    }]);
    assert.equal(result.structure.fingerprint, "dataname|vg|id");
    assert.deepEqual(
      result.columnProfiles.map(({ rawCol, headerText, kind, numericStats }) => ({
        rawCol,
        headerText,
        kind,
        finiteCount: numericStats?.finiteCount ?? 0,
      })),
      [
        { rawCol: 0, headerText: "DataName", kind: "text", finiteCount: 0 },
        { rawCol: 1, headerText: "Vg", kind: "numeric", finiteCount: 1 },
        { rawCol: 2, headerText: "Id", kind: "numeric", finiteCount: 1 },
      ],
    );
    assert.deepEqual(
      result.semanticCandidates.map(candidate => ({
        rawCol: candidate.rawCol,
        role: candidate.roleCandidates[0]?.role,
        unit: candidate.unitCandidates[0]?.canonicalUnit ?? null,
        confirmed: candidate.unitCandidates[0]?.confirmed ?? false,
      })),
      [
        { rawCol: 0, role: "unknown", unit: null, confirmed: false },
        { rawCol: 1, role: "vg", unit: "V", confirmed: false },
        { rawCol: 2, role: "id", unit: "A", confirmed: false },
      ],
    );
    assert.equal(result.blocks.length, 1);
    assert.equal(result.blocks[0].fileId, "file-a");
    assert.equal(result.blocks[0].family, "iv");
    assert.equal(result.blocks[0].ivMode, "transfer");
    assert.equal(result.blocks[0].confidence, 0.9);
    assert.equal(result.decision.state, "ready");
    assert.equal(result.decision.autoApplyAllowed, true);
    assert.equal(result.decision.confidence, 0.9);
    assert.deepEqual(
      result.blocks[0].columns.columns.map(({ rawCol, role, unit, confidence }) => ({
        rawCol,
        role,
        unit,
        confidence,
      })),
      [
        { rawCol: 1, role: "vg", unit: "V", confidence: 0.82 },
        { rawCol: 2, role: "id", unit: "A", confidence: 0.82 },
      ],
    );
    assert.deepEqual(result.blocks[0].source.headerRange, {
      startRow: 0,
      endRow: 0,
      startCol: 0,
      endCol: 2,
    });
    assert.deepEqual(result.blocks[0].source.dataRange, {
      startRow: 1,
      endRow: 1,
      startCol: 0,
      endCol: 2,
    });
  });

  test("profiles stripped CH1/CH2 raw table columns even when family needs review", async () => {
    const service = store.add(new AssessmentService());
    const result = await service.assessRawTable({
      fileId: "file-b",
      rawTableId: "raw-b",
      sourceRawTableVersion: 1,
      fileName: "sample.csv",
      rows: [
        ["Repeat", "VAR2", "Point", "CH1 Voltage", "CH1 Current", "CH2 Voltage", "CH2 Current"],
        ["1", "1", "1", "-3.00000E+000", "-3.7E-9", "-60.00000E+000", "1.3E-9"],
      ],
    });

    assert.equal(result.blocks[0].family, "unknown");
    assert.equal(result.structure.headerRows[0]?.source, "strippedChannel");
    assert.equal(result.structure.fingerprint, "repeat|var2|point|ch1voltage|ch1current|ch2voltage|ch2current");
    assert.equal(result.layoutCandidates[0]?.layoutKind, "groupedSweep");
    assert.deepEqual(result.layoutCandidates[0]?.bindings[0], {
      dataRange: {
        startRow: 1,
        endRow: 1,
        startCol: 0,
        endCol: 6,
      },
      headerRange: {
        startRow: 0,
        endRow: 0,
        startCol: 0,
        endCol: 6,
      },
      groupByCol: 1,
      pointCol: 2,
      xCol: 3,
      yCols: [4],
      biasCols: [5, 6],
    });
    assert.deepEqual(
      result.columnProfiles.map(({ rawCol, kind }) => ({ rawCol, kind })),
      [
        { rawCol: 0, kind: "numeric" },
        { rawCol: 1, kind: "numeric" },
        { rawCol: 2, kind: "numeric" },
        { rawCol: 3, kind: "numeric" },
        { rawCol: 4, kind: "numeric" },
        { rawCol: 5, kind: "numeric" },
        { rawCol: 6, kind: "numeric" },
      ],
    );
    assert.equal(result.decision.state, "reviewRequired");
    assert.equal(result.decision.autoApplyAllowed, false);
    assert.deepEqual(
      result.blocks[0].columns.columns.map(({ rawCol, headerText, role, unit }) => ({
        rawCol,
        headerText,
        role,
        unit,
      })),
      [
        { rawCol: 0, headerText: "Repeat", role: "unknown", unit: null },
        { rawCol: 1, headerText: "VAR2", role: "unknown", unit: null },
        { rawCol: 2, headerText: "Point", role: "unknown", unit: null },
        { rawCol: 3, headerText: "CH1 Voltage", role: "voltage", unit: "V" },
        { rawCol: 4, headerText: "CH1 Current", role: "current", unit: "A" },
        { rawCol: 5, headerText: "CH2 Voltage", role: "voltage", unit: "V" },
        { rawCol: 6, headerText: "CH2 Current", role: "current", unit: "A" },
      ],
    );
  });

  test("keeps semantic review required for generic pairwise X/Y layout", async () => {
    const service = store.add(new AssessmentService());
    const result = await service.assessRawTable({
      fileId: "file-generic-xy",
      rawTableId: "raw-generic-xy",
      sourceRawTableVersion: 1,
      fileName: "xy.csv",
      rows: [
        ["X", "Y", "X", "Y", "X", "Y"],
        ["0", "1e-9", "0", "2e-9", "0", "3e-9"],
        ["1", "1.1e-9", "1", "2.1e-9", "1", "3.1e-9"],
        ["2", "1.2e-9", "2", "2.2e-9", "2", "3.2e-9"],
      ],
    });

    assert.equal(result.blocks[0].family, "unknown");
    assert.equal(result.layoutCandidates[0]?.layoutKind, "pairwiseXY");
    assert.deepEqual(result.layoutCandidates[0]?.bindings.map(binding => ({
      xCol: binding.xCol,
      yCols: binding.yCols,
    })), [
      { xCol: 0, yCols: [1] },
      { xCol: 2, yCols: [3] },
      { xCol: 4, yCols: [5] },
    ]);
    assert.deepEqual(
      result.semanticCandidates.map(candidate => candidate.roleCandidates[0]?.role),
      ["unknown", "unknown", "unknown", "unknown", "unknown", "unknown"],
    );
    assert.equal(result.decision.state, "reviewRequired");
    assert.equal(result.decision.autoApplyAllowed, false);
    assert.ok(result.decision.reasons.includes("Layout is ready, but measurement semantics need review."));
  });

  test("splits repeated header sections into measurement blocks", async () => {
    const service = store.add(new AssessmentService());
    const result = await service.assessRawTable({
      fileId: "file-repeated",
      rawTableId: "raw-repeated",
      sourceRawTableVersion: 1,
      fileName: "transfer.csv",
      rows: [
        ["SetupTitle", "Transfer_DB"],
        ["TestParameter", "Output.Graph.XAxis.Data", "Vg"],
        ["DataName", "Vg", "Id"],
        ["DataValue", "-1", "1e-12"],
        ["DataValue", "0", "1e-9"],
        ["DataName", "Vg", "Id"],
        ["DataValue", "-1", "2e-12"],
        ["DataValue", "0", "2e-9"],
      ],
    });

    assert.deepEqual(result.structure.headerRows.map(row => row.rowIndex), [2, 5]);
    assert.deepEqual(result.structure.dataRegions.map(region => region.range), [
      {
        startRow: 3,
        endRow: 4,
        startCol: 0,
        endCol: 2,
      },
      {
        startRow: 6,
        endRow: 7,
        startCol: 0,
        endCol: 2,
      },
    ]);
    assert.deepEqual(result.structure.blockRegions.map(region => ({
      kind: region.kind,
      range: region.range,
    })), [
      {
        kind: "repeatedHeader",
        range: {
          startRow: 2,
          endRow: 4,
          startCol: 0,
          endCol: 2,
        },
      },
      {
        kind: "repeatedHeader",
        range: {
          startRow: 5,
          endRow: 7,
          startCol: 0,
          endCol: 2,
        },
      },
    ]);
    assert.equal(result.blocks.length, 2);
    assert.deepEqual(result.blocks.map(block => ({
      id: block.id,
      fullRange: block.source.fullRange,
      headerRange: block.source.headerRange,
      dataRange: block.source.dataRange,
      rowCount: block.rowCount,
      roles: block.columns.columns.map(column => ({
        rawCol: column.rawCol,
        role: column.role,
        sourceRange: column.sourceRange,
      })),
    })), [
      {
        id: "raw-repeated:block:0",
        fullRange: {
          startRow: 2,
          endRow: 4,
          startCol: 0,
          endCol: 2,
        },
        headerRange: {
          startRow: 2,
          endRow: 2,
          startCol: 0,
          endCol: 2,
        },
        dataRange: {
          startRow: 3,
          endRow: 4,
          startCol: 0,
          endCol: 2,
        },
        rowCount: 2,
        roles: [
          {
            rawCol: 1,
            role: "vg",
            sourceRange: {
              startRow: 2,
              endRow: 2,
              startCol: 1,
              endCol: 1,
            },
          },
          {
            rawCol: 2,
            role: "id",
            sourceRange: {
              startRow: 2,
              endRow: 2,
              startCol: 2,
              endCol: 2,
            },
          },
        ],
      },
      {
        id: "raw-repeated:block:1",
        fullRange: {
          startRow: 5,
          endRow: 7,
          startCol: 0,
          endCol: 2,
        },
        headerRange: {
          startRow: 5,
          endRow: 5,
          startCol: 0,
          endCol: 2,
        },
        dataRange: {
          startRow: 6,
          endRow: 7,
          startCol: 0,
          endCol: 2,
        },
        rowCount: 2,
        roles: [
          {
            rawCol: 1,
            role: "vg",
            sourceRange: {
              startRow: 5,
              endRow: 5,
              startCol: 1,
              endCol: 1,
            },
          },
          {
            rawCol: 2,
            role: "id",
            sourceRange: {
              startRow: 5,
              endRow: 5,
              startCol: 2,
              endCol: 2,
            },
          },
        ],
      },
    ]);
    assert.equal(result.decision.state, "ready");
    assert.equal(result.decision.autoApplyAllowed, true);
  });

  test("uses exact schema profile matches as confirmed column semantics", async () => {
    const service = store.add(new AssessmentService());
    const result = await service.assessRawTable({
      fileId: "file-profile",
      rawTableId: "raw-profile",
      sourceRawTableVersion: 1,
      fileName: "transfer.csv",
      rows: [
        ["SetupTitle", "Transfer_DB"],
        ["TestParameter", "Channel.VName", "Vg", "Vd", "Vs"],
        ["TestParameter", "Channel.Func", "VAR1", "VAR2", "CONST"],
        ["TestParameter", "Output.Graph.XAxis.Data", "Vg"],
        ["DataName", "Input A", "Output B"],
        ["DataValue", "0", "1e-9"],
      ],
      schemaProfiles: [{
        id: "profile-input-output",
        scope: "workspace",
        schemaFingerprint: "dataname|inputa|outputb",
        confirmedCount: 3,
        conflictCount: 0,
        bindings: [
          {
            selector: {
              columnIndex: 1,
              normalizedHeader: "input a",
            },
            role: "vg",
            canonicalUnit: "V",
          },
          {
            selector: {
              columnIndex: 2,
              normalizedHeader: "output b",
            },
            role: "id",
            canonicalUnit: "A",
          },
        ],
      }],
    });

    assert.equal(result.structure.fingerprint, "dataname|inputa|outputb");
    assert.deepEqual(
      result.semanticCandidates
        .filter(candidate => candidate.rawCol <= 2)
        .map(candidate => ({
          rawCol: candidate.rawCol,
          role: candidate.roleCandidates[0]?.role,
          roleSources: candidate.roleCandidates[0]?.sources,
          unit: candidate.unitCandidates[0]?.canonicalUnit,
          unitSources: candidate.unitCandidates[0]?.sources,
          confirmed: candidate.unitCandidates[0]?.confirmed,
        })),
      [
        {
          rawCol: 0,
          role: "unknown",
          roleSources: [],
          unit: undefined,
          unitSources: undefined,
          confirmed: undefined,
        },
        {
          rawCol: 1,
          role: "vg",
          roleSources: ["schemaProfile"],
          unit: "V",
          unitSources: ["schemaProfile"],
          confirmed: true,
        },
        {
          rawCol: 2,
          role: "id",
          roleSources: ["schemaProfile"],
          unit: "A",
          unitSources: ["schemaProfile"],
          confirmed: true,
        },
      ],
    );
    assert.equal(result.decision.state, "ready");
    assert.equal(result.decision.autoApplyAllowed, true);
    assert.deepEqual(
      result.blocks[0].columns.columns.map(({ rawCol, role, unit, confidence }) => ({
        rawCol,
        role,
        unit,
        confidence,
      })),
      [
        { rawCol: 1, role: "vg", unit: "V", confidence: 0.96 },
        { rawCol: 2, role: "id", unit: "A", confidence: 0.96 },
      ],
    );
  });

  test("allows exact user-confirmed profiles to unlock unambiguous automatic assessment", async () => {
    const service = store.add(new AssessmentService());
    const rows = [
      ["DataName", "Input A", "Output B"],
      ["DataValue", "-1", "1e-12"],
      ["DataValue", "0", "1e-9"],
      ["DataValue", "1", "2e-7"],
    ];
    const first = await service.assessRawTable({
      fileId: "file-profile-loop",
      rawTableId: "raw-profile-loop",
      sourceRawTableVersion: 1,
      fileName: "custom.csv",
      rows,
    });
    assert.equal(first.decision.state, "reviewRequired");
    assert.equal(first.decision.autoApplyAllowed, false);

    const profile = createSchemaProfileFromConfirmation({
      schemaFingerprint: first.structure.fingerprint,
      columnProfiles: first.columnProfiles,
      bindings: [{
        rawCol: 1,
        role: "vg",
        axis: "x",
        canonicalUnit: "V",
      }, {
        rawCol: 2,
        role: "id",
        axis: "y",
        canonicalUnit: "A",
      }],
    });
    assert.ok(profile);

    const result = await service.assessRawTable({
      fileId: "file-profile-loop-next",
      rawTableId: "raw-profile-loop-next",
      sourceRawTableVersion: 1,
      fileName: "custom.csv",
      rows,
      schemaProfiles: [profile],
    });

    assert.equal(result.blocks[0].family, "iv");
    assert.equal(result.blocks[0].ivMode, "transfer");
    assert.equal(result.decision.state, "ready");
    assert.equal(result.decision.autoApplyAllowed, true);
    assert.ok(result.decision.reasons.includes("Exact schema profile confirms transfer x/y bindings."));
    assert.deepEqual(
      result.blocks[0].columns.columns.map(({ rawCol, role, unit, confidence }) => ({
        rawCol,
        role,
        unit,
        confidence,
      })),
      [
        { rawCol: 1, role: "vg", unit: "V", confidence: 0.96 },
        { rawCol: 2, role: "id", unit: "A", confidence: 0.96 },
      ],
    );
  });

  test("keeps generic exact profile voltage/current bindings in review", async () => {
    const service = store.add(new AssessmentService());
    const rows = [
      ["DataName", "Input A", "Output B"],
      ["DataValue", "-1", "1e-12"],
      ["DataValue", "0", "1e-9"],
      ["DataValue", "1", "2e-7"],
    ];
    const first = await service.assessRawTable({
      fileId: "file-generic-profile-loop",
      rawTableId: "raw-generic-profile-loop",
      sourceRawTableVersion: 1,
      fileName: "custom.csv",
      rows,
    });
    const profile = createSchemaProfileFromConfirmation({
      schemaFingerprint: first.structure.fingerprint,
      columnProfiles: first.columnProfiles,
      bindings: [{
        rawCol: 1,
        role: "voltage",
        axis: "x",
        canonicalUnit: "V",
      }, {
        rawCol: 2,
        role: "current",
        axis: "y",
        canonicalUnit: "A",
      }],
    });
    assert.ok(profile);

    const result = await service.assessRawTable({
      fileId: "file-generic-profile-loop-next",
      rawTableId: "raw-generic-profile-loop-next",
      sourceRawTableVersion: 1,
      fileName: "custom.csv",
      rows,
      schemaProfiles: [profile],
    });

    assert.equal(result.blocks[0].family, "unknown");
    assert.equal(result.decision.state, "reviewRequired");
    assert.equal(result.decision.autoApplyAllowed, false);
  });

  test("reads exact schema profile matches from the schema profile service", async () => {
    const service = store.add(new AssessmentService(new TestSchemaProfileService({
      version: 5,
      profiles: [{
        id: "profile-service-input-output",
        scope: "workspace",
        schemaFingerprint: "dataname|inputa|outputb",
        confirmedCount: 3,
        conflictCount: 0,
        bindings: [
          {
            selector: {
              columnIndex: 1,
              normalizedHeader: "input a",
            },
            role: "vg",
            canonicalUnit: "V",
          },
          {
            selector: {
              columnIndex: 2,
              normalizedHeader: "output b",
            },
            role: "id",
            canonicalUnit: "A",
          },
        ],
      }],
    })));
    const result = await service.assessRawTable({
      fileId: "file-profile-service",
      rawTableId: "raw-profile-service",
      sourceRawTableVersion: 1,
      fileName: "transfer.csv",
      rows: [
        ["SetupTitle", "Transfer_DB"],
        ["TestParameter", "Output.Graph.XAxis.Data", "Vg"],
        ["DataName", "Input A", "Output B"],
        ["DataValue", "0", "1e-9"],
      ],
    });

    assert.equal(result.schemaProfileVersion, 5);
    assert.deepEqual(
      result.blocks[0].columns.columns.map(({ rawCol, role, unit, confidence }) => ({
        rawCol,
        role,
        unit,
        confidence,
      })),
      [
        { rawCol: 1, role: "vg", unit: "V", confidence: 0.96 },
        { rawCol: 2, role: "id", unit: "A", confidence: 0.96 },
      ],
    );
  });

  test("keeps medium-confidence capacitance-frequency assessment inferred", async () => {
    const service = store.add(new AssessmentService());
    const result = await service.assessRawTable({
      fileId: "file-c",
      rawTableId: "raw-c",
      sourceRawTableVersion: 1,
      fileName: "#CF-10um-10_2026-01-09-11-09-36.xls",
      rows: [
        ["freq", "Cp(vp=0.00000)"],
        ["1", "1e-12"],
      ],
    });

    assert.equal(result.blocks[0].family, "cf");
    assert.equal(result.decision.state, "inferred");
    assert.equal(result.decision.autoApplyAllowed, false);
    assert.deepEqual(
      result.blocks[0].columns.columns.map(({ rawCol, role, unit }) => ({
        rawCol,
        role,
        unit,
      })),
      [
        { rawCol: 0, role: "frequency", unit: "Hz" },
        { rawCol: 1, role: "capacitance", unit: "F" },
      ],
    );
  });
});

class TestSchemaProfileService implements ISchemaProfileService {
	public declare readonly _serviceBrand: undefined;
	public readonly onDidChangeSchemaProfiles = Event.None as Event<SchemaProfileSnapshot>;

	public constructor(
		private readonly snapshot: SchemaProfileSnapshot,
	) { }

	public getSnapshot(): SchemaProfileSnapshot {
		return this.snapshot;
	}

	public getProfiles(): readonly SchemaProfile[] {
		return this.snapshot.profiles;
	}

	public getVersion(): number {
		return this.snapshot.version;
	}

	public upsertProfile(profile: SchemaProfile): SchemaProfile {
		return profile;
	}

	public confirmProfile(): SchemaProfile | null {
		return null;
	}

	public removeProfile(_profileId: string): void { }

	public clearProfiles(): void { }
}
