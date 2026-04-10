export type DeviceAnalysisAxisRole = "vg" | "vd";

export type DeviceAnalysisCurveKind = "transfer" | "output" | "unknown";

export type DeviceAnalysisCurveConfidence = "high" | "medium" | "low";

export type DeviceAnalysisCurveSource =
  | "metadata"
  | "filename"
  | "title"
  | "label"
  | "shape"
  | null;

export type DeviceAnalysisCurveMetadata = {
  channelFuncs: string[];
  channelVNames: string[];
  dataNameColumns: string[];
  isStrippedChannelSweep: boolean;
  notesText: string;
  setupTitle: string;
  var1Name: string;
  var1NameSource: "channel" | "notes" | "";
  var2Name: string;
  var2NameSource: "channel" | "notes" | "";
  xAxisData: string;
};

export type DeviceAnalysisCurveClassification = {
  confidence: DeviceAnalysisCurveConfidence;
  curveType: DeviceAnalysisCurveKind;
  curveTypeLabel: string | null;
  needsTemplate: boolean;
  reasons: string[];
  xAxisRole: DeviceAnalysisAxisRole | null;
  xAxisRoleSource: DeviceAnalysisCurveSource;
};

type DeviceAnalysisCurveClassificationInput = {
  fileName?: unknown;
  fileNameRole?: DeviceAnalysisAxisRole | null;
  metadata?: Partial<DeviceAnalysisCurveMetadata> | null;
  templateXAxisLabel?: unknown;
  xAxisLabel?: unknown;
};

type CurveEvidence = {
  reason: string;
  role: DeviceAnalysisAxisRole;
  source: NonNullable<DeviceAnalysisCurveSource>;
  weight: number;
};

const normalizeCellText = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .replace(/^"+|"+$/g, "")
    .trim();

const firstNonEmpty = (values: unknown[]): string => {
  for (const value of values) {
    const normalized = normalizeCellText(value);
    if (normalized) return normalized;
  }
  return "";
};

export const detectDeviceAnalysisAxisRole = (
  value: unknown,
): DeviceAnalysisAxisRole | null => {
  const text = normalizeCellText(value).toLowerCase();
  if (!text) return null;

  const compact = text.replace(/[\s_\-./()[\]{}:=]+/g, "");
  const hasVg =
    /(^|[^a-z0-9])v[_-]?g(s|[^a-z0-9]|$)/.test(text) ||
    /(^|[^a-z0-9])gate(\s+voltage)?([^a-z0-9]|$)/.test(text) ||
    /(^|[^a-z0-9])transfer(\s+(curve|curves|characteristic|characteristics))?([^a-z0-9]|$)/.test(
      text,
    ) ||
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
    /(^|[^a-z0-9])output(\s+(curve|curves|characteristic|characteristics))?([^a-z0-9]|$)/.test(
      text,
    ) ||
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

export const extractDeviceAnalysisCurveMetadata = (
  rows: Array<Array<unknown> | null | undefined>,
): DeviceAnalysisCurveMetadata => {
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

  for (const rawRow of Array.isArray(rows) ? rows : []) {
    const row = Array.isArray(rawRow) ? rawRow.map((value) => normalizeCellText(value)) : [];
    if (!row.length) continue;

    const first = row[0] ?? "";
    const second = row[1] ?? "";

    if (!setupTitle && first === "SetupTitle") {
      setupTitle = firstNonEmpty(row.slice(1));
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
    }
  }

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
    notesText,
    setupTitle,
    var1Name,
    var1NameSource,
    var2Name,
    var2NameSource,
    xAxisData,
  };
};

const buildCurveTypeLabel = (
  curveType: DeviceAnalysisCurveKind,
  xAxisRole: DeviceAnalysisAxisRole | null,
): string | null => {
  if (curveType === "transfer") return xAxisRole === "vg" ? "transfer (vg)" : "transfer";
  if (curveType === "output") return xAxisRole === "vd" ? "output (vd)" : "output";
  if (curveType === "unknown") return "unknown";
  return null;
};

const reasonPrefixBySource: Record<NonNullable<DeviceAnalysisCurveSource>, string> = {
  filename: "Filename",
  label: "Axis label",
  metadata: "Metadata",
  shape: "Shape",
  title: "Template X label",
};

const toRoleLabel = (role: DeviceAnalysisAxisRole): string => (role === "vg" ? "Vg" : "Vd");

