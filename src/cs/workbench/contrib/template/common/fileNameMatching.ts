const FILE_NAME_MATCH_INPUT_SPLIT_RE = /[,;\n]+/;
const FILE_EXTENSION_RE = /\.[A-Za-z][A-Za-z0-9]{0,9}$/;
const TOKEN_EDGE_TRIM_RE = /^[^A-Za-z0-9\u00C0-\u024F\u4E00-\u9FFF]+|[^A-Za-z0-9\u00C0-\u024F\u4E00-\u9FFF]+$/gu;
const RAW_CHUNK_SPLIT_RE = /[,\[\]{};]+/g;
const RAW_SUBCHUNK_SPLIT_RE = /_+/g;
const RAW_CHUNK_EDGE_TRIM_RE = /^[\s"'`]+|[\s"'`,;_]+$/g;

export const DEFAULT_FILE_NAME_FIELD_SEPARATORS = "_- .()[]{}";

const normalizeByCase = (value: string, caseSensitive: boolean): string =>
  caseSensitive ? value : value.toLowerCase();

const escapeRegexCharClassToken = (value: string): string =>
  value.replace(/[\\\]\-^]/g, "\\$&");

const uniqueCharacters = (value: string): string => {
  const seen = new Set<string>();
  let result = "";

  for (const char of value) {
    if (seen.has(char)) continue;
    seen.add(char);
    result += char;
  }

  return result;
};

const buildFileNameFieldSplitRegExp = (separators: unknown): RegExp => {
  const escaped = Array.from(normalizeFileNameFieldSeparators(separators))
    .map((char) => escapeRegexCharClassToken(char))
    .join("");

  return new RegExp(`[${escaped}]+`, "g");
};

const normalizeCandidateWhitespace = (value: string): string =>
  String(value ?? "").replace(/\s+/g, " ").trim();

const trimCandidateToken = (value: string): string =>
  normalizeCandidateWhitespace(String(value ?? "").replace(TOKEN_EDGE_TRIM_RE, ""));

const trimRawChunkCandidate = (value: string): string =>
  normalizeCandidateWhitespace(
    String(value ?? "").replace(RAW_CHUNK_EDGE_TRIM_RE, ""),
  );

const normalizeCompactMatchKey = (
  value: string,
  caseSensitive: boolean,
): string =>
  normalizeByCase(value, caseSensitive).replace(
    /[^A-Za-z0-9\u00C0-\u024F\u4E00-\u9FFF]+/gu,
    "",
  );

const containsLetterLikeCharacters = (value: string): boolean =>
  /[A-Za-z\u00C0-\u024F\u4E00-\u9FFF]/u.test(String(value ?? ""));

const isStructuredNumericCompoundCandidate = (value: string): boolean =>
  /^\d+(?:[-/]\d+)+$/u.test(String(value ?? "").trim());

const looksDateOrTimeLikeCandidate = (value: string): boolean => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return false;

  if (/^(?:am|pm)$/i.test(trimmed)) return true;
  if (/^\d{1,2}\s*(?:am|pm)$/i.test(trimmed)) return true;
  if (/^\d{1,2}(?::\d{2}){1,2}(?:\s*(?:am|pm))?$/i.test(trimmed)) {
    return true;
  }
  if (
    /^(?:19|20)\d{2}(?:[._/\-\s]+\d{1,2}){0,5}(?:\s*(?:am|pm))?$/i.test(trimmed)
  ) {
    return true;
  }
  if (
    /^(?:\d{1,2}[._/\-\s]+){2,}\d{1,4}(?:\s+\d{1,2})?(?:\s*(?:am|pm))?$/i.test(
      trimmed,
    )
  ) {
    return true;
  }

  return false;
};

const shouldKeepRawChunkCandidate = (value: string): boolean => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return false;
  if (looksDateOrTimeLikeCandidate(trimmed)) return false;
  if (isStructuredNumericCompoundCandidate(trimmed)) return true;
  if (!containsLetterLikeCharacters(trimmed) && trimmed.length <= 3) return false;
  if (!containsLetterLikeCharacters(trimmed) && /\s/.test(trimmed)) return false;
  return true;
};

const shouldSuggestFieldCandidate = (value: string): boolean => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return false;
  if (trimmed.length <= 1) return false;
  if (
    !containsLetterLikeCharacters(trimmed) &&
    !isStructuredNumericCompoundCandidate(trimmed)
  ) {
    return false;
  }
  if (looksDateOrTimeLikeCandidate(trimmed)) return false;
  return true;
};

