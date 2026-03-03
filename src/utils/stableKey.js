export const fnv1a32 = (input) => {
  const str = String(input ?? "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export const stableItemKey = (prefix, raw) => {
  const normalizedPrefix = String(prefix ?? "").trim();
  const normalizedRaw = String(raw ?? "");
  if (!normalizedPrefix || !normalizedRaw) return "";
  return `${normalizedPrefix}-${fnv1a32(normalizedRaw)}`;
};

