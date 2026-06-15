/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

/*
 * File assessment infers curve type, axis role, confidence, and whether a
 * template is needed from import metadata and preview rows. Template selection
 * and extraction logic live under services/template.
 */

import {
  computeSpan,
  normalizeCellText,
  parseFiniteNumber,
} from "../../../common/cellText.ts";

export type AxisRole = "vg" | "vd";

export type CurveKind =
  | "transfer"
  | "output"
  | "pv"
  | "cv"
  | "cf"
  | "unknown";

export type FileAssessmentConfidence = "high" | "medium" | "low";

export type FileAssessmentSource =
  | "metadata"
  | "filename"
  | "title"
  | "label"
  | "shape"
  | null;

export type FileMetadata = {
  channelFuncs: string[];
  channelVNames: string[];
  dataNameColumns: string[];
  isStrippedChannelSweep: boolean;
  strippedSweepVoltageAxis: "ch1" | "ch2" | null;
  strippedSweepVoltageSpan: number | null;
  strippedFixedVoltageMagnitude: number | null;
  strippedCurrentLogSpanCh1: number | null;
  strippedCurrentLogSpanCh2: number | null;
  notesText: string;
  setupTitle: string;
  var1Name: string;
  var1NameSource: "channel" | "notes" | "";
  var2Name: string;
  var2NameSource: "channel" | "notes" | "";
  xAxisData: string;
};

export type FileAssessment = {
  confidence: FileAssessmentConfidence;
  curveType: CurveKind;
  curveTypeLabel: string | null;
  needsTemplate: boolean;
  reasons: string[];
  xAxisRole: AxisRole | null;
  xAxisRoleSource: FileAssessmentSource;
};

type FileAssessmentInput = {
  fileName?: unknown;
  fileNameRole?: AxisRole | null;
  metadata?: Partial<FileMetadata> | null;
  templateXAxisLabel?: unknown;
  xAxisLabel?: unknown;
};

type FileEvidence = {
  reason: string;
  role: AxisRole;
  source: NonNullable<FileAssessmentSource>;
  weight: number;
};

const MAX_ASSESSMENT_REASONS = 2;

const unwrapBraceToken = (value: unknown): string => {
  const normalized = normalizeCellText(value);
  if (!normalized) return "";
  const match = normalized.match(/^\{+([^{}]+)\}+$/);
  return normalizeCellText(match ? match[1] : normalized);
};

const firstNonEmpty = (values: unknown[]): string => {
  for (const value of values) {
    const normalized = normalizeCellText(value);
    if (normalized) return normalized;
  }
  return "";
};

export const detectAxisRole = (
  value: unknown,
): AxisRole | null => {
  const text = normalizeCellText(value).toLowerCase();
  if (!text) return null;

  const compact = text.replace(/[\s_\-./()[\]{}:=]+/g, "");
  const hasVg =
    /(^|[^a-z0-9])v[_-]?g(s|[^a-z0-9]|$)/.test(text) ||
    /(^|[^a-z0-9])gate(\s+voltage)?([^a-z0-9]|$)/.test(text) ||
    /(^|[^a-z0-9])tran(s|fer)?([^a-z0-9]|$)/.test(text) ||
    /(^|[^a-z0-9])transfer(\s+(curve|curves|characteristic|characteristics))?([^a-z0-9]|$)/.test(
      text,
    ) ||
    compact === "tran" ||
    compact.startsWith("tran") ||
    compact.includes("gatevoltage") ||
    compact.includes("transfercurve") ||
    compact.includes("transfercurves") ||
    compact.includes("transfercharacteristic") ||
    compact.includes("transfercharacteristics") ||
    text.includes("栅压") ||
    text.includes("栅极") ||
    text.includes("栅极电压");
  const hasVd =
    /(^|[^a-z0-9])v[_-]?d(s|[^a-z0-9]|$)/.test(text) ||
    /(^|[^a-z0-9])drain(\s+voltage)?([^a-z0-9]|$)/.test(text) ||
    /(^|[^a-z0-9])out(put)?([^a-z0-9]|$)/.test(text) ||
    /(^|[^a-z0-9])output(\s+(curve|curves|characteristic|characteristics))?([^a-z0-9]|$)/.test(
      text,
    ) ||
    compact === "out" ||
    compact.startsWith("output") ||
    compact.includes("drainvoltage") ||
    compact.includes("outputcurve") ||
    compact.includes("outputcurves") ||
    compact.includes("outputcharacteristic") ||
    compact.includes("outputcharacteristics") ||
    text.includes("漏压") ||
    text.includes("漏极") ||
    text.includes("漏极电压");

  if (hasVg && !hasVd) return "vg";
  if (hasVd && !hasVg) return "vd";
  return null;
};

