import { useContext } from "react";
import { LanguageContext } from "../context/language-context";

export const useLanguage = () => useContext(LanguageContext);
