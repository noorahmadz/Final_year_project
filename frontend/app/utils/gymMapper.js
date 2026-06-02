import { API_CONFIG } from "../api/client";
import i18n from "../i18n";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_TRANSLATION_KEYS = {
  Mon: "common.time.mon",
  Tue: "common.time.tue",
  Wed: "common.time.wed",
  Thu: "common.time.thu",
  Fri: "common.time.fri",
  Sat: "common.time.sat",
  Sun: "common.time.sun",
};

export const getLocalizedDayLabel = (dayName) =>
  i18n.t(DAY_TRANSLATION_KEYS[dayName], { defaultValue: dayName });

export const getLocalizedDayLabels = () => DAY_NAMES.map(getLocalizedDayLabel);

const getApiOrigin = () => {
  try {
    return new URL(API_CONFIG.baseURL).origin;
  } catch {
    return "";
  }
};

const ABSOLUTE_URI_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

export const normalizeImageUrl = (imageUrl) => {
  if (!imageUrl || typeof imageUrl !== "string") {
    return null;
  }

  const normalizedValue = imageUrl.trim();
  if (!normalizedValue) {
    return null;
  }

  if (ABSOLUTE_URI_PATTERN.test(normalizedValue)) {
    return normalizedValue;
  }

  const origin = getApiOrigin();
  if (!origin) {
    return normalizedValue;
  }

  return normalizedValue.startsWith("/")
    ? `${origin}${normalizedValue}`
    : `${origin}/${normalizedValue}`;
};

const resolveGymImage = (gym) => {
  const directImage = normalizeImageUrl(
    gym?.image_url ?? gym?.image ?? gym?.imageUrl ?? gym?.logo,
  );
  if (directImage) {
    return directImage;
  }

  const imageEntries = Array.isArray(gym?.images)
    ? gym.images
    : Array.isArray(gym?.gym_images)
      ? gym.gym_images
      : [];

  for (const image of imageEntries) {
    const resolvedImage = normalizeImageUrl(
      image?.image_url ?? image?.image ?? image?.imageUrl ?? image?.url,
    );
    if (resolvedImage) {
      return resolvedImage;
    }
  }

  return null;
};

export const deriveMinimumPricePerHour = (fields = []) => {
  const prices = fields
    .map((field) => Number(field?.price_per_hour))
    .filter((price) => Number.isFinite(price) && price > 0);

  if (prices.length === 0) {
    return null;
  }

  return Math.min(...prices);
};

export const formatStartingPrice = (pricePerHour) => {
  if (!Number.isFinite(pricePerHour) || pricePerHour <= 0) {
    return i18n.t("gyms.pricing.startingFromUnknown", {
      defaultValue: "Starting from -",
    });
  }

  return i18n.t("gyms.pricing.startingFromPerHour", {
    amount: Math.round(pricePerHour),
    currency: i18n.t("common.currency.afg", { defaultValue: "AFG" }),
    defaultValue: `Starting from ${Math.round(pricePerHour)} AFG / hour`,
  });
};

export const mapDiscountToUi = (discount) => ({
  id: discount?.discount_id,
  discountId: discount?.discount_id,
  type: "percentage",
  value: Number(discount?.percentage) || 0,
  description: discount?.title || "",
  title: discount?.title || "",
  code: discount?.code || null,
  validFrom: discount?.start_date || null,
  validTo: discount?.end_date || null,
  isActive: Boolean(discount?.is_active),
  courts: [],
});

export const getDiscountPercent = (discount) => {
  const percent = Number(
    discount?.percentage ??
      discount?.discount_percentage ??
      discount?.percent ??
      discount?.value ??
      0,
  );

  return Number.isFinite(percent) && percent > 0 && percent <= 100 ? percent : 0;
};

export const getActiveDiscount = (gym) => {
  const discounts = Array.isArray(gym?.discounts) ? gym.discounts : [];

  return (
    discounts.find((discount) => {
      const isActive = discount?.is_active ?? discount?.isActive ?? true;
      return Boolean(isActive) && getDiscountPercent(discount) > 0;
    }) || null
  );
};

export const mapReviewToUi = (review) => ({
  id: review?.review_id,
  reviewId: review?.review_id,
  userName: review?.user_name || "Anonymous",
  rating: Number(review?.rating) || 0,
  comment: review?.comment || "",
  createdAt: review?.created_at || null,
});