const parseVarNameFromNotes = (
  notesText: string,
  varTag: "VAR1" | "VAR2",
): string => {
  const match = notesText.match(
    new RegExp(`\\[${varTag}\\][^\\[]*?Name=([^,\\]\\t]+)`, "i"),
  );
  return match ? normalizeCellText(match[1]) : "";
};

const deriveVarNameFromChannelMeta = ({
  channelFuncs,
  channelVNames,
  varToken,
}: {
  channelFuncs: string[];
  channelVNames: string[];
  varToken: "VAR1" | "VAR2";
}): string => {
  const normalizedFuncs = channelFuncs.map((entry) => normalizeCellText(entry).toUpperCase());
  const index = normalizedFuncs.findIndex((entry) => entry === varToken);
  if (index < 0 || index >= channelVNames.length) return "";
  return normalizeCellText(channelVNames[index]);
};

const computeQuantile = (values: number[], quantile: number): number | null => {
  if (!Array.isArray(values) || !values.length) return null;
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .slice()
    .sort((left, right) => left - right);
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const position = Math.min(
    sorted.length - 1,
    Math.max(0, quantile * (sorted.length - 1)),
  );
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) return sorted[lowerIndex];
  const ratio = position - lowerIndex;
  return sorted[lowerIndex] + (sorted[upperIndex] - sorted[lowerIndex]) * ratio;
};

const computeRobustLogSpan = (values: number[]): number | null => {
  const magnitudeValues = values
    .map((value) => Math.abs(value))
    .filter((value) => Number.isFinite(value));
  if (magnitudeValues.length < 3) return null;
  const low = computeQuantile(magnitudeValues, 0.15);
  const high = computeQuantile(magnitudeValues, 0.85);
  if (low === null || high === null) return null;
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  return Math.log10((Math.max(high, 0) + 1e-30) / (Math.max(low, 0) + 1e-30));
};

