import { useEffect, useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getAvailability } from "../api/bookingsApi";
import { getGymSlots } from "../api/gymsApi";
import { mapErrorToMessage } from "../utils/errorMapper";
import { mapAvailabilitySlot } from "../utils/bookingMapper";
import {
  getFlexDirection,
  getTextAlign,
  getWritingDirection,
} from "../utils/rtl";

const PRIMARY_COLOR = "#24a731";
const PRIMARY_BORDER = "#BFE7C5";

const toMinutes = (timeValue) => {
  if (!timeValue || typeof timeValue !== "string") {
    return null;
  }

  const [hoursValue, minutesValue] = timeValue.split(":");
  const hours = Number(hoursValue);
  const minutes = Number(minutesValue);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
};

const getSlotKey = (slot) => {
  const startTime = slot?.start_time || slot?.start || "";
  const endTime = slot?.end_time || slot?.end || "";

  return startTime && endTime ? `${startTime}-${endTime}` : "";
};

const getDayOfWeekFromDate = (dateValue) => {
  if (!dateValue || typeof dateValue !== "string") {
    return null;
  }

  const [yearValue, monthValue, dayValue] = dateValue.split("-");
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return (parsedDate.getUTCDay() + 6) % 7;
};

const normalizeApiSlot = (slot, basePrice, options = {}) => {
  const mapped = mapAvailabilitySlot(slot);

  return {
    ...mapped,
    label: mapped.displayRange,
    price: basePrice,
    isAvailable: options.isAvailable ?? true,
    isBooked: options.isBooked ?? false,
  };
};

const normalizeAvailableSlots = (payload, basePrice) => {
  const rawSlots = Array.isArray(payload?.available_slots)
    ? payload.available_slots
    : Array.isArray(payload?.data?.available_slots)
      ? payload.data.available_slots
      : Array.isArray(payload?.results)
        ? payload.results
        : [];

  const normalized = rawSlots
    .map((slot) => {
      if (slot?.start_time && slot?.end_time) {
        return normalizeApiSlot(
          { start: slot.start_time, end: slot.end_time },
          basePrice,
        );
      }

      if (slot?.start && slot?.end) {
        return normalizeApiSlot(slot, basePrice);
      }

      return null;
    })
    .filter(Boolean);

  if (normalized.length === 0) {
    return [];
  }

  return sortSlotsAscending(normalized);
};

const normalizeConfiguredSlots = (payload, basePrice, dayOfWeek) => {
  const rawSlots = Array.isArray(payload?.results)
    ? payload.results
    : Array.isArray(payload?.data?.results)
      ? payload.data.results
      : [];

  const normalized = rawSlots
    .filter((slot) => {
      if (slot?.is_available === false) {
        return false;
      }

      if (dayOfWeek === null || dayOfWeek === undefined) {
        return true;
      }

      return Number(slot?.day_of_week) === dayOfWeek;
    })
    .map((slot) => {
      if (slot?.start_time && slot?.end_time) {
        return normalizeApiSlot(
          { start: slot.start_time, end: slot.end_time },
          basePrice,
        );
      }

      return null;
    })
    .filter(Boolean);

  if (normalized.length === 0) {
    return [];
  }

  return sortSlotsAscending(normalized);
};

const mergeConfiguredAndAvailableSlots = ({ configuredSlots, availableSlots }) => {
  if (configuredSlots.length === 0) {
    return availableSlots;
  }

  const availableSlotKeys = new Set(
    availableSlots.map((slot) => getSlotKey(slot)).filter(Boolean),
  );
  const mergedSlots = new Map();

  configuredSlots.forEach((slot) => {
    const slotKey = getSlotKey(slot);
    if (!slotKey) {
      return;
    }

    mergedSlots.set(slotKey, {
      ...slot,
      isAvailable: availableSlotKeys.has(slotKey),
      isBooked: !availableSlotKeys.has(slotKey),
    });
  });

  availableSlots.forEach((slot) => {
    const slotKey = getSlotKey(slot);
    if (!slotKey) {
      return;
    }

    const existingSlot = mergedSlots.get(slotKey);
    if (existingSlot) {
      mergedSlots.set(slotKey, {
        ...existingSlot,
        ...slot,
        isAvailable: true,
        isBooked: false,
      });
      return;
    }

    mergedSlots.set(slotKey, {
      ...slot,
      isAvailable: true,
      isBooked: false,
    });
  });

  return sortSlotsAscending(Array.from(mergedSlots.values()));
};

