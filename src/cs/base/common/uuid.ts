const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUUID(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export const generateUuid = ((): (() => string) => {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID.bind(crypto);
  }

  const data = new Uint8Array(16);
  const hex: string[] = [];
  for (let index = 0; index < 256; index += 1) {
    hex.push(index.toString(16).padStart(2, "0"));
  }

  return function generateUuid(): string {
    crypto.getRandomValues(data);

    data[6] = (data[6] & 0x0f) | 0x40;
    data[8] = (data[8] & 0x3f) | 0x80;

    let index = 0;
    return [
      hex[data[index++]],
      hex[data[index++]],
      hex[data[index++]],
      hex[data[index++]],
      "-",
      hex[data[index++]],
      hex[data[index++]],
      "-",
      hex[data[index++]],
      hex[data[index++]],
      "-",
      hex[data[index++]],
      hex[data[index++]],
      "-",
      hex[data[index++]],
      hex[data[index++]],
      hex[data[index++]],
      hex[data[index++]],
      hex[data[index++]],
      hex[data[index++]],
    ].join("");
  };
})();