const collectStrippedSweepShapeStats = (
  rows: Array<Array<unknown> | null | undefined>,
  headerRowIndex: number,
): {
  fixedVoltageMagnitude: number | null;
  currentLogSpanCh1: number | null;
  currentLogSpanCh2: number | null;
  sweepVoltageAxis: "ch1" | "ch2" | null;
  sweepVoltageSpan: number | null;
} => {
  if (!Array.isArray(rows) || headerRowIndex < 0 || headerRowIndex >= rows.length) {
    return {
      fixedVoltageMagnitude: null,
      currentLogSpanCh1: null,
      currentLogSpanCh2: null,
      sweepVoltageAxis: null,
      sweepVoltageSpan: null,
    };
  }

  const headerRow = Array.isArray(rows[headerRowIndex])
    ? (rows[headerRowIndex] as Array<unknown>).map((value) => normalizeCellText(value))
    : [];
  if (!headerRow.length) {
    return {
      fixedVoltageMagnitude: null,
      currentLogSpanCh1: null,
      currentLogSpanCh2: null,
      sweepVoltageAxis: null,
      sweepVoltageSpan: null,
    };
  }

  const var2Index = headerRow.findIndex((entry, index) => index === 1 && entry === "VAR2");
  const ch1VoltageIndex = headerRow.findIndex((entry) => entry === "CH1 Voltage");
  const ch2VoltageIndex = headerRow.findIndex((entry) => entry === "CH2 Voltage");
  const ch1CurrentIndex = headerRow.findIndex((entry) => entry === "CH1 Current");
  const ch2CurrentIndex = headerRow.findIndex((entry) => entry === "CH2 Current");
  if (ch1VoltageIndex < 0 || ch2VoltageIndex < 0) {
    return {
      fixedVoltageMagnitude: null,
      currentLogSpanCh1: null,
      currentLogSpanCh2: null,
      sweepVoltageAxis: null,
      sweepVoltageSpan: null,
    };
  }

  const ch1Values: number[] = [];
  const ch2Values: number[] = [];
  const ch1Currents: number[] = [];
  const ch2Currents: number[] = [];
  let activeVar2 = "";

  for (let index = headerRowIndex + 1; index < rows.length && ch1Values.length < 256; index += 1) {
    const row = Array.isArray(rows[index]) ? (rows[index] as Array<unknown>) : [];
    const var2Value =
      var2Index >= 0 ? normalizeCellText(row[var2Index] ?? "") : "";
    if (activeVar2 && var2Value && var2Value !== activeVar2 && ch1Values.length >= 2) {
      break;
    }
    const ch1Value = parseFiniteNumber(row[ch1VoltageIndex]);
    const ch2Value = parseFiniteNumber(row[ch2VoltageIndex]);
    if (ch1Value === null || ch2Value === null) continue;
    if (!activeVar2) {
      activeVar2 = var2Value;
    }
    ch1Values.push(ch1Value);
    ch2Values.push(ch2Value);
    if (ch1CurrentIndex >= 0) {
      const current = parseFiniteNumber(row[ch1CurrentIndex]);
      if (current !== null) ch1Currents.push(current);
    }
    if (ch2CurrentIndex >= 0) {
      const current = parseFiniteNumber(row[ch2CurrentIndex]);
      if (current !== null) ch2Currents.push(current);
    }
  }

  const ch1Span = computeSpan(ch1Values);
  const ch2Span = computeSpan(ch2Values);
  if (ch1Span === null || ch2Span === null) {
    return {
      fixedVoltageMagnitude: null,
      currentLogSpanCh1: computeRobustLogSpan(ch1Currents),
      currentLogSpanCh2: computeRobustLogSpan(ch2Currents),
      sweepVoltageAxis: null,
      sweepVoltageSpan: null,
    };
  }

  const baseTolerance = 1e-9;
  const relativeTolerance = Math.max(ch1Span, ch2Span) * 1e-4;
  const stableTolerance = Math.max(baseTolerance, relativeTolerance);

  const sweepVoltageAxis =
    ch1Span > stableTolerance && ch2Span <= stableTolerance
      ? "ch1"
      : ch2Span > stableTolerance && ch1Span <= stableTolerance
        ? "ch2"
        : null;
  const fixedValues = sweepVoltageAxis === "ch1" ? ch2Values : sweepVoltageAxis === "ch2" ? ch1Values : [];

  return {
    fixedVoltageMagnitude:
      fixedValues.length > 0
        ? computeQuantile(
            fixedValues.map((value) => Math.abs(value)),
            0.5,
          )
        : null,
    currentLogSpanCh1: computeRobustLogSpan(ch1Currents),
    currentLogSpanCh2: computeRobustLogSpan(ch2Currents),
    sweepVoltageAxis,
    sweepVoltageSpan:
      sweepVoltageAxis === "ch1"
        ? ch1Span
        : sweepVoltageAxis === "ch2"
          ? ch2Span
          : null,
  };
};

