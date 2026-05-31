import { languageService } from "src/cs/platform/language/browser/languageService";

export const getLanguageState = () => languageService.getSnapshot();

export const onDidChangeLanguageState = languageService.subscribe;

export const useLanguage = getLanguageState;
