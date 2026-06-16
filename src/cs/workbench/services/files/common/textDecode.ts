/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export type TextDecodeEncoding =
  | "utf-8"
  | "utf-8-bom"
  | "gbk"
  | "big5"
  | "shift-jis"
  | "utf-16le"
  | "utf-16be";

export type TextDecodeResult = {
  readonly ok: boolean;
  readonly encoding?: TextDecodeEncoding;
  readonly confidence: number;
  readonly replacementCharRatio: number;
  readonly controlCharRatio: number;
  readonly binaryLike: boolean;
  readonly reason?: string;
  readonly text?: string;
};

const BINARY_MAGIC_HEADERS: readonly (readonly number[])[] = [
  [0x50, 0x4b, 0x03, 0x04],
  [0x50, 0x4b, 0x05, 0x06],
  [0x50, 0x4b, 0x07, 0x08],
  [0xd0, 0xcf, 0x11, 0xe0],
  [0x1f, 0x8b],
];

const TEXT_ENCODINGS: readonly { readonly encoding: TextDecodeEncoding; readonly label: string }[] = [
  { encoding: "utf-8", label: "utf-8" },
  { encoding: "gbk", label: "gbk" },
  { encoding: "big5", label: "big5" },
  { encoding: "shift-jis", label: "shift-jis" },
];

const MAX_DECODE_SAMPLE_BYTES = 256 * 1024;
const MAX_REPLACEMENT_CHAR_RATIO = 0.001;
const MAX_CONTROL_CHAR_RATIO = 0.02;

export const decodeTextBytes = (
  bytes: ArrayBuffer | Uint8Array,
): TextDecodeResult => {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.byteLength === 0) {
    return {
      ok: true,
      encoding: "utf-8",
      confidence: 1,
      replacementCharRatio: 0,
      controlCharRatio: 0,
      binaryLike: false,
      text: "",
    };
  }

  if (hasBinaryMagicHeader(data)) {
    return createFailedDecodeResult(data, "Binary container signature detected.");
  }

  const binaryLike = isBinaryLike(data);
  if (binaryLike) {
    return createFailedDecodeResult(data, "File content appears to be binary.");
  }

  const bom = detectBom(data);
  if (bom) {
    const decoded = tryDecode(data, bom.label);
    if (decoded !== null) {
      return createSuccessfulDecodeResult(
        stripUtf8Bom(decoded),
        bom.encoding,
        data,
      );
    }
  }

  for (const candidate of TEXT_ENCODINGS) {
    const decoded = tryDecode(data, candidate.label);
    if (decoded === null) {
      continue;
    }

    const quality = measureTextQuality(decoded, data);
    if (
      quality.replacementCharRatio <= MAX_REPLACEMENT_CHAR_RATIO &&
      quality.controlCharRatio <= MAX_CONTROL_CHAR_RATIO
    ) {
      return {
        ok: true,
        encoding: candidate.encoding,
        confidence: quality.confidence,
        replacementCharRatio: quality.replacementCharRatio,
        controlCharRatio: quality.controlCharRatio,
        binaryLike: false,
        text: stripUtf8Bom(decoded),
      };
    }
  }

  const fallbackText = new TextDecoder("utf-8", { fatal: false }).decode(data);
  const quality = measureTextQuality(fallbackText, data);
  return {
    ok: false,
    confidence: quality.confidence,
    replacementCharRatio: quality.replacementCharRatio,
    controlCharRatio: quality.controlCharRatio,
    binaryLike,
    reason: quality.replacementCharRatio > MAX_REPLACEMENT_CHAR_RATIO
      ? "Text encoding produced replacement characters."
      : "Text encoding or table structure is not reliable.",
  };
};

const createSuccessfulDecodeResult = (
  text: string,
  encoding: TextDecodeEncoding,
  data: Uint8Array,
): TextDecodeResult => {
  const quality = measureTextQuality(text, data);
  return {
    ok: true,
    encoding,
    confidence: quality.confidence,
    replacementCharRatio: quality.replacementCharRatio,
    controlCharRatio: quality.controlCharRatio,
    binaryLike: false,
    text,
  };
};

const createFailedDecodeResult = (
  data: Uint8Array,
  reason: string,
): TextDecodeResult => ({
  ok: false,
  confidence: 0,
  replacementCharRatio: 0,
  controlCharRatio: measureControlCharRatio(new TextDecoder("latin1").decode(data.slice(0, MAX_DECODE_SAMPLE_BYTES))),
  binaryLike: true,
  reason,
});

const tryDecode = (
  data: Uint8Array,
  label: string,
): string | null => {
  try {
    return new TextDecoder(label, { fatal: true }).decode(data);
  } catch {
    return null;
  }
};

const detectBom = (
  data: Uint8Array,
): { readonly encoding: TextDecodeEncoding; readonly label: string } | null => {
  if (data.length >= 3 && data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
    return { encoding: "utf-8-bom", label: "utf-8" };
  }
  if (data.length >= 2 && data[0] === 0xff && data[1] === 0xfe) {
    return { encoding: "utf-16le", label: "utf-16le" };
  }
  if (data.length >= 2 && data[0] === 0xfe && data[1] === 0xff) {
    return { encoding: "utf-16be", label: "utf-16be" };
  }
  return null;
};

const stripUtf8Bom = (text: string): string =>
  text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

const hasBinaryMagicHeader = (data: Uint8Array): boolean =>
  BINARY_MAGIC_HEADERS.some(header =>
    header.every((byte, index) => data[index] === byte)
  );

const isBinaryLike = (data: Uint8Array): boolean => {
  const sampleLength = Math.min(data.byteLength, MAX_DECODE_SAMPLE_BYTES);
  let nullCount = 0;
  let controlCount = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    const byte = data[index];
    if (byte === 0) {
      nullCount += 1;
      continue;
    }
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) {
      controlCount += 1;
    }
  }
  return nullCount > 0 || controlCount / Math.max(1, sampleLength) > MAX_CONTROL_CHAR_RATIO;
};

const measureTextQuality = (
  text: string,
  data: Uint8Array,
): {
  readonly confidence: number;
  readonly replacementCharRatio: number;
  readonly controlCharRatio: number;
} => {
  const replacementCharRatio = measureReplacementCharRatio(text);
  const controlCharRatio = measureControlCharRatio(text);
  const confidence = Math.max(
    0,
    Math.min(1, 1 - replacementCharRatio * 100 - controlCharRatio * 10),
  );
  return {
    confidence: data.byteLength > 0 ? confidence : 1,
    replacementCharRatio,
    controlCharRatio,
  };
};

const measureReplacementCharRatio = (text: string): number => {
  if (!text.length) {
    return 0;
  }
  let count = 0;
  for (const char of text) {
    if (char === "\ufffd") {
      count += 1;
    }
  }
  return count / text.length;
};

const measureControlCharRatio = (text: string): number => {
  if (!text.length) {
    return 0;
  }
  let count = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (
      code < 0x20 &&
      code !== 0x09 &&
      code !== 0x0a &&
      code !== 0x0d
    ) {
      count += 1;
    }
  }
  return count / text.length;
};