const pushEvidence = (
  evidence: CurveEvidence[],
  role: DeviceAnalysisAxisRole | null,
  weight: number,
  source: NonNullable<DeviceAnalysisCurveSource>,
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
}: DeviceAnalysisCurveClassificationInput): CurveEvidence[] => {
  const evidence: CurveEvidence[] = [];
  const normalizedMetadata = metadata ?? {};

  pushEvidence(
    evidence,
    detectDeviceAnalysisAxisRole(normalizedMetadata.xAxisData),
    18,
    "metadata",
    `declares X axis as ${normalizedMetadata.xAxisData}.`,
  );

  if (normalizedMetadata.var1Name) {
    pushEvidence(
      evidence,
      detectDeviceAnalysisAxisRole(normalizedMetadata.var1Name),
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
    detectDeviceAnalysisAxisRole(firstDataName),
    14,
    "metadata",
    `starts DataName with ${firstDataName}.`,
  );

  pushEvidence(
    evidence,
    detectDeviceAnalysisAxisRole(normalizedMetadata.setupTitle),
    6,
    "metadata",
    `uses setup title ${normalizedMetadata.setupTitle}.`,
  );

  pushEvidence(
    evidence,
    detectDeviceAnalysisAxisRole(templateXAxisLabel),
    6,
    "title",
    `suggests ${toRoleLabel(detectDeviceAnalysisAxisRole(templateXAxisLabel) ?? "vg")}.`,
  );

  pushEvidence(
    evidence,
    detectDeviceAnalysisAxisRole(xAxisLabel),
    5,
    "label",
    `suggests ${toRoleLabel(detectDeviceAnalysisAxisRole(xAxisLabel) ?? "vg")}.`,
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

  const fileNameRoleFromText = detectDeviceAnalysisAxisRole(fileName);
  pushEvidence(
    evidence,
    fileNameRoleFromText,
    2,
    "filename",
    `contains ${toRoleLabel(fileNameRoleFromText ?? "vg")} hints.`,
  );

  return evidence;
};

const hasStrongMetadataConflict = (evidence: CurveEvidence[]): boolean => {
  const vgMetadata = evidence.some(
    (entry) => entry.source === "metadata" && entry.role === "vg" && entry.weight >= 14,
  );
  const vdMetadata = evidence.some(
    (entry) => entry.source === "metadata" && entry.role === "vd" && entry.weight >= 14,
  );
  return vgMetadata && vdMetadata;
};

const resolveRoleSource = (
  winningEvidence: CurveEvidence[],
): NonNullable<DeviceAnalysisCurveSource> | null => {
  if (!winningEvidence.length) return null;
  if (winningEvidence.some((entry) => entry.source === "metadata")) return "metadata";
  if (winningEvidence.some((entry) => entry.source === "title")) return "title";
  if (winningEvidence.some((entry) => entry.source === "label")) return "label";
  if (winningEvidence.some((entry) => entry.source === "filename")) return "filename";
  if (winningEvidence.some((entry) => entry.source === "shape")) return "shape";
  return null;
};

export const classifyDeviceAnalysisCurve = ({
  fileName,
  fileNameRole = null,
  metadata,
  templateXAxisLabel,
  xAxisLabel,
}: DeviceAnalysisCurveClassificationInput): DeviceAnalysisCurveClassification => {
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

  if (!winningRole || strongMetadataConflict) {
    const reasons = strongMetadataConflict
      ? [
          "Metadata signals disagree on whether VAR1/X belongs to Vg or Vd.",
          ...evidence
            .sort((left, right) => right.weight - left.weight)
            .slice(0, 4)
            .map((entry) => entry.reason),
          ...strippedMetadataReason,
        ]
      : [
          ...evidence
            .sort((left, right) => right.weight - left.weight)
            .slice(0, 4)
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

  let confidence: DeviceAnalysisCurveConfidence = "low";
  if (hasMetadataSupport && strongestWinningWeight >= 14 && scoreGap >= 10) {
    confidence = "high";
  } else if ((hasMetadataSupport && scoreGap >= 6) || scoreGap >= 8) {
    confidence = "medium";
  }

  if (confidence === "low" && normalizedMetadata.isStrippedChannelSweep) {
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
      .slice(0, 4)
      .map((entry) => entry.reason),
    xAxisRole: winningRole,
    xAxisRoleSource: resolveRoleSource(winningEvidence),
  };
};
