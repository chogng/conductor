import type { AnalysisFileAssessment } from "../common/analysisFile.ts";

type AssessmentWasmExports = {
  assessment_alloc: (len: number) => number;
  assessment_assess_import_json: (ptr: number, len: number) => number;
  assessment_dealloc: (ptr: number, len: number) => void;
  assessment_free_result: (ptr: number) => void;
  memory: WebAssembly.Memory;
};

type AssessmentWasmResponse = AnalysisFileAssessment & {
  error?: string;
};

type NodeFsPromises = {
  readFile: (path: URL) => Promise<Uint8Array>;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

let wasmExportsPromise: Promise<AssessmentWasmExports> | undefined;

const isNodeRuntime = (): boolean => {
  const globalWithProcess = globalThis as {
    process?: {
      versions?: {
        node?: string;
      };
    };
  };
  return typeof globalWithProcess.process?.versions?.node === "string";
};

const loadWasmBytes = async (): Promise<ArrayBuffer | Uint8Array> => {
  const wasmUrl = new URL("./assessment.wasm", import.meta.url);
  if (isNodeRuntime()) {
    // Keep this Node-only test path invisible to Vite's browser resolver.
    const importModule = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<unknown>;
    const fs = await importModule("node:fs/promises") as NodeFsPromises;
    return fs.readFile(wasmUrl);
  }

  const response = await fetch(wasmUrl);
  if (!response.ok) {
    throw new Error(`Failed to load assessment WASM: ${response.status}`);
  }
  return response.arrayBuffer();
};

const readExports = (exportsValue: WebAssembly.Exports): AssessmentWasmExports => {
  const exportsRecord = exportsValue as Record<string, unknown>;
  const memory = exportsRecord.memory;
  const alloc = exportsRecord.assessment_alloc;
  const dealloc = exportsRecord.assessment_dealloc;
  const assess = exportsRecord.assessment_assess_import_json;
  const freeResult = exportsRecord.assessment_free_result;

  if (
    !(memory instanceof WebAssembly.Memory) ||
    typeof alloc !== "function" ||
    typeof dealloc !== "function" ||
    typeof assess !== "function" ||
    typeof freeResult !== "function"
  ) {
    throw new Error("Invalid assessment WASM exports.");
  }

  return {
    assessment_alloc: alloc as AssessmentWasmExports["assessment_alloc"],
    assessment_assess_import_json: assess as AssessmentWasmExports["assessment_assess_import_json"],
    assessment_dealloc: dealloc as AssessmentWasmExports["assessment_dealloc"],
    assessment_free_result: freeResult as AssessmentWasmExports["assessment_free_result"],
    memory,
  };
};

const loadWasmExports = async (): Promise<AssessmentWasmExports> => {
  if (!wasmExportsPromise) {
    wasmExportsPromise = loadWasmBytes()
      .then((bytes) => WebAssembly.instantiate(bytes as BufferSource, {}))
      .then((result) => readExports((result as WebAssembly.WebAssemblyInstantiatedSource).instance.exports));
  }
  return wasmExportsPromise;
};

const readResult = (
  wasm: AssessmentWasmExports,
  resultPtr: number,
): AssessmentWasmResponse => {
  const lengthView = new DataView(wasm.memory.buffer, resultPtr, 4);
  const resultLength = lengthView.getUint32(0, true);
  const resultBytes = new Uint8Array(wasm.memory.buffer, resultPtr + 4, resultLength);
  return JSON.parse(textDecoder.decode(resultBytes)) as AssessmentWasmResponse;
};

export const assessImportRowsWithWasm = async (
  fileName: string,
  rows: string[][],
): Promise<AnalysisFileAssessment> => {
  const wasm = await loadWasmExports();
  const inputBytes = textEncoder.encode(JSON.stringify({
    fileName,
    rows,
  }));
  const inputPtr = wasm.assessment_alloc(inputBytes.length);
  new Uint8Array(wasm.memory.buffer, inputPtr, inputBytes.length).set(inputBytes);

  let resultPtr = 0;
  try {
    resultPtr = wasm.assessment_assess_import_json(inputPtr, inputBytes.length);
    const response = readResult(wasm, resultPtr);
    if (response.error) {
      throw new Error(response.error);
    }
    return response;
  } finally {
    wasm.assessment_dealloc(inputPtr, inputBytes.length);
    if (resultPtr) {
      wasm.assessment_free_result(resultPtr);
    }
  }
};