const deriveEmbeddedSemanticCandidates = (value: string): string[] => {
  const trimmed = trimRawChunkCandidate(value);
  if (!trimmed) return [];

  const candidates = new Set<string>();
  const measurementMatches = trimmed.matchAll(
    /\d+(?:\.\d+)+(?:[A-Za-z\u00C0-\u024F\u4E00-\u9FFF]+(?:\(\d+\))?)?/gu,
  );

  for (const match of measurementMatches) {
    const candidate = trimRawChunkCandidate(match[0]);
    if (candidate) {
      candidates.add(candidate);
    }
  }

  for (const segment of trimmed.split(/[-/]+/g)) {
    const candidate = trimRawChunkCandidate(segment);
    if (!candidate) continue;
    if (!containsLetterLikeCharacters(candidate)) continue;
    if (!/\d/.test(candidate)) continue;
    if (!/[.]/.test(candidate)) continue;
    candidates.add(candidate);
  }

  return Array.from(candidates);
};

const deriveHierarchicalPrefixCandidates = (value: string): string[] => {
  const trimmed = trimRawChunkCandidate(value);
  if (!trimmed) return [];

  const segments = trimmed
    .split(/[-/]+/g)
    .map((segment) => trimRawChunkCandidate(segment))
    .filter(Boolean);

  if (segments.length < 3) return [];

  const tailSegment = segments.at(-1) ?? "";
  const tailIsSemantic =
    containsLetterLikeCharacters(tailSegment) || /\d+\.\d+/u.test(tailSegment);
  if (!tailIsSemantic) return [];

  const candidates = new Set<string>();
  for (let index = 2; index < segments.length; index += 1) {
    const prefix = segments.slice(0, index).join("-");
    if (!isStructuredNumericCompoundCandidate(prefix)) continue;
    if (looksDateOrTimeLikeCandidate(prefix)) continue;
    candidates.add(prefix);
  }

  return Array.from(candidates);
};

const expandRawChunkCandidate = (value: string): string[] => {
  const trimmed = trimRawChunkCandidate(value);
  if (!trimmed) return [];

  const candidates = new Set<string>([trimmed]);
  const parentheticalIndex = trimmed.lastIndexOf("(");
  if (parentheticalIndex > 0 && /\(\d+\)\s*$/u.test(trimmed)) {
    candidates.add(trimmed.slice(0, parentheticalIndex).trim());
  }
  for (const embeddedCandidate of deriveEmbeddedSemanticCandidates(trimmed)) {
    candidates.add(embeddedCandidate);
  }
  for (const hierarchicalCandidate of deriveHierarchicalPrefixCandidates(trimmed)) {
    candidates.add(hierarchicalCandidate);
  }

  return Array.from(candidates).filter(Boolean);
};

const deriveRawChunkCandidates = (baseName: string): string[] => {
  const candidates = new Set<string>();

  for (const chunk of String(baseName ?? "").split(RAW_CHUNK_SPLIT_RE)) {
    const normalizedChunk = trimRawChunkCandidate(chunk);
    if (!normalizedChunk) continue;

    const rawSubChunks = normalizedChunk
      .split(RAW_SUBCHUNK_SPLIT_RE)
      .map((entry) => trimRawChunkCandidate(entry))
      .filter(Boolean);

    if (!normalizedChunk.includes("_") && normalizedChunk.split(/\s+/).length <= 2) {
      for (const expanded of expandRawChunkCandidate(normalizedChunk)) {
        if (shouldKeepRawChunkCandidate(expanded)) {
          candidates.add(expanded);
        }
      }
    }

    for (const subChunk of rawSubChunks) {
      for (const expanded of expandRawChunkCandidate(subChunk)) {
        if (shouldKeepRawChunkCandidate(expanded)) {
          candidates.add(expanded);
        }
      }
    }
  }

  return Array.from(candidates);
};

