/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

type ConvertXlsxRequest = {
  file: File;
  requestId: number;
  type: "convertXlsx";
};

type ConvertXlsxResponse = {
  csvText?: string;
  error?: string;
  requestId: number;
  type: "convertXlsxResult";
};

type XlsxWasmExports = {
  memory: WebAssembly.Memory;
  xlsx_alloc: (len: number) => number;
  xlsx_convert_csv: (ptr: number, len: number) => number;
  xlsx_dealloc: (ptr: number, len: number) => void;
  xlsx_free_result: (ptr: number) => void;
};

type XlsxWasmResponse = {
  csvText?: string;
  error?: string;
  ok?: boolean;
};

const textDecoder = new TextDecoder();

let wasmExportsPromise: Promise<XlsxWasmExports> | undefined;

const readExports = (exportsValue: WebAssembly.Exports): XlsxWasmExports => {
  const exportsRecord = exportsValue as Record<string, unknown>;
  const memory = exportsRecord.memory;
  const alloc = exportsRecord.xlsx_alloc;
  const dealloc = exportsRecord.xlsx_dealloc;
  const convert = exportsRecord.xlsx_convert_csv;
  const freeResult = exportsRecord.xlsx_free_result;

  if (
    !(memory instanceof WebAssembly.Memory) ||
    typeof alloc !== "function" ||
    typeof dealloc !== "function" ||
    typeof convert !== "function" ||
    typeof freeResult !== "function"
  ) {
    throw new Error("Invalid xlsx WASM exports.");
  }

  return {
    memory,
    xlsx_alloc: alloc as XlsxWasmExports["xlsx_alloc"],
    xlsx_convert_csv: convert as XlsxWasmExports["xlsx_convert_csv"],
    xlsx_dealloc: dealloc as XlsxWasmExports["xlsx_dealloc"],
    xlsx_free_result: freeResult as XlsxWasmExports["xlsx_free_result"],
  };
};

const loadWasmExports = async (): Promise<XlsxWasmExports> => {
  if (!wasmExportsPromise) {
    const response = await fetch(new URL("./xlsx.wasm", import.meta.url));
    if (!response.ok) {
      throw new Error(`Failed to load xlsx WASM: ${response.status}`);
    }
    wasmExportsPromise = response
      .arrayBuffer()
      .then(bytes => WebAssembly.instantiate(bytes, {}))
      .then(result =>
        readExports((result as WebAssembly.WebAssemblyInstantiatedSource).instance.exports)
      );
  }
  return wasmExportsPromise;
};

const readResult = (wasm: XlsxWasmExports, resultPtr: number): XlsxWasmResponse => {
  const lengthView = new DataView(wasm.memory.buffer, resultPtr, 4);
  const resultLength = lengthView.getUint32(0, true);
  const resultBytes = new Uint8Array(wasm.memory.buffer, resultPtr + 4, resultLength);
  return JSON.parse(textDecoder.decode(resultBytes)) as XlsxWasmResponse;
};

const readWorkbookCsv = async (file: File): Promise<string> => {
  const wasm = await loadWasmExports();
  const buffer = await file.arrayBuffer();
  const inputBytes = new Uint8Array(buffer);
  const inputPtr = wasm.xlsx_alloc(inputBytes.length);
  new Uint8Array(wasm.memory.buffer, inputPtr, inputBytes.length).set(inputBytes);

  let resultPtr = 0;
  try {
    resultPtr = wasm.xlsx_convert_csv(inputPtr, inputBytes.length);
    const response = readResult(wasm, resultPtr);
    if (response.ok && typeof response.csvText === "string") {
      return response.csvText;
    }
    throw new Error(response.error || "Failed to convert workbook.");
  } finally {
    wasm.xlsx_dealloc(inputPtr, inputBytes.length);
    if (resultPtr) {
      wasm.xlsx_free_result(resultPtr);
    }
  }
};

self.onmessage = (event: MessageEvent<ConvertXlsxRequest>) => {
  const message = event.data;
  if (message?.type !== "convertXlsx") {
    return;
  }

  void readWorkbookCsv(message.file)
    .then(csvText => {
      const response: ConvertXlsxResponse = {
        csvText,
        requestId: message.requestId,
        type: "convertXlsxResult",
      };
      self.postMessage(response);
    })
    .catch(error => {
      const response: ConvertXlsxResponse = {
        error: error instanceof Error ? error.message : String(error),
        requestId: message.requestId,
        type: "convertXlsxResult",
      };
      self.postMessage(response);
    });
};
