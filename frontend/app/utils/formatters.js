import i18n from "../i18n";

export const getCurrentLocale = () => {
  const language = i18n.language || "en";

  if (language.startsWith("ps")) return "ps-AF";
  if (language.startsWith("fa") || language.startsWith("prs")) return "fa-AF";

  return "en-US";
};

const toFiniteNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export const formatCurrency = (amount, options = {}) => {
  const numeric = toFiniteNumber(amount);
  const locale = options.locale || getCurrentLocale();

  const formattedAmount = new Intl.NumberFormat(locale, {
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
  }).format(numeric);

  const currencyLabel = i18n.t("common.currency.afg", {
    defaultValue: "AFG",
  });

  return `${formattedAmount} ${currencyLabel}`;
};

export const formatDate = (date, options = {}) => {
  if (!date) return "";

  const parsedDate = date instanceof Date ? date : new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  const locale = options.locale || getCurrentLocale();

  return new Intl.DateTimeFormat(locale, {
    year: options.year || "numeric",
    month: options.month || "short",
    day: options.day || "numeric",
  }).format(parsedDate);
};

export const formatTime = (time, options = {}) => {
  if (!time || typeof time !== "string") return "";

  const trimmed = time.trim();

  const amPmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);
  if (amPmMatch) {
    const hour = Number(amPmMatch[1]);
    const minute = Number(amPmMatch[2]);
    const period = amPmMatch[3].toUpperCase();

    if (hour >= 1 && hour <= 12 && minute >= 0 && minute <= 59) {
      const amLabel = i18n.t("common.time.am", { defaultValue: "AM" });
      const pmLabel = i18n.t("common.time.pm", { defaultValue: "PM" });

      return `${hour}:${String(minute).padStart(2, "0")} ${
        period === "AM" ? amLabel : pmLabel
      }`;
    }

    return time;
  }

  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return time;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return time;
  }

  const use24Hour = options.hour12 === false;

  if (use24Hour) {
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  const periodKey = hour >= 12 ? "pm" : "am";
  const period = i18n.t(`common.time.${periodKey}`, {
    defaultValue: periodKey === "pm" ? "PM" : "AM",
  });

  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
};

const WEEKDAY_KEY_BY_NAME = {
  mon: "mon",
  monday: "monday",
  tue: "tue",
  tues: "tue",
  tuesday: "tuesday",
  wed: "wed",
  wednesday: "wednesday",
  thu: "thu",
  thur: "thu",
  thurs: "thu",
  thursday: "thursday",
  fri: "fri",
  friday: "friday",
  sat: "sat",
  saturday: "saturday",
  sun: "sun",
  sunday: "sunday",
};

const WEEKDAY_KEYS_MONDAY_FIRST_SHORT = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

const LONG_WEEKDAY_BY_SHORT = {
  mon: "monday",
  tue: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  fri: "friday",
  sat: "saturday",
  sun: "sunday",
};

const SHORT_WEEKDAY_BY_LONG = {
  monday: "mon",
  tuesday: "tue",
  wednesday: "wed",
  thursday: "thu",
  friday: "fri",
  saturday: "sat",
  sunday: "sun",
};

export const formatWeekday = (day, options = {}) => {
  if (day === null || day === undefined || day === "") return "";

  const long = options.long === true;
  let key = null;

  if (typeof day === "number") {
    const shortKey = WEEKDAY_KEYS_MONDAY_FIRST_SHORT[day];
    if (shortKey) {
      key = long ? LONG_WEEKDAY_BY_SHORT[shortKey] : shortKey;
    }
  } else {
    const normalized = String(day).trim().toLowerCase();
    key = WEEKDAY_KEY_BY_NAME[normalized] || null;

    if (key && long && key.length === 3) {
      key = LONG_WEEKDAY_BY_SHORT[key];
    }

    if (key && !long && key.length > 3) {
      key = SHORT_WEEKDAY_BY_LONG[key];
    }
  }

  if (!key) return String(day);

  return i18n.t(`common.time.${key}`, {
    defaultValue: String(day),
  });
};

export const formatDuration = (minutes) => {
  const numeric = toFiniteNumber(minutes);

  return `${numeric} ${i18n.t("common.time.minutes", {
    defaultValue: "Minutes",
  })}`;
};

export const formatPercent = (value, options = {}) => {
  const numeric = toFiniteNumber(value);
  const locale = options.locale || getCurrentLocale();

  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
  }).format(numeric);

  return `${formatted}%`;
};

export default {
  getCurrentLocale,
  formatCurrency,
  formatDate,
  formatTime,
  formatWeekday,
  formatDuration,
  formatPercent,
};