const scoreFieldToken = (
  value: string,
  count: number,
  totalFiles: number,
): number => {
  const trimmed = String(value ?? "").trim();
  const digitCount = (trimmed.match(/\d/g) ?? []).length;
  const letterCount = (
    trimmed.match(/[A-Za-z\u00C0-\u024F\u4E00-\u9FFF]/gu) ?? []
  ).length;
  const isNumeric = /^\d+(?:[._-]\d+)*$/.test(trimmed);
  const looksDate = /^(?:19|20)\d{2}[._-]?\d{2}(?:[._-]?\d{2})?$/.test(trimmed);

  let score = count * 100;

  if (trimmed.length <= 1) score -= 240;
  if (letterCount > 0) score += 40;
  if (digitCount === 0) score += 20;
  if (letterCount > 0 && digitCount > 0 && letterCount >= digitCount) {
    score += 10;
  }
  if (/^[A-Za-z\u4E00-\u9FFF][A-Za-z0-9\u4E00-\u9FFF]*$/u.test(trimmed)) {
    score += 20;
  }
  if (/[A-Za-z\u00C0-\u024F\u4E00-\u9FFF]/gu.test(trimmed) && /[-./]/.test(trimmed)) {
    score += 24;
  }
  if (/[A-Za-z\u00C0-\u024F\u4E00-\u9FFF]/gu.test(trimmed) && /\(\d+\)\s*$/u.test(trimmed)) {
    score += 12;
  }
  if (isStructuredNumericCompoundCandidate(trimmed)) score += 18;
  if (/\s/.test(trimmed)) score -= 10;
  if (/#/.test(trimmed)) score -= 16;
  if (count === totalFiles && totalFiles > 1) score -= 120;
  if (isNumeric) score -= 160;
  if (looksDate) score -= 100;
  if (/^\d{1,2}(_\d{1,2}){2,}$/.test(trimmed)) score -= 80;
  if (/^(am|pm)$/i.test(trimmed)) score -= 160;

  return score;
};

const splitAlphaNumericBoundary = (value: string): string[] => {
  const trailingDigitsMatch = value.match(
    /^([A-Za-z\u00C0-\u024F\u4E00-\u9FFF]{3,})(\d+)$/u,
  );
  if (trailingDigitsMatch) {
    return [trailingDigitsMatch[1], trailingDigitsMatch[2]];
  }

  const trailingLettersMatch = value.match(
    /^(\d+)([A-Za-z\u00C0-\u024F\u4E00-\u9FFF]{3,})$/u,
  );
  if (trailingLettersMatch) {
    return [trailingLettersMatch[1], trailingLettersMatch[2]];
  }

  return [value];
};

const splitFieldByBoundaries = (value: string): string[] =>
  String(value ?? "")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z\u00C0-\u024F\u4E00-\u9FFF])([A-Z])/gu, "$1 $2")
    .split(/\s+/)
    .map((token) => trimCandidateToken(token))
    .filter(Boolean)
    .flatMap((token) => splitAlphaNumericBoundary(token));

export type FileNameFieldSuggestion = {
  count: number;
  normalizedValue: string;
  sampleFileNames: string[];
  score: number;
  value: string;
};

export function normalizeFileNameFieldSeparators(value: unknown): string {
  const raw = String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\n/g, "")
    .replace(/\t/g, " ");
  const deduped = uniqueCharacters(raw);

  return deduped.length ? deduped : DEFAULT_FILE_NAME_FIELD_SEPARATORS;
}

export function stripFileExtension(fileName: unknown): string {
  const baseName = String(fileName ?? "").split(/[\\/]/).pop() ?? "";
  return baseName.replace(FILE_EXTENSION_RE, "");
}

export function normalizeFileNamePhrase(
  value: unknown,
  caseSensitive = false,
): string {
  return normalizeByCase(String(value ?? "").trim(), caseSensitive);
}

export function splitFileNameMatchInput(
  value: unknown,
  caseSensitive = false,
): string[] {
  return String(value ?? "")
    .split(FILE_NAME_MATCH_INPUT_SPLIT_RE)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => normalizeByCase(token, caseSensitive));
}

