export const NativeWindowCommand = {
  toggleDevTools: "toggleDevTools",
  reloadWindow: "reloadWindow",
  closeWindow: "closeWindow",
  minimizeWindow: "minimizeWindow",
  maximizeWindow: "maximizeWindow",
  unmaximizeWindow: "unmaximizeWindow",
} as const;

export type NativeWindowCommandId =
  (typeof NativeWindowCommand)[keyof typeof NativeWindowCommand];

const nativeWindowCommandValues = new Set<string>(Object.values(NativeWindowCommand));

export function isNativeWindowCommand(value: unknown): value is NativeWindowCommandId {
  return typeof value === "string" && nativeWindowCommandValues.has(value);
}