export const extractFileMetadata = (
  rows: Array<Array<unknown> | null | undefined>,
): FileMetadata => {
  let setupTitle = "";
  let xAxisData = "";
  let notesText = "";
  let var1Name = "";
  let var2Name = "";
  let var1NameSource: "channel" | "notes" | "" = "";
  let var2NameSource: "channel" | "notes" | "" = "";
  let channelFuncs: string[] = [];
  let channelVNames: string[] = [];
  let dataNameColumns: string[] = [];
  let isStrippedChannelSweep = false;
  let strippedChannelHeaderRowIndex = -1;

  for (const [rowIndex, rawRow] of (Array.isArray(rows) ? rows : []).entries()) {
    const row = Array.isArray(rawRow) ? rawRow.map((value) => normalizeCellText(value)) : [];
    if (!row.length) continue;

    const first = row[0] ?? "";
    const second = row[1] ?? "";

    if (!setupTitle && first === "SetupTitle") {
      setupTitle = firstNonEmpty(row.slice(1));
    }
    if (!setupTitle && rowIndex === 0) {
      setupTitle = unwrapBraceToken(first);
    }

    if (!xAxisData && second === "Output.Graph.XAxis.Data") {
      xAxisData = firstNonEmpty(row.slice(2));
    }

    if (!channelFuncs.length && second === "Channel.Func") {
      channelFuncs = row.slice(2).filter(Boolean);
    }

    if (!channelVNames.length && second === "Channel.VName") {
      channelVNames = row.slice(2).filter(Boolean);
    }

    if (!dataNameColumns.length && first === "DataName") {
      dataNameColumns = row.slice(1).filter(Boolean);
    }

    if (!notesText && second === "Analysis.Setup.Vector.Graph.Notes") {
      notesText = row.slice(2).filter(Boolean).join(", ");
    }

    if (
      !isStrippedChannelSweep &&
      first === "Repeat" &&
      second === "VAR2" &&
      row.includes("CH1 Voltage") &&
      row.includes("CH2 Voltage")
    ) {
      isStrippedChannelSweep = true;
      strippedChannelHeaderRowIndex = rowIndex;
    }
  }

  if (!dataNameColumns.length) {
    for (let rowIndex = 0; rowIndex < rows.length - 1; rowIndex += 1) {
      const row = Array.isArray(rows[rowIndex])
        ? (rows[rowIndex] as Array<unknown>).map((value) => normalizeCellText(value))
        : [];
      const headers = row.filter(Boolean);
      if (headers.length < 2) continue;
      if (headers.includes("CH1 Voltage") && headers.includes("CH2 Voltage")) continue;
      const hasDeviceHeader = headers.some(
        (cell) =>
          detectAxisRole(cell) ||
          /current|voltage|gate|drain|id|ig/i.test(cell),
      );
      if (!hasDeviceHeader) {
        continue;
      }
      const nextRow = Array.isArray(rows[rowIndex + 1])
        ? (rows[rowIndex + 1] as Array<unknown>)
        : [];
      const numericCount = nextRow.reduce<number>(
        (count, cell) => (parseFiniteNumber(cell) === null ? count : count + 1),
        0,
      );
      if (numericCount >= 2) {
        dataNameColumns = headers;
        break;
      }
    }
  }

  const strippedSweepVoltageAxis =
    isStrippedChannelSweep && strippedChannelHeaderRowIndex >= 0
      ? collectStrippedSweepShapeStats(rows, strippedChannelHeaderRowIndex)
      : {
          fixedVoltageMagnitude: null,
          currentLogSpanCh1: null,
          currentLogSpanCh2: null,
          sweepVoltageAxis: null,
          sweepVoltageSpan: null,
        };

  if (notesText) {
    const noteVar1 = parseVarNameFromNotes(notesText, "VAR1");
    const noteVar2 = parseVarNameFromNotes(notesText, "VAR2");
    if (noteVar1) {
      var1Name = noteVar1;
      var1NameSource = "notes";
    }
    if (noteVar2) {
      var2Name = noteVar2;
      var2NameSource = "notes";
    }
  }

  if (!var1Name && channelFuncs.length && channelVNames.length) {
    const derived = deriveVarNameFromChannelMeta({
      channelFuncs,
      channelVNames,
      varToken: "VAR1",
    });
    if (derived) {
      var1Name = derived;
      var1NameSource = "channel";
    }
  }

  if (!var2Name && channelFuncs.length && channelVNames.length) {
    const derived = deriveVarNameFromChannelMeta({
      channelFuncs,
      channelVNames,
      varToken: "VAR2",
    });
    if (derived) {
      var2Name = derived;
      var2NameSource = "channel";
    }
  }

  return {
    channelFuncs,
    channelVNames,
    dataNameColumns,
    isStrippedChannelSweep,
    strippedCurrentLogSpanCh1: strippedSweepVoltageAxis.currentLogSpanCh1,
    strippedCurrentLogSpanCh2: strippedSweepVoltageAxis.currentLogSpanCh2,
    strippedFixedVoltageMagnitude: strippedSweepVoltageAxis.fixedVoltageMagnitude,
    strippedSweepVoltageAxis: strippedSweepVoltageAxis.sweepVoltageAxis,
    strippedSweepVoltageSpan: strippedSweepVoltageAxis.sweepVoltageSpan,
    notesText,
    setupTitle,
    var1Name,
    var1NameSource,
    var2Name,
    var2NameSource,
    xAxisData,
  };
};

const formatVoltage = (value: number | null | undefined): string => {
  if (!Number.isFinite(value)) return "?";
  const abs = Math.abs(Number(value));
  if (abs >= 100 || (abs > 0 && abs < 0.01)) {
    return Number(value).toExponential(2);
  }
  const rounded = Math.round(Number(value) * 100) / 100;
  return `${rounded}`;
};

const formatDecades = (value: number | null | undefined): string => {
  if (!Number.isFinite(value)) return "?";
  return `${Math.round(Number(value) * 10) / 10}`;
};

const buildCurveTypeLabel = (
  curveType: CurveKind,
  xAxisRole: AxisRole | null,
): string | null => {
  if (curveType === "transfer") return xAxisRole === "vg" ? "transfer (vg)" : "transfer";
  if (curveType === "output") return xAxisRole === "vd" ? "output (vd)" : "output";
  if (curveType === "pv") return "pv";
  if (curveType === "cv") return "cv";
  if (curveType === "cf") return "cf";
  if (curveType === "unknown") return "unknown";
  return null;
};

