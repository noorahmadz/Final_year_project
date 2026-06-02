import i18n from "../i18n";

const MONTHS = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

const pad = (value) => String(value).padStart(2, "0");

const isValidDate = (value) =>
  value instanceof Date && !Number.isNaN(value.getTime());

const normalizeLanguageCode = (languageCode) => {
  const locale = String(languageCode || "").toLowerCase();

  if (locale.startsWith("ps")) {
    return "ps";
  }

  if (locale.startsWith("fa") || locale.startsWith("prs")) {
    return "fa";
  }

  return "en";
};

const getDisplayLocale = () => {
  switch (normalizeLanguageCode(i18n.resolvedLanguage || i18n.language)) {
    case "ps":
      return "ps-AF";
    case "fa":
      return "fa-AF";
    default:
      return "en-US";
  }
};

export const formatDateForBackend = (value) => {
  if (!value) {
    return "";
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }

  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }

  const parsedDate = parseDisplayDate(value);
  return parsedDate || "";
};

export const parseDisplayDate = (displayDate) => {
  if (!displayDate || typeof displayDate !== "string") {
    return "";
  }

  const trimmed = displayDate.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!match) {
    const fallbackDate = new Date(trimmed);
    return isValidDate(fallbackDate) ? formatDateForBackend(fallbackDate) : "";
  }

  const [, dayValue, monthValue, yearValue] = match;
  const monthIndex = MONTHS[monthValue.toLowerCase()];
  if (monthIndex === undefined) {
    return "";
  }

  return `${yearValue}-${pad(monthIndex + 1)}-${pad(Number(dayValue))}`;
};

const toDisplayTime = (timeValue) => {
  if (!timeValue || typeof timeValue !== "string") {
    return "";
  }

  const [hoursValue, minutesValue] = timeValue.split(":");
  const hours = Number(hoursValue);
  const minutes = Number(minutesValue);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return timeValue;
  }

  const suffix =
    hours >= 12
      ? i18n.t("common.time.pm", { defaultValue: "PM" })
      : i18n.t("common.time.am", { defaultValue: "AM" });
  const normalizedHours = hours % 12 || 12;
  return `${normalizedHours}:${pad(minutes)} ${suffix}`;
};

const toDurationMinutes = ({ startTime, endTime }) => {
  if (!startTime || !endTime) {
    return "";
  }

  const parseTime = (value) => {
    if (typeof value !== "string") {
      return Number.NaN;
    }

    const [hoursValue, minutesValue] = value.split(":");
    const hours = Number(hoursValue);
    const minutes = Number(minutesValue);

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return Number.NaN;
    }

    return hours * 60 + minutes;
  };

  const startMinutes = parseTime(startTime);
  const endMinutes = parseTime(endTime);

  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) {
    return "";
  }

  return endMinutes - startMinutes;
};

const parseDisplayTime = (displayTime) => {
  if (!displayTime || typeof displayTime !== "string") {
    return "";
  }

  const normalizedDisplayTime = displayTime.trim();
  const localizedAm = i18n.t("common.time.am", { defaultValue: "AM" });
  const localizedPm = i18n.t("common.time.pm", { defaultValue: "PM" });
  const match = normalizedDisplayTime.match(/^(\d{1,2}):(\d{2})\s*(.+)$/i);
  if (!match) {
    return "";
  }

  const [, hoursValue, minutesValue, suffixValue] = match;
  let hours = Number(hoursValue);
  const minutes = Number(minutesValue);
  const suffixToken = suffixValue.trim().toLowerCase();
  const isAm =
    suffixToken === "am" || suffixToken === localizedAm.trim().toLowerCase();
  const isPm =
    suffixToken === "pm" || suffixToken === localizedPm.trim().toLowerCase();

  if (!isAm && !isPm) {
    return "";
  }

  if (isAm && hours === 12) {
    hours = 0;
  } else if (isPm && hours !== 12) {
    hours += 12;
  }

  return `${pad(hours)}:${pad(minutes)}:00`;
};

