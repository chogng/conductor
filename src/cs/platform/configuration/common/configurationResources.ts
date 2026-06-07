import { URI } from "src/cs/base/common/uri";

export const USER_CONFIGURATION_DIRECTORY = "User";
export const USER_SETTINGS_FILE = "settings.json";

export function getUserSettingsResource(userDataPath: string): URI {
  const normalizedPath = String(userDataPath ?? "").trim();
  if (!normalizedPath) {
    throw new Error("Cannot resolve user settings without a user data path.");
  }

  return URI.joinPath(
    URI.file(normalizedPath),
    USER_CONFIGURATION_DIRECTORY,
    USER_SETTINGS_FILE,
  );
}