const normalizeCompactText = (value: unknown): string =>
  normalizeCellText(value)
    .toLowerCase()
    .replace(/[\s_\-./()[\]{}:=]+/g, "");

const detectCapacitanceCurveKind = ({
  fileName,
  metadata,
  templateXAxisLabel,
  xAxisLabel,
}: Pick<
  FileAssessmentInput,
  "fileName" | "metadata" | "templateXAxisLabel" | "xAxisLabel"
>): {
  confidence: FileAssessmentConfidence;
  curveType: Exclude<CurveKind, "transfer" | "output" | "unknown">;
  reason: string;
  source: NonNullable<FileAssessmentSource>;
} | null => {
  const metadataLikeTexts = [
    metadata?.setupTitle,
    metadata?.xAxisData,
    ...(Array.isArray(metadata?.dataNameColumns) ? metadata.dataNameColumns : []),
  ];
  const labelTexts = [templateXAxisLabel, xAxisLabel];
  const fileNameCompact = normalizeCompactText(fileName);
  const metadataCompact = metadataLikeTexts.map((value) => normalizeCompactText(value));
  const labelCompact = labelTexts.map((value) => normalizeCompactText(value));
  const allCompact = [fileNameCompact, ...metadataCompact, ...labelCompact].filter(Boolean);
  const hasFileNameCvHint =
    fileNameCompact.includes("cv") && !fileNameCompact.includes("svc");
  const hasFileNameCfHint =
    fileNameCompact.includes("cf") ||
    fileNameCompact.includes("freq");

  const hasCapacitanceY = allCompact.some(
    (value) =>
      value.includes("cp") ||
      value.includes("cs") ||
      value.includes("cap") ||
      value.includes("capacit"),
  );
  if (!hasCapacitanceY && !hasFileNameCvHint && !hasFileNameCfHint) return null;

  if (hasFileNameCvHint) {
    return {
      confidence: "medium",
      curveType: "cv",
      reason: "Filename/labels identify a capacitance-voltage sweep (Cp/C-V).",
      source: "filename",
    };
  }

  const hasFreqHint = allCompact.some(
    (value) =>
      value.includes("freq") ||
      value.includes("frequency") ||
      value.includes("hz") ||
      /(^|[^a-z0-9])cf([^a-z0-9]|$)/.test(value),
  );
  if (hasFreqHint || hasFileNameCfHint) {
    return {
      confidence: "medium",
      curveType: "cf",
      reason: "Filename/labels identify a capacitance-frequency sweep (Cp/C-f).",
      source: hasFileNameCfHint ? "filename" : "label",
    };
  }

  const hasVoltageHint = allCompact.some(
    (value) =>
      value.includes("cv") ||
      value.includes("vp") ||
      value.includes("voltage") ||
      value.includes("bias"),
  );
  if (hasVoltageHint) {
    return {
      confidence: "medium",
      curveType: "cv",
      reason: "Filename/labels identify a capacitance-voltage sweep (Cp/C-V).",
      source: "label",
    };
  }

  return null;
};

const detectPulseVoltageCurveKind = ({
  fileName,
  metadata,
}: Pick<FileAssessmentInput, "fileName" | "metadata">): {
  confidence: FileAssessmentConfidence;
  curveType: "pv";
  reason: string;
  source: NonNullable<FileAssessmentSource>;
} | null => {
  const hasFastIvOrIvtHint = (value: unknown): boolean => {
    const text = normalizeCellText(value).toLowerCase();
    const compact = normalizeCompactText(value);
    return compact.includes("fastiv") || /(^|[^a-z0-9])ivt([^a-z0-9]|$)/i.test(text);
  };
  const fileNameCompact = normalizeCompactText(fileName);
  const dataNamesCompact = Array.isArray(metadata?.dataNameColumns)
    ? metadata.dataNameColumns.map((value) => normalizeCompactText(value))
    : [];
  const hasPulseFileHint =
    fileNameCompact.includes("pv") ||
    hasFastIvOrIvtHint(fileName);
  const hasPulseMetadataHint =
    hasFastIvOrIvtHint(metadata?.setupTitle) ||
    dataNamesCompact.some((value) => value === "vp" || value === "in" || value === "ipt");

  if (!hasPulseFileHint && !hasPulseMetadataHint) return null;

  return {
    confidence: hasPulseMetadataHint ? "medium" : "low",
    curveType: "pv",
    reason: "Filename/metadata identify a pulse-voltage or FastIV-style sweep.",
    source: hasPulseMetadataHint ? "metadata" : "filename",
  };
};

