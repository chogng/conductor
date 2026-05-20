import { assessImportedFile } from "src/cs/workbench/common/deviceAnalysis/importFileUtils";
import { toCsvCompatibleDataFile } from "src/cs/workbench/contrib/import/importFileConversion";
import {
  isPerfEnabled,
  startPerf,
} from "src/cs/workbench/common/deviceAnalysis/perf";
import type { ImportedCurveAssessment } from "src/cs/workbench/common/deviceAnalysis/importFileUtils";

type PrepareImportFilePayload = {
  file?: File | null;
  perfEnabled?: boolean;
  requestId?: number | null;
};

type PrepareImportFileResult = {
  assessment: ImportedCurveAssessment;
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
  const shouldLogPerf = Boolean(payload?.perfEnabled) || isPerfEnabled();

  try {
    if (!file) throw new Error("Missing import file.");

    const finishPreparePerf = startPerf(
      "import-worker:prepare-file",
      {
        fileName: file.name,
        sizeBytes: file.size,
      },
      { force: shouldLogPerf },
    );
    const finishNormalizePerf = startPerf(
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

    const finishAssessPerf = startPerf(
      "import-worker:assess-file",
      {
        fileName: normalizedFile.name,
        sizeBytes: normalizedFile.size,
      },
      { force: shouldLogPerf },
    );
    const assessment = await assessImportedFile(normalizedFile);
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
