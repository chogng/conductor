export const getExcelColumnLabel = (index: number): string => {
  let label = "";
  let i = index;

  while (i >= 0) {
    label = String.fromCharCode(65 + (i % 26)) + label;
    i = Math.floor(i / 26) - 1;
  }

  return label;
};