export const mapFieldToUiCourt = (field) => {
  const pricePerHour = Number(field?.price_per_hour) || 0;

  return {
    id: field?.field_id,
    fieldId: field?.field_id,
    name: field?.field_name || "Court",
    fieldType: field?.field_type || "futsal",
    capacity: field?.capacity ?? null,
    pricePerHour,
    price30min: pricePerHour > 0 ? Math.round(pricePerHour / 2) : 0,
    price60min: pricePerHour > 0 ? Math.round(pricePerHour) : 0,
    price90min: pricePerHour > 0 ? Math.round(pricePerHour * 1.5) : 0,
    priceIntervals: null,
    isAvailable: Boolean(field?.is_available),
  };
};

const formatTimeTo12Hour = (timeValue) => {
  if (!timeValue || typeof timeValue !== "string") {
    return null;
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
  return `${normalizedHours}:${String(minutes).padStart(2, "0")} ${suffix}`;
};

export const buildTimingFromSlots = (slots = []) => {
  const timing = {};

  slots.forEach((slot) => {
    const dayIndex = Number(slot?.day_of_week);
    const dayName = DAY_NAMES[dayIndex];

    if (!dayName) {
      return;
    }

    const open = formatTimeTo12Hour(slot?.start_time);
    const close = formatTimeTo12Hour(slot?.end_time);

    if (!open || !close) {
      return;
    }

    const currentDay = timing[dayName];
    if (!currentDay) {
      timing[dayName] = {
        open,
        close,
        _open24: slot.start_time,
        _close24: slot.end_time,
      };
      return;
    }

    const openValue = slot.start_time;
    const closeValue = slot.end_time;
    if (openValue < currentDay._open24) {
      currentDay.open = open;
      currentDay._open24 = openValue;
    }
    if (closeValue > currentDay._close24) {
      currentDay.close = close;
      currentDay._close24 = closeValue;
    }
  });

  Object.values(timing).forEach((value) => {
    delete value._open24;
    delete value._close24;
  });

  return timing;
};

export const mapGymToUi = (gym, options = {}) => {
  const fields = options.fields || [];
  const reviews = options.reviews || [];
  const discounts =
    Array.isArray(options.discounts) && options.discounts.length > 0
      ? options.discounts
      : gym?.discounts ?? [];
  const slots = options.slots || [];
  const minimumPricePerHour = deriveMinimumPricePerHour(fields);

  return {
    id: gym?.gym_id,
    gymId: gym?.gym_id,
    name: gym?.name || "Gym",
    address: gym?.address || "",
    city: gym?.city || "",
    phone: gym?.phone || "",
    description: gym?.description || "",
    image: resolveGymImage(gym),
    images: (gym?.images || []).map((image) => ({
      id: image?.image_id,
      imageId: image?.image_id,
      imageUrl: normalizeImageUrl(
        image?.image_url ?? image?.image ?? image?.imageUrl ?? image?.url,
      ),
      uploadedAt: image?.uploaded_at || null,
    })),
    rating:
      gym?.average_rating === null || gym?.average_rating === undefined
        ? 0
        : Number(gym.average_rating),
    averageRating:
      gym?.average_rating === null || gym?.average_rating === undefined
        ? null
        : Number(gym.average_rating),
    courtsCount:
      gym?.fields_count ?? (Array.isArray(fields) ? fields.length : 0),
    fieldsCount:
      gym?.fields_count ?? (Array.isArray(fields) ? fields.length : 0),
    courts: fields.map(mapFieldToUiCourt),
    fields: fields,
    reviews: reviews.map(mapReviewToUi),
    discounts: discounts.map(mapDiscountToUi),
    slots,
    timing: buildTimingFromSlots(slots),
    status: gym?.status || null,
    ownerName: gym?.owner_name || null,
    approvalExpiresAt: gym?.approval_expires_at || null,
    createdAt: gym?.created_at || null,
    isBookable: gym?.is_bookable ?? false,
    canReview: gym?.can_review ?? false,
    minimumPricePerHour,
    startingPriceLabel: formatStartingPrice(minimumPricePerHour),
  };
};

export const mapGymListResponse = (payload) => {
  const results = Array.isArray(payload?.results) ? payload.results : [];

  return {
    count: payload?.count ?? results.length,
    next: payload?.next ?? null,
    previous: payload?.previous ?? null,
    results: results.map((gym) => mapGymToUi(gym)),
  };
};