const reasonPrefixBySource: Record<NonNullable<FileAssessmentSource>, string> = {
  filename: "Filename",
  label: "Axis label",
  metadata: "Metadata",
  shape: "Shape",
  title: "Template X label",
};

const toRoleLabel = (role: AxisRole): string => (role === "vg" ? "Vg" : "Vd");

const pushEvidence = (
  evidence: FileEvidence[],
  role: AxisRole | null,
  weight: number,
  source: NonNullable<FileAssessmentSource>,
  message: string,
) => {
  if (!role) return;
  evidence.push({
    reason: `${reasonPrefixBySource[source]} ${message}`,
    role,
    source,
    weight,
  });
};

const collectRoleEvidence = ({
  fileName,
  fileNameRole,
  metadata,
  templateXAxisLabel,
  xAxisLabel,
}: FileAssessmentInput): FileEvidence[] => {
  const evidence: FileEvidence[] = [];
  const normalizedMetadata = metadata ?? {};
  const fileNameRoleFromText = detectAxisRole(fileName);
  const shapeRoleHint = fileNameRole ?? fileNameRoleFromText;

  pushEvidence(
    evidence,
    detectAxisRole(normalizedMetadata.xAxisData),
    18,
    "metadata",
    `declares X axis as ${normalizedMetadata.xAxisData}.`,
  );

  if (normalizedMetadata.var1Name) {
    pushEvidence(
      evidence,
      detectAxisRole(normalizedMetadata.var1Name),
      normalizedMetadata.var1NameSource === "notes" ? 16 : 14,
      "metadata",
      `maps VAR1 to ${normalizedMetadata.var1Name}.`,
    );
  }

  const firstDataName = Array.isArray(normalizedMetadata.dataNameColumns)
    ? normalizedMetadata.dataNameColumns[0]
    : "";
  pushEvidence(
    evidence,
    detectAxisRole(firstDataName),
    14,
    "metadata",
    `starts DataName with ${firstDataName}.`,
  );

  pushEvidence(
    evidence,
    detectAxisRole(normalizedMetadata.setupTitle),
    6,
    "metadata",
    `uses setup title ${normalizedMetadata.setupTitle}.`,
  );

  pushEvidence(
    evidence,
    detectAxisRole(templateXAxisLabel),
    6,
    "title",
    `suggests ${toRoleLabel(detectAxisRole(templateXAxisLabel) ?? "vg")}.`,
  );

  pushEvidence(
    evidence,
    detectAxisRole(xAxisLabel),
    5,
    "label",
    `suggests ${toRoleLabel(detectAxisRole(xAxisLabel) ?? "vg")}.`,
  );

  if (fileNameRole) {
    pushEvidence(
      evidence,
      fileNameRole,
      4,
      "filename",
      `matched ${toRoleLabel(fileNameRole)} template keywords.`,
    );
  }

  pushEvidence(
    evidence,
    fileNameRoleFromText,
    2,
    "filename",
      `contains ${toRoleLabel(fileNameRoleFromText ?? "vg")} hints.`,
  );

  if (normalizedMetadata.isStrippedChannelSweep && normalizedMetadata.strippedSweepVoltageAxis) {
    const sweptAxis = normalizedMetadata.strippedSweepVoltageAxis;
    const fixedAxis = sweptAxis === "ch1" ? "ch2" : "ch1";
    const sweptChannel = sweptAxis.toUpperCase();
    const fixedChannel = fixedAxis.toUpperCase();
    const sweptCurrentSpan =
      sweptAxis === "ch1"
        ? Number(normalizedMetadata.strippedCurrentLogSpanCh1)
        : Number(normalizedMetadata.strippedCurrentLogSpanCh2);
    const fixedCurrentSpan =
      fixedAxis === "ch1"
        ? Number(normalizedMetadata.strippedCurrentLogSpanCh1)
        : Number(normalizedMetadata.strippedCurrentLogSpanCh2);
    const currentSpanGap = Math.abs(sweptCurrentSpan - fixedCurrentSpan);

    if (
      Number.isFinite(sweptCurrentSpan) &&
      Number.isFinite(fixedCurrentSpan) &&
      currentSpanGap >= 1.2
    ) {
      const dominantAxis = sweptCurrentSpan >= fixedCurrentSpan ? sweptAxis : fixedAxis;
      const dominantChannel = dominantAxis.toUpperCase();
      const inferredRole = dominantAxis === sweptAxis ? "vd" : "vg";
      const weight = currentSpanGap >= 2.5 ? 9 : currentSpanGap >= 1.8 ? 8 : 7;
      pushEvidence(
        evidence,
        inferredRole,
        weight,
        "shape",
        dominantAxis === sweptAxis
          ? `${dominantChannel} Current varies ${formatDecades(currentSpanGap)} decades more than ${fixedChannel} during the ${sweptChannel} sweep; output-like Id-Vd.`
          : `${dominantChannel} Current varies ${formatDecades(currentSpanGap)} decades more than ${sweptChannel} during the ${sweptChannel} sweep; transfer-like Vg response.`,
      );
    }

    const sweepVoltageSpan = Number(normalizedMetadata.strippedSweepVoltageSpan);
    const fixedVoltageMagnitude = Number(normalizedMetadata.strippedFixedVoltageMagnitude);
    if (Number.isFinite(sweepVoltageSpan) && Number.isFinite(fixedVoltageMagnitude)) {
      if (
        sweepVoltageSpan <= 12 &&
        fixedVoltageMagnitude >= Math.max(12, sweepVoltageSpan * 3)
      ) {
        pushEvidence(
          evidence,
          "vd",
          6,
          "shape",
          `${sweptChannel} sweeps about ${formatVoltage(sweepVoltageSpan)} V while ${fixedChannel} is near ${formatVoltage(fixedVoltageMagnitude)} V; output-like stepped bias.`,
        );
      } else if (
        fixedVoltageMagnitude <= 12 &&
        sweepVoltageSpan >= Math.max(12, fixedVoltageMagnitude * 3)
      ) {
        pushEvidence(
          evidence,
          "vg",
          6,
          "shape",
          `${sweptChannel} sweeps about ${formatVoltage(sweepVoltageSpan)} V while ${fixedChannel} is near ${formatVoltage(fixedVoltageMagnitude)} V; transfer-like drain bias.`,
        );
      }
    }

    if (shapeRoleHint) {
      pushEvidence(
        evidence,
        shapeRoleHint,
        3,
        "shape",
        `shows ${sweptChannel} Voltage sweeping while ${fixedChannel} stays nearly fixed, matching ${toRoleLabel(shapeRoleHint)} filename hints.`,
      );
    }
  }

  return evidence;
};

