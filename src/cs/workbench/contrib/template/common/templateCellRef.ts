const CELL_REF_RE = /^([A-Z]+)([1-9]\d*)$/i;

export type TemplateCellRef = {
  colIndex: number;
  rowIndex: number;
};

export const toColumnLabel = (colIndex: number): string => {
  let value = Math.max(0, Math.floor(Number(colIndex) || 0)) + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
};

export const toCellLabel = (rowIndex: number, colIndex: number): string =>
  `${toColumnLabel(colIndex)}${Math.max(0, Math.floor(Number(rowIndex) || 0)) + 1}`;

export const parseCellLabel = (value: unknown): TemplateCellRef | null => {
  const text = String(value ?? "").trim().toUpperCase();
  if (!text) {
    return null;
  }

  const match = text.match(CELL_REF_RE);
  if (!match) {
    return null;
  }

  const rowNumber = Number(match[2]);
  if (!Number.isInteger(rowNumber) || rowNumber <= 0) {
    return null;
  }

  let colIndex = 0;
  for (const char of match[1]) {
    colIndex = colIndex * 26 + (char.charCodeAt(0) - 64);
  }

  return {
    colIndex: colIndex - 1,
    rowIndex: rowNumber - 1,
  };
};

export const isCellLabel = (value: unknown): boolean => Boolean(parseCellLabel(value));
