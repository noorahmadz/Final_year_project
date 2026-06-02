import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";

import en from "./locales/en.json";
import ps from "./locales/ps.json";
import fa from "./locales/fa.json";

const resources = {
  en: { translation: en },
  ps: { translation: ps },
  fa: { translation: fa },
};

const getInitialLanguage = () => {
  const locale =
    Localization.getLocales?.()?.[0]?.languageTag ||
    Localization.getLocales?.()?.[0]?.languageCode ||
    "en";

  if (locale.startsWith("ps")) return "ps";
  if (locale.startsWith("fa") || locale.startsWith("prs")) return "fa";

  return "en";
};

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: getInitialLanguage(),
    fallbackLng: "en",
    compatibilityJSON: "v3",
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  });
}

export default i18n;