export function joinFileNameMatchInput(
  tokens: Array<string | null | undefined>,
): string {
  return tokens
    .map((token) => String(token ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

export function tokenizeFileNameFields(
  fileName: unknown,
  options: {
    caseSensitive?: boolean;
    separators?: unknown;
  } = {},
): string[] {
  const caseSensitive = Boolean(options.caseSensitive);
  const baseName = stripFileExtension(fileName);

  return baseName
    .split(buildFileNameFieldSplitRegExp(options.separators))
    .flatMap((token) => splitFieldByBoundaries(token.trim()))
    .map((token) => normalizeByCase(token, caseSensitive));
}

export function collectFileNameFieldCandidates(
  fileName: unknown,
  options: {
    caseSensitive?: boolean;
    separators?: unknown;
  } = {},
): string[] {
  const caseSensitive = Boolean(options.caseSensitive);
  const baseName = stripFileExtension(fileName);
  const candidates = new Map<string, string>();
  const addCandidate = (candidate: string) => {
    const normalized = normalizeByCase(candidate, caseSensitive);
    if (!normalized) return;
    if (!candidates.has(normalized)) {
      candidates.set(normalized, candidate);
    }
  };

  for (const candidate of deriveRawChunkCandidates(baseName)) {
    addCandidate(candidate);
  }

  for (const candidate of tokenizeFileNameFields(fileName, {
    caseSensitive: true,
    separators: options.separators,
  })) {
    addCandidate(candidate);
  }

  return Array.from(candidates.entries())
    .sort((left, right) => left[1].localeCompare(right[1]))
    .map((entry) => entry[0]);
}

export function matchFileNameAgainstPatternTokens(
  fileName: unknown,
  patternTokens: Array<string | null | undefined>,
  options: {
    caseSensitive?: boolean;
    separators?: unknown;
  } = {},
): boolean {
  const caseSensitive = Boolean(options.caseSensitive);
  const normalizedPatterns = patternTokens
    .map((token) => normalizeByCase(String(token ?? "").trim(), caseSensitive))
    .filter(Boolean);

  if (!normalizedPatterns.length) return false;

  const normalizedFields = collectFileNameFieldCandidates(fileName, {
    caseSensitive,
    separators: options.separators,
  });
  const exactFieldSet = new Set(normalizedFields);
  const compactFieldSet = new Set(
    normalizedFields
      .map((field) => normalizeCompactMatchKey(field, true))
      .filter(Boolean),
  );

  return normalizedPatterns.some((token) => {
    if (exactFieldSet.has(token)) return true;

    const compactToken = normalizeCompactMatchKey(token, true);
    if (!compactToken) return false;
    if (compactFieldSet.has(compactToken)) return true;

    return normalizedFields.some((field) => {
      const compactField = normalizeCompactMatchKey(field, true);
      if (!compactField) return false;
      if (compactField === compactToken) return true;
      if (compactField.startsWith(compactToken) && compactToken.length >= 5) {
        return true;
      }
      if (compactToken.startsWith(compactField) && compactField.length >= 5) {
        return true;
      }
      return false;
    });
  });
}

export function matchFileNameAgainstPhrase(
  fileName: unknown,
  phrase: unknown,
  options: {
    caseSensitive?: boolean;
  } = {},
): boolean {
  const caseSensitive = Boolean(options.caseSensitive);
  const normalizedPhrase = normalizeFileNamePhrase(phrase, caseSensitive);
  if (!normalizedPhrase) return false;

  const normalizedBaseName = normalizeByCase(
    stripFileExtension(fileName),
    caseSensitive,
  );

  return normalizedBaseName.includes(normalizedPhrase);
}

export function deriveFileNameFieldSuggestions(
  fileNames: Array<unknown>,
  options: {
    caseSensitive?: boolean;
    maxSamples?: number;
    separators?: unknown;
  } = {},
): FileNameFieldSuggestion[] {
  const caseSensitive = Boolean(options.caseSensitive);
  const maxSamples = Number.isInteger(options.maxSamples)
    ? Math.max(1, Number(options.maxSamples))
    : 2;
  const totalFiles = (Array.isArray(fileNames) ? fileNames : []).filter((fileName) =>
    Boolean(String(fileName ?? "").trim()),
  ).length;
  const suggestions = new Map<
    string,
    Omit<FileNameFieldSuggestion, "score">
  >();

  for (const fileName of Array.isArray(fileNames) ? fileNames : []) {
    const rawName = String(fileName ?? "").trim();
    if (!rawName) continue;

    const rawFields = collectFileNameFieldCandidates(rawName, {
      caseSensitive: true,
      separators: options.separators,
    });
    const seenInFile = new Set<string>();

    for (const rawField of rawFields) {
      if (!shouldSuggestFieldCandidate(rawField)) continue;

      const normalizedValue = normalizeByCase(rawField, caseSensitive);
      if (!normalizedValue || seenInFile.has(normalizedValue)) continue;

      seenInFile.add(normalizedValue);

      const existing = suggestions.get(normalizedValue);
      if (existing) {
        existing.count += 1;
        if (
          existing.sampleFileNames.length < maxSamples &&
          !existing.sampleFileNames.includes(rawName)
        ) {
          existing.sampleFileNames.push(rawName);
        }
        continue;
      }

      suggestions.set(normalizedValue, {
        count: 1,
        normalizedValue,
        sampleFileNames: [rawName],
        value: rawField,
      });
    }
  }

  return Array.from(suggestions.values())
    .map((entry) => ({
      ...entry,
      score: scoreFieldToken(entry.value, entry.count, totalFiles),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.count !== left.count) return right.count - left.count;
      return left.value.localeCompare(right.value);
    });
}
