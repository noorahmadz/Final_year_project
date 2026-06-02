import i18n from "../i18n";

const STATUS_TRANSLATION_KEYS = {
  pending: "booking.status.pending",
  confirmed: "booking.status.confirmed",
  completed: "booking.status.completed",
  cancelled: "booking.status.cancelled",
  canceled: "booking.status.canceled",
  expired: "booking.status.expired",
  paid: "payment.status.paid",
  success: "payment.status.success",
  failed: "payment.status.failed",
  refunded: "payment.status.refunded",
  unpaid: "payment.status.unpaid",
  pending_payment: "booking.status.pendingPayment",
  upcoming: "tournaments.status.upcoming",
  ongoing: "tournaments.status.ongoing",
  in_progress: "tournaments.status.inProgress",
  finished: "tournaments.status.finished",
  registration_open: "tournaments.status.registrationOpen",
};

const STATUS_DEFAULT_LABELS = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  canceled: "Cancelled",
  expired: "Expired",
  paid: "Paid",
  success: "Paid",
  failed: "Failed",
  refunded: "Refunded",
  unpaid: "Unpaid",
  pending_payment: "Pending payment",
  upcoming: "Upcoming",
  ongoing: "In Progress",
  in_progress: "In Progress",
  finished: "Completed",
  registration_open: "Registration Open",
};

const normalizeStatus = (value) => String(value || "").trim().toLowerCase();

export const getStatusLabel = (status, fallbackLabel = "") => {
  const normalizedStatus = normalizeStatus(status);
  const translationKey = STATUS_TRANSLATION_KEYS[normalizedStatus];

  if (translationKey) {
    return i18n.t(translationKey, {
      defaultValue: STATUS_DEFAULT_LABELS[normalizedStatus],
    });
  }

  if (fallbackLabel && typeof fallbackLabel === "string" && fallbackLabel.trim()) {
    return fallbackLabel.trim();
  }

  if (!normalizedStatus) {
    return i18n.t("common.status.unknown", { defaultValue: "Unknown" });
  }

  return normalizedStatus
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

export default getStatusLabel;