const hasStrongMetadataConflict = (evidence: FileEvidence[]): boolean => {
  const vgMetadata = evidence.some(
    (entry) => entry.source === "metadata" && entry.role === "vg" && entry.weight >= 14,
  );
  const vdMetadata = evidence.some(
    (entry) => entry.source === "metadata" && entry.role === "vd" && entry.weight >= 14,
  );
  return vgMetadata && vdMetadata;
};

const resolveRoleSource = (
  winningEvidence: FileEvidence[],
): NonNullable<FileAssessmentSource> | null => {
  if (!winningEvidence.length) return null;
  if (winningEvidence.some((entry) => entry.source === "metadata")) return "metadata";
  if (winningEvidence.some((entry) => entry.source === "title")) return "title";
  if (winningEvidence.some((entry) => entry.source === "label")) return "label";
  if (winningEvidence.some((entry) => entry.source === "filename")) return "filename";
  if (winningEvidence.some((entry) => entry.source === "shape")) return "shape";
  return null;
};

export const assessFile = ({
  fileName,
  fileNameRole = null,
  metadata,
  templateXAxisLabel,
  xAxisLabel,
}: FileAssessmentInput): FileAssessment => {
  const normalizedMetadata = metadata ?? {};
  const evidence = collectRoleEvidence({
    fileName,
    fileNameRole,
    metadata: normalizedMetadata,
    templateXAxisLabel,
    xAxisLabel,
  });

  const vgEvidence = evidence.filter((entry) => entry.role === "vg");
  const vdEvidence = evidence.filter((entry) => entry.role === "vd");
  const vgScore = vgEvidence.reduce((sum, entry) => sum + entry.weight, 0);
  const vdScore = vdEvidence.reduce((sum, entry) => sum + entry.weight, 0);
  const strongMetadataConflict = hasStrongMetadataConflict(evidence);
  const winningRole =
    vgScore === vdScore ? null : vgScore > vdScore ? "vg" : "vd";
  const winningEvidence = winningRole
    ? evidence.filter((entry) => entry.role === winningRole)
    : [];
  const strongestWinningWeight = winningEvidence.reduce(
    (max, entry) => Math.max(max, entry.weight),
    0,
  );
  const scoreGap = Math.abs(vgScore - vdScore);

  const strippedMetadataReason =
    normalizedMetadata.isStrippedChannelSweep && !evidence.length
      ? [
          "Shape only exposes generic CH1/CH2 sweep columns, so the gate/drain meaning is not reliable without a template.",
        ]
      : [];
  const pulseVoltageCurve = detectPulseVoltageCurveKind({
    fileName,
    metadata: normalizedMetadata,
  });
  if (pulseVoltageCurve && !strongMetadataConflict) {
    return {
      confidence: pulseVoltageCurve.confidence,
      curveType: pulseVoltageCurve.curveType,
      curveTypeLabel: buildCurveTypeLabel(pulseVoltageCurve.curveType, null),
      needsTemplate: false,
      reasons: [pulseVoltageCurve.reason],
      xAxisRole: null,
      xAxisRoleSource: pulseVoltageCurve.source,
    };
  }
  const capacitanceCurve = detectCapacitanceCurveKind({
    fileName,
    metadata: normalizedMetadata,
    templateXAxisLabel,
    xAxisLabel,
  });

  if (!winningRole || strongMetadataConflict) {
    if (capacitanceCurve && !strongMetadataConflict) {
      return {
        confidence: capacitanceCurve.confidence,
        curveType: capacitanceCurve.curveType,
        curveTypeLabel: buildCurveTypeLabel(capacitanceCurve.curveType, null),
        needsTemplate: false,
        reasons: [capacitanceCurve.reason],
        xAxisRole: null,
        xAxisRoleSource: capacitanceCurve.source,
      };
    }

    const reasons = strongMetadataConflict
      ? [
          "Metadata signals disagree on whether VAR1/X belongs to Vg or Vd.",
          ...evidence
            .sort((left, right) => right.weight - left.weight)
            .slice(0, MAX_ASSESSMENT_REASONS)
            .map((entry) => entry.reason),
          ...strippedMetadataReason,
        ]
      : [
          ...evidence
            .sort((left, right) => right.weight - left.weight)
            .slice(0, MAX_ASSESSMENT_REASONS)
            .map((entry) => entry.reason),
          ...strippedMetadataReason,
          ...(evidence.length
            ? []
            : ["No reliable transfer/output metadata was found."]),
        ];

    return {
      confidence: "low",
      curveType: "unknown",
      curveTypeLabel: buildCurveTypeLabel("unknown", null),
      needsTemplate: true,
      reasons,
      xAxisRole: null,
      xAxisRoleSource: null,
    };
  }

  const hasMetadataSupport = winningEvidence.some((entry) => entry.source === "metadata");
  const curveType = winningRole === "vg" ? "transfer" : "output";

  let confidence: FileAssessmentConfidence = "low";
  if (hasMetadataSupport && strongestWinningWeight >= 14 && scoreGap >= 10) {
    confidence = "high";
  } else if ((hasMetadataSupport && scoreGap >= 6) || scoreGap >= 8) {
    confidence = "medium";
  }

  const hasShapeSupport = winningEvidence.some((entry) => entry.source === "shape");

  if (confidence === "low" && normalizedMetadata.isStrippedChannelSweep && !hasShapeSupport) {
    return {
      confidence: "low",
      curveType: "unknown",
      curveTypeLabel: buildCurveTypeLabel("unknown", null),
      needsTemplate: true,
      reasons: [
        "Shape only exposes generic CH1/CH2 sweep columns, so the gate/drain meaning is not reliable without a template.",
        ...winningEvidence
          .sort((left, right) => right.weight - left.weight)
          .slice(0, 3)
          .map((entry) => entry.reason),
      ],
      xAxisRole: null,
      xAxisRoleSource: null,
    };
  }

  return {
    confidence,
    curveType,
    curveTypeLabel: buildCurveTypeLabel(curveType, winningRole),
    needsTemplate: confidence === "low",
    reasons: winningEvidence
      .sort((left, right) => right.weight - left.weight)
      .slice(0, MAX_ASSESSMENT_REASONS)
      .map((entry) => entry.reason),
    xAxisRole: winningRole,
    xAxisRoleSource: resolveRoleSource(winningEvidence),
  };
};
