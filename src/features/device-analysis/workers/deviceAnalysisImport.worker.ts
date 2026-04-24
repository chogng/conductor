import {
  assessImportedDeviceAnalysisFile,
  toCsvCompatibleDataFile,
  type ImportedDeviceAnalysisCurveAssessment,
} from "../shared/lib/deviceAnalysisImportFileUtils";
import {
  isDeviceAnalysisPerfEnabled,
  startDeviceAnalysisPerf,
} from "../shared/lib/deviceAnalysisPerf";

type PrepareImportFilePayload = {
  file?: File | null;
  perfEnabled?: boolean;
  requestId?: number | null;
};

type PrepareImportFileResult = {
  assessment: ImportedDeviceAnalysisCurveAssessment;
  file: File;
  normalizedSizeBytes: number;
  requestId: number | null;
  sourceName: string;
  sourceSizeBytes: number;
};

const workerScope = self as any;

workerScope.onmessage = async (
  event: MessageEvent<{ payload?: PrepareImportFilePayload; type?: string }>,
) => {
  const { type, payload } = event.data ?? {};

  if (type !== "prepareImportFile") {
    workerScope.postMessage({
      type: "importWorkerError",
      payload: {
        requestId: payload?.requestId ?? null,
        message: `Unknown import worker message type: ${String(type)}`,
      },
    });
    return;
  }

  const requestId = payload?.requestId ?? null;
  const file = payload?.file ?? null;
  const shouldLogPerf = Boolean(payload?.perfEnabled) || isDeviceAnalysisPerfEnabled();

  try {
    if (!file) throw new Error("Missing import file.");

    const finishPreparePerf = startDeviceAnalysisPerf(
      "import-worker:prepare-file",
      {
        fileName: file.name,
        sizeBytes: file.size,
      },
      { force: shouldLogPerf },
    );
    const finishNormalizePerf = startDeviceAnalysisPerf(
      "import-worker:normalize-file",
      {
        fileName: file.name,
        sizeBytes: file.size,
      },
      { force: shouldLogPerf },
    );
    const normalizedFile = await toCsvCompatibleDataFile(file);
    finishNormalizePerf({
      normalizedName: normalizedFile.name,
      normalizedSizeBytes: normalizedFile.size,
    });

    const finishAssessPerf = startDeviceAnalysisPerf(
      "import-worker:assess-file",
      {
        fileName: normalizedFile.name,
        sizeBytes: normalizedFile.size,
      },
      { force: shouldLogPerf },
    );
    const assessment = await assessImportedDeviceAnalysisFile(normalizedFile);
    finishAssessPerf({
      confidence: assessment.curveTypeConfidence,
      curveType: assessment.curveType,
      xAxisRole: assessment.xAxisRole,
    });

    const result: PrepareImportFileResult = {
      assessment,
      file: normalizedFile,
      normalizedSizeBytes: normalizedFile.size,
      requestId,
      sourceName: file.name,
      sourceSizeBytes: file.size,
    };

    finishPreparePerf({
      confidence: assessment.curveTypeConfidence,
      curveType: assessment.curveType,
      normalizedSizeBytes: normalizedFile.size,
      xAxisRole: assessment.xAxisRole,
    });

    workerScope.postMessage({
      type: "prepareImportFileResult",
      payload: result,
    });
  } catch (error) {
    workerScope.postMessage({
      type: "importWorkerError",
      payload: {
        requestId,
        fileName: file?.name ?? null,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
};