const sortSlotsAscending = (slots) =>
  [...slots].sort((left, right) => {
    const leftStart = toMinutes(left?.start_time);
    const rightStart = toMinutes(right?.start_time);

    if (leftStart !== rightStart) {
      return (leftStart ?? Number.MAX_SAFE_INTEGER) - (rightStart ?? Number.MAX_SAFE_INTEGER);
    }

    const leftEnd = toMinutes(left?.end_time);
    const rightEnd = toMinutes(right?.end_time);
    return (leftEnd ?? Number.MAX_SAFE_INTEGER) - (rightEnd ?? Number.MAX_SAFE_INTEGER);
  });

const Time = ({ route, navigation }) => {
  const { t } = useTranslation();
  const {
    court,
    duration,
    fieldId,
    selectedDate,
    displayDate,
    price,
    originalPrice,
    discountPercent = 0,
    discountAmount = 0,
    totalPrice,
    gymId,
    discountCode,
  } = route.params || {};

  const [selectedTime, setSelectedTime] = useState(null);
  const [availabilitySlots, setAvailabilitySlots] = useState([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");

  const baseOriginalPrice = Number(originalPrice ?? price ?? 0);
  const baseTotalPrice = Number(totalPrice ?? price ?? 0);
  const selectedDayOfWeek = getDayOfWeekFromDate(selectedDate);
  const localizedTextStyle = {
    textAlign: getTextAlign(),
    writingDirection: getWritingDirection(),
  };

  useLayoutEffect(() => {
    navigation?.setOptions({
      title: t("booking.time.selectTime"),
      headerTitleAlign: "center",
    });
  }, [navigation, t]);

  const getPriceInfo = () => {
    if (!selectedTime) return null;

    return {
      originalPrice: baseOriginalPrice,
      discountPercent,
      discountAmount,
      totalPrice: baseTotalPrice,
    };
  };

  const priceInfo = getPriceInfo();

  useEffect(() => {
    let isMounted = true;

    const loadAvailability = async () => {
      if (!fieldId || !selectedDate) {
        setAvailabilitySlots([]);
        setAvailabilityError("");
        return;
      }

      setLoadingAvailability(true);
      setAvailabilityError("");

      try {
        const [availabilityResult, configuredSlotsResult] = await Promise.allSettled([
          getAvailability({
            fieldId,
            date: selectedDate,
          }),
          gymId
            ? getGymSlots(gymId, {
                field_id: fieldId,
              })
            : Promise.resolve(null),
        ]);

        if (availabilityResult.status !== "fulfilled") {
          throw availabilityResult.reason;
        }

        if (!isMounted) {
          return;
        }

        if (configuredSlotsResult.status === "rejected") {
          console.warn("Time screen configured slots load failed", configuredSlotsResult.reason);
        }

        const availableSlots = normalizeAvailableSlots(
          availabilityResult.value,
          baseTotalPrice,
        );
        const configuredSlots =
          configuredSlotsResult.status === "fulfilled"
            ? normalizeConfiguredSlots(
                configuredSlotsResult.value,
                baseTotalPrice,
                selectedDayOfWeek,
              )
            : [];
        const slots = mergeConfiguredAndAvailableSlots({
          configuredSlots,
          availableSlots,
        });
        setAvailabilitySlots(slots);
        setSelectedTime((currentValue) => {
          if (!currentValue) {
            return null;
          }

          return (
            slots.find(
              (slot) =>
                slot.start_time === currentValue.start_time &&
                slot.end_time === currentValue.end_time &&
                !slot.isBooked,
            ) || null
          );
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const mapped = mapErrorToMessage(error);
        setAvailabilityError(mapped.message);
        setAvailabilitySlots([]);
      } finally {
        if (isMounted) {
          setLoadingAvailability(false);
        }
      }
    };

    loadAvailability();

    return () => {
      isMounted = false;
    };
  }, [baseTotalPrice, fieldId, gymId, selectedDate, selectedDayOfWeek]);

  const handleConfirm = () => {
    if (!selectedTime) return;

    const nextPrice = priceInfo ? priceInfo.totalPrice : baseTotalPrice;
    const nextOriginalPrice = priceInfo ? priceInfo.originalPrice : baseOriginalPrice;
    const nextDiscount = priceInfo ? priceInfo.discountPercent : 0;
    const nextDiscountAmount = priceInfo ? priceInfo.discountAmount : discountAmount;

    navigation?.navigate("BookingForm", {
      gymId,
      fieldId,
      court,
      duration,
      bookingDate: selectedDate,
      displayDate,
      selectedDate,
      selectedSlot: selectedTime.displayRange,
      time: selectedTime.displayRange,
      start_time: selectedTime.start_time,
      end_time: selectedTime.end_time,
      price: nextPrice,
      totalPrice: nextPrice,
      originalPrice: nextOriginalPrice,
      discountPercent: nextDiscount,
      discountAmount: nextDiscountAmount,
      discountCode: discountCode || "",
    });
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.header, localizedTextStyle]}>
        {t("booking.time.selectTime")} • {duration} {t("booking.form.minutes")}
      </Text>
      <Text style={[styles.dateText, localizedTextStyle]}>
        {displayDate || t("booking.time.selectDateFirst")}
      </Text>

      <Text style={[styles.selectText, localizedTextStyle]}>
        {t("booking.time.availableTimeSlots")}
      </Text>

      {!fieldId || !selectedDate ? (
        <View style={styles.stateContainer}>
          <Text style={[styles.stateText, localizedTextStyle]}>
            {t("booking.time.selectCourtAndDate")}
          </Text>
        </View>
      ) : loadingAvailability ? (
        <View style={styles.stateContainer}>
          <ActivityIndicator size="large" color={PRIMARY_COLOR} />
          <Text style={[styles.stateText, localizedTextStyle]}>
            {t("booking.time.loadingSlots")}
          </Text>
        </View>
      ) : availabilityError ? (
        <View style={styles.stateContainer}>
          <Text style={[styles.errorText, localizedTextStyle]}>
            {availabilityError}
          </Text>
        </View>
      ) : availabilitySlots.length === 0 ? (
        <View style={styles.stateContainer}>
          <Text style={[styles.stateText, localizedTextStyle]}>
            {t("booking.time.noAvailabilityForDate")}
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.timeContainer}>
          {availabilitySlots.map((timeSlot, index) => {
            const isSelected =
              selectedTime?.start_time === timeSlot.start_time &&
              selectedTime?.end_time === timeSlot.end_time;
            const isBooked = Boolean(timeSlot.isBooked);

            return (
              <TouchableOpacity
                key={`${timeSlot.start_time}-${timeSlot.end_time}-${index}`}
                style={[
                  styles.timeButton,
                  { flexDirection: getFlexDirection() },
                  isBooked && styles.bookedButton,
                  isSelected && styles.selectedButton,
                  !isBooked &&
                    selectedTime &&
                    !isSelected &&
                    styles.disabledButton,
                ]}
                onPress={() => {
                  if (isBooked) {
                    return;
                  }

                  setSelectedTime((currentValue) =>
                    isSelected ? null : timeSlot,
                  );
                }}
                disabled={isBooked || (selectedTime !== null && !isSelected)}
              >
                <Text
                  style={[
                    styles.timeText,
                    localizedTextStyle,
                    isBooked && styles.bookedTimeText,
                  ]}
                >
                  {timeSlot.label}
                </Text>
                <View style={styles.slotMeta}>
                  {isBooked ? (
                    <Text style={[styles.bookedStatusText, localizedTextStyle]}>
                      {t("booking.time.booked")}
                    </Text>
                  ) : (
                    <Text style={[styles.priceText, localizedTextStyle]}>
                      {timeSlot.price.toLocaleString()} {t("common.currency.afg")}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {selectedTime && (
        <View style={styles.priceInfoContainer}>
          <Text style={[styles.intervalText, localizedTextStyle]}>
            {t("booking.time.timeSummary", {
              time: selectedTime.displayRange,
              duration,
            })}
          </Text>

          {priceInfo && (
            <>
              <View style={[styles.priceRow, { flexDirection: getFlexDirection() }]}>
                <Text style={[styles.priceLabel, localizedTextStyle]}>
                  {t("booking.time.originalPrice")}
                </Text>
                <Text style={[styles.priceValue, localizedTextStyle]}>
                  {priceInfo.originalPrice.toLocaleString()}{" "}
                  {t("common.currency.afg")}
                </Text>
              </View>

              {priceInfo.discountPercent > 0 && (
                <View
                  style={[styles.priceRow, { flexDirection: getFlexDirection() }]}
                >
                  <Text style={[styles.discountLabel, localizedTextStyle]}>
                    {t("booking.time.discount", {
                      percent: priceInfo.discountPercent,
                    })}
                  </Text>
                  <Text style={[styles.discountValue, localizedTextStyle]}>
                    -{priceInfo.discountAmount.toLocaleString()}{" "}
                    {t("common.currency.afg")}
                  </Text>
                </View>
              )}

              <View style={[styles.priceRow, { flexDirection: getFlexDirection() }]}>
                <Text style={[styles.totalLabel, localizedTextStyle]}>
                  {t("booking.form.totalPrice")}
                </Text>
                <Text style={[styles.totalValue, localizedTextStyle]}>
                  {priceInfo.totalPrice.toLocaleString()} {t("common.currency.afg")}
                </Text>
              </View>
            </>
          )}
        </View>
      )}

      {!selectedTime && (
        <Text style={[styles.totalText, localizedTextStyle]}>
          {t("booking.time.total")}: {baseTotalPrice.toLocaleString()}{" "}
          {t("common.currency.afg")}
        </Text>
      )}

      <TouchableOpacity
        style={[
          styles.confirmButton,
          !selectedTime && styles.confirmButtonDisabled,
        ]}
        onPress={handleConfirm}
        disabled={!selectedTime}
      >
        <Text style={[styles.confirmText, localizedTextStyle]}>
          {t("booking.time.confirmTime")}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF",
    padding: 20,
  },
  header: {
    color: "#24a731",
    fontSize: 24,
    textAlign: "center",
    marginBottom: 10,
  },
  dateText: {
    color: "#24a731",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 12,
  },
  selectText: {
    color: "#24a731",
    fontSize: 18,
    marginBottom: 10,
  },
  timeContainer: {
    maxHeight: 260,
    marginBottom: 20,
  },
  timeButton: {
    backgroundColor: "#24a731",
    padding: 15,
    marginBottom: 10,
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  disabledButton: {
    backgroundColor: "#111827",
    opacity: 0.5,
  },
  bookedButton: {
    backgroundColor: "#3F3F46",
    opacity: 0.6,
  },
  selectedButton: {
    backgroundColor: PRIMARY_COLOR,
  },
  timeText: {
    color: "#FFF",
    fontSize: 16,
  },
  bookedTimeText: {
    color: "#E5E7EB",
  },
  priceText: {
    color: "#FFD700",
    fontSize: 14,
    marginTop: 5,
  },
  slotMeta: {
    alignItems: "flex-end",
    justifyContent: "center",
  },
  bookedStatusText: {
    color: "#D1D5DB",
    fontSize: 14,
    fontWeight: "600",
  },
  totalText: {
    color: "#FFF",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },
  intervalText: {
    color: PRIMARY_COLOR,
    fontSize: 18,
    textAlign: "center",
    marginBottom: 20,
    fontWeight: "bold",
  },
  priceInfoContainer: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: PRIMARY_BORDER,
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  priceLabel: {
    color: "#FFF",
    fontSize: 16,
  },
  priceValue: {
    color: "#FFD700",
    fontSize: 16,
  },
  discountLabel: {
    color: PRIMARY_COLOR,
    fontSize: 14,
  },
  discountValue: {
    color: PRIMARY_COLOR,
    fontSize: 14,
  },
  totalLabel: {
    color: PRIMARY_COLOR,
    fontSize: 18,
    fontWeight: "bold",
  },
  totalValue: {
    color: PRIMARY_COLOR,
    fontSize: 18,
    fontWeight: "bold",
  },
  confirmButton: {
    backgroundColor: PRIMARY_COLOR,
    padding: 15,
    borderRadius: 5,
    alignItems: "center",
  },
  confirmButtonDisabled: {
    opacity: 0.45,
  },
  confirmText: {
    color: "white",
    fontSize: 18,
  },
  stateContainer: {
    minHeight: 160,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  stateText: {
    color: "#FFFFFF",
    fontSize: 15,
    textAlign: "center",
    marginTop: 12,
  },
  errorText: {
    color: "#FCA5A5",
    fontSize: 14,
    textAlign: "center",
  },
});

export default Time;