export const parseTimeRange = (timeRange) => {
  if (!timeRange || typeof timeRange !== "string") {
    return {
      start_time: "",
      end_time: "",
    };
  }

  const [startDisplay, endDisplay] = timeRange.split("-").map((item) => item.trim());

  return {
    start_time: parseDisplayTime(startDisplay),
    end_time: parseDisplayTime(endDisplay),
  };
};

export const mapAvailabilitySlot = (slot) => {
  const startTime = slot?.start || "";
  const endTime = slot?.end || "";
  const displayStart = toDisplayTime(startTime);
  const displayEnd = toDisplayTime(endTime);

  return {
    start_time: startTime,
    end_time: endTime,
    displayStart,
    displayEnd,
    displayRange:
      displayStart && displayEnd ? `${displayStart} - ${displayEnd}` : "",
  };
};

export const mapBookingResponse = (booking) => ({
  booking_id: booking?.booking_id,
  status: booking?.status || "",
  display_status: booking?.display_status || "",
  lifecycle_state: booking?.lifecycle_state || "",
  can_pay: Boolean(booking?.can_pay),
  can_cancel: Boolean(booking?.can_cancel),
  next_actions: Array.isArray(booking?.next_actions) ? booking.next_actions : [],
  payment_summary: booking?.payment_summary || null,
  booking_date: booking?.booking_date || "",
  start_time: booking?.start_time || "",
  end_time: booking?.end_time || "",
  total_price: booking?.total_price || null,
  field: booking?.field ?? null,
  field_name: booking?.field_name || "",
  gym_name: booking?.gym_name || "",
});

export const adaptOwnerBooking = (item = {}) => {
  const startTime = item.start_time || item.startTime || "";
  const endTime = item.end_time || item.endTime || "";

  return {
    id: item.id || item.booking_id,
    customerName:
      item.customer_name ||
      item.user_name ||
      item.customer?.name ||
      item.user?.name ||
      item.customer?.full_name ||
      item.user?.full_name ||
      "Customer",
    customerEmail:
      item.customer_email ||
      item.customer?.email ||
      item.user?.email ||
      "",
    customerPhone:
      item.customer_phone ||
      item.customer?.phone ||
      item.user?.phone ||
      "",
    gymName: item.gym_name || item.gym?.name || "",
    courtName:
      item.field_name ||
      item.court_name ||
      item.field?.name ||
      item.field?.field_name ||
      item.court?.name ||
      "",
    bookingDate: item.booking_date || item.date || item.start_date || "",
    startTime,
    endTime,
    duration:
      item.duration ||
      item.duration_minutes ||
      toDurationMinutes({ startTime, endTime }),
    totalAmount: Number(item.total_price || item.total_amount || item.amount || 0),
    paymentStatus:
      item.payment_status ||
      item.payment?.status ||
      item.payment_summary?.status ||
      item.paymentStatus ||
      "unknown",
    bookingStatus:
      item.status ||
      item.booking_status ||
      item.lifecycle_state ||
      "unknown",
    displayStatus: item.display_status || item.displayStatus || "",
    paidAt: item.paid_at || item.payment_summary?.paid_at || item.payment?.paid_at || "",
    createdAt: item.created_at || item.createdAt || "",
  };
};

export const formatBackendDateForDisplay = (backendDate) => {
  const normalized = formatDateForBackend(backendDate);
  if (!normalized) {
    return "";
  }

  const [yearValue, monthValue, dayValue] = normalized.split("-");
  const date = new Date(Number(yearValue), Number(monthValue) - 1, Number(dayValue));
  if (!isValidDate(date)) {
    return normalized;
  }

  try {
    return date.toLocaleDateString(getDisplayLocale(), {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return date.toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
};

export const formatBackendTimeRangeForDisplay = ({ start_time, end_time }) => {
  const displayStart = toDisplayTime(start_time);
  const displayEnd = toDisplayTime(end_time);

  if (!displayStart || !displayEnd) {
    return "";
  }

  return `${displayStart} - ${displayEnd}`;
};
