import { I18nManager } from "react-native";
import i18n from "../i18n";

export const RTL_LANGUAGES = ["ps", "fa"];

export const normalizeLanguageCode = (language) => {
  const normalized = String(language || "en").toLowerCase();

  if (normalized.startsWith("ps")) return "ps";
  if (normalized.startsWith("fa") || normalized.startsWith("prs")) return "fa";

  return "en";
};

export const isLanguageRTL = (language) => {
  const normalized = normalizeLanguageCode(language);
  return RTL_LANGUAGES.includes(normalized);
};

export const getCurrentLanguage = () =>
  normalizeLanguageCode(i18n.resolvedLanguage || i18n.language || "en");

export const getRequiredNativeRTL = (language = getCurrentLanguage()) =>
  isLanguageRTL(language);

export const isRTL = (language = getCurrentLanguage()) =>
  isLanguageRTL(language);

export const getTextAlign = () => (isRTL() ? "right" : "left");

export const getFlexDirection = (reverse = false) => {
  if (reverse) {
    return isRTL() ? "row" : "row-reverse";
  }

  return isRTL() ? "row-reverse" : "row";
};

export const getWritingDirection = () => (isRTL() ? "rtl" : "ltr");

export const getStartMargin = (value) =>
  isRTL() ? { marginRight: value } : { marginLeft: value };

export const getEndMargin = (value) =>
  isRTL() ? { marginLeft: value } : { marginRight: value };

export const getStartPadding = (value) =>
  isRTL() ? { paddingRight: value } : { paddingLeft: value };

export const getEndPadding = (value) =>
  isRTL() ? { paddingLeft: value } : { paddingRight: value };

export const isNativeRTLMatchingLanguage = (language) => {
  return I18nManager.isRTL === getRequiredNativeRTL(language);
};

export const syncNativeRTL = (language) => {
  const shouldBeRTL = getRequiredNativeRTL(language);

  // Layout direction is managed in JS from the active app language so
  // switching between LTR and RTL does not require a native app restart.
  I18nManager.allowRTL(true);
  I18nManager.swapLeftAndRightInRTL(false);

  return {
    shouldBeRTL,
    requiresRestart: false,
  };
};

export const getStartPosition = (value) =>
  isRTL() ? { right: value } : { left: value };

export const getEndPosition = (value) =>
  isRTL() ? { left: value } : { right: value };

export default {
  RTL_LANGUAGES,
  normalizeLanguageCode,
  isLanguageRTL,
  isRTL,
  getCurrentLanguage,
  getRequiredNativeRTL,
  isNativeRTLMatchingLanguage,
  syncNativeRTL,
  getTextAlign,
  getWritingDirection,
  getFlexDirection,
  getStartMargin,
  getEndMargin,
  getStartPadding,
  getEndPadding,
  getStartPosition,
  getEndPosition,
};
