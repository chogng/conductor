const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const formatNumber = (
  value: unknown,
  { digits = 4 }: { digits?: number } = {},
): string => {
  if (!isFiniteNumber(value)) return "-";

  const abs = Math.abs(value);
  if (abs === 0) return "0";

  const trimZeros = (text: string) =>
    text.includes(".") ? text.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") : text;

  if (abs >= 1e4 || abs < 1e-3) {
    return value.toExponential(2);
  }

  if (abs < 1) {
    const magnitude = Math.floor(Math.log10(abs));
    const decimals = Math.min(20, Math.max(0, -magnitude + (digits + 2)));
    return trimZeros(value.toFixed(decimals));
  }

  return trimZeros(value.toFixed(digits));
};
