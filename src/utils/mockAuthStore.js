const STORAGE_KEY = "appointer:mockUser";
const LOGGED_OUT_KEY = "appointer:mockLoggedOut";

const canUseStorage = () =>
  typeof window !== "undefined" &&
  typeof window.localStorage !== "undefined" &&
  window.localStorage !== null;

const readStoredUser = () => {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    return parsed;
  } catch {
    return null;
  }
};

let currentMockUser = readStoredUser();

export const getMockUser = () => currentMockUser;

export const setMockUser = (user) => {
  currentMockUser = user ?? null;

  if (!canUseStorage()) return;
  try {
    if (currentMockUser) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(currentMockUser));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    window.localStorage.removeItem(LOGGED_OUT_KEY);
  } catch {
    // ignore storage errors
  }
};

export const clearMockUser = () => {
  currentMockUser = null;

  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.setItem(LOGGED_OUT_KEY, "1");
  } catch {
    // ignore storage errors
  }
};

export const isMockLoggedOut = () => {
  if (!canUseStorage()) return false;

  try {
    return window.localStorage.getItem(LOGGED_OUT_KEY) === "1";
  } catch {
    return false;
  }
};
