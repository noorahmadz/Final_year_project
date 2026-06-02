import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  getGymDetail,
  getGymDiscounts,
  getGymFields,
  getGymReviews,
  getGymSlots,
} from "../api/gymsApi";
import { useGym } from "../context/GymContext";
import {
  formatBackendDateForDisplay,
  formatDateForBackend,
} from "../utils/bookingMapper";
import { useAuth } from "../context/AuthContext";
import { getActiveDiscount, getDiscountPercent, mapGymToUi } from "../utils/gymMapper";
import {
  getFlexDirection,
  getStartMargin,
  getTextAlign,
  getWritingDirection,
  isRTL,
} from "../utils/rtl";

const PRIMARY_COLOR = "#24a731";
const PRIMARY_DARK = "#1B7F26";
const PRIMARY_TINT = "#EAF8EC";

export default function ServiceDetails({ navigation, route }) {
  const { t } = useTranslation();
  const { currentGym } = useGym();
  const { isAuthenticated, role, user: currentUser } = useAuth();
  const fallbackGym = route?.params?.gym || currentGym || null;
  const gymId = route?.params?.gymId || fallbackGym?.id || fallbackGym?.gymId;
  const rtl = isRTL();
  const directionKey = rtl ? "rtl" : "ltr";
  const scrollContentStyle = {
    paddingBottom: 24,
  };
  const localizedTextStyle = {
    textAlign: getTextAlign(),
    writingDirection: getWritingDirection(),
  };
  const localizedBlockTextStyle = {
    ...localizedTextStyle,
    width: "100%",
  };
  const localizedStackStyle = {
    alignItems: rtl ? "flex-end" : "flex-start",
  };
  const localizedRowStyle = {
    flexDirection: getFlexDirection(),
  };
  const localizedWrapRowStyle = {
    flexDirection: getFlexDirection(),
    justifyContent: rtl ? "flex-end" : "flex-start",
  };
  const localizedAlignSelfStyle = {
    alignSelf: rtl ? "flex-end" : "flex-start",
  };
  const directionOnlyTextStyle = {
    writingDirection: getWritingDirection(),
  };
  const centeredLocalizedTextStyle = {
    ...directionOnlyTextStyle,
    textAlign: "center",
  };
  const endAlignedTextStyle = {
    textAlign: rtl ? "left" : "right",
    writingDirection: getWritingDirection(),
  };
  const ltrValueTextStyle = {
    textAlign: rtl ? "left" : "right",
    writingDirection: "ltr",
  };
  const centeredLtrValueStyle = {
    writingDirection: "ltr",
  };
  const currencyLabel = t("common.currency.AFN", { defaultValue: "AFN" });

  const [gym, setGym] = useState(fallbackGym);
  const [selectedCourt, setSelectedCourt] = useState(null);
  const [selectedDuration, setSelectedDuration] = useState(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [loadingGym, setLoadingGym] = useState(Boolean(gymId));
  const [gymError, setGymError] = useState("");
  const [gymWarnings, setGymWarnings] = useState([]);
  const [reloadToken, setReloadToken] = useState(0);

  const courts = gym?.courts || [];
  const reviewsLoaded = !loadingGym;
  const currentUserId = currentUser?.user_id ?? currentUser?.id ?? null;
  const hasReview =
    reviewsLoaded &&
    Array.isArray(gym?.reviews) &&
    currentUserId !== null &&
    gym.reviews.some(
      (review) =>
        review?.userId === currentUserId ||
        review?.user_id === currentUserId ||
        review?.user?.id === currentUserId,
    );
  const canWriteReview =
    isAuthenticated && role === "customer" && reviewsLoaded && !hasReview;
  const dateOptions = [0, 1, 2].map((offset) => {
    const nextDate = new Date();
    nextDate.setHours(0, 0, 0, 0);
    nextDate.setDate(nextDate.getDate() + offset);

    const backendDate = formatDateForBackend(nextDate);
    return {
      id: backendDate,
      value: backendDate,
      label:
        offset === 0
          ? t("common.time.today", { defaultValue: "Today" })
          : offset === 1
            ? t("common.time.tomorrow", { defaultValue: "Tomorrow" })
            : formatBackendDateForDisplay(backendDate),
    };
  });
  const selectedDateLabel =
    dateOptions.find((option) => option.value === selectedDate)?.label ||
    formatBackendDateForDisplay(selectedDate);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setSelectedDate((currentValue) => currentValue || formatDateForBackend(today));
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadGymDetails = async () => {
      if (!gymId) {
        setLoadingGym(false);
        return;
      }

      setLoadingGym(true);
      setGymError("");

      try {
        const [
          gymDetailResult,
          gymFieldsResult,
          gymReviewsResult,
          gymDiscountsResult,
          gymSlotsResult,
        ] = await Promise.allSettled([
          getGymDetail(gymId),
          getGymFields(gymId),
          getGymReviews(gymId),
          getGymDiscounts(gymId),
          getGymSlots(gymId),
        ]);

        if (!isMounted) {
          return;
        }

        if (gymDetailResult.status !== "fulfilled") {
          throw gymDetailResult.reason;
        }

        const warnings = [];
        const secondaryResponses = [
          { label: "fields", result: gymFieldsResult },
          { label: "reviews", result: gymReviewsResult },
          { label: "discounts", result: gymDiscountsResult },
          { label: "slots", result: gymSlotsResult },
        ];

        secondaryResponses.forEach(({ label, result }) => {
          if (result.status === "rejected") {
            const message =
              result.reason?.message || `Unable to load ${label}.`;
            warnings.push(message);
            console.warn(`Gym ${label} load failed`, result.reason);
          }
        });

        setGymWarnings(warnings);
        const reviewResults =
          gymReviewsResult.status === "fulfilled"
            ? gymReviewsResult.value?.results || []
            : [];
        const mappedGym = mapGymToUi(gymDetailResult.value, {
          fields:
            gymFieldsResult.status === "fulfilled"
              ? gymFieldsResult.value?.results || []
              : [],
          reviews: reviewResults,
          discounts:
            gymDiscountsResult.status === "fulfilled"
              ? gymDiscountsResult.value?.results || []
              : [],
          slots:
            gymSlotsResult.status === "fulfilled"
              ? gymSlotsResult.value?.results || []
              : [],
        });

        setGym({
          ...mappedGym,
          reviews: mappedGym.reviews.map((review, index) => ({
            ...review,
            userId: reviewResults[index]?.user ?? null,
            user_id: reviewResults[index]?.user ?? null,
          })),
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setGymError(
          error.message ||
            t("gyms.details.loadDetailsError", {
              defaultValue: "Unable to load gym details.",
            }),
        );
        setGymWarnings([]);
        setGym(fallbackGym);
      } finally {
        if (isMounted) {
          setLoadingGym(false);
        }
      }
    };

    loadGymDetails();

    return () => {
      isMounted = false;
    };
  }, [fallbackGym, gymId, reloadToken]);

  const formatAmount = (amount) =>
    `${Number(amount || 0).toLocaleString()} ${currencyLabel}`;

  const localizeDayLabel = (day) => {
    const normalizedDay = String(day || "").trim().toLowerCase();
    const dayKeyMap = {
      mon: "common.time.mon",
      monday: "common.time.monday",
      tue: "common.time.tue",
      tuesday: "common.time.tuesday",
      wed: "common.time.wed",
      wednesday: "common.time.wednesday",
      thu: "common.time.thu",
      thursday: "common.time.thursday",
      fri: "common.time.fri",
      friday: "common.time.friday",
      sat: "common.time.sat",
      saturday: "common.time.saturday",
      sun: "common.time.sun",
      sunday: "common.time.sunday",
    };
    const translationKey = dayKeyMap[normalizedDay];

    return translationKey ? t(translationKey, { defaultValue: day }) : day;
  };

  if (loadingGym && !gym) {
    return (
      <View key={`loading-${directionKey}`} style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={PRIMARY_COLOR} />
        <Text style={[styles.loadingText, centeredLocalizedTextStyle]}>
          {t("gyms.details.loadingDetails", {
            defaultValue: "Loading gym details...",
          })}
        </Text>
      </View>
    );
  }

  if (!gym) {
    return (
      <View key={`empty-${directionKey}`} style={styles.container}>
        <Text style={[styles.errorText, centeredLocalizedTextStyle]}>
          {t("gyms.details.noGymSelected", { defaultValue: "No gym selected" })}
        </Text>
        <Button
          title={t("gyms.details.goBack", { defaultValue: "Go Back" })}
          onPress={() => navigation.goBack()}
        />
      </View>
    );
  }

  const handleCourtSelect = (court) => {
    setSelectedCourt(court);
    setSelectedDuration(null);
  };

  const handleDurationSelect = (duration) => {
    setSelectedDuration(duration);
  };

  const activeDiscount = getActiveDiscount(gym);
  const discountPercent = getDiscountPercent(activeDiscount);
  const originalPrice = Number(
    selectedCourt?.price_per_hour || selectedCourt?.pricePerHour || 0,
  );
  const discountAmount =
    discountPercent > 0
      ? Math.round((originalPrice * discountPercent) / 100)
      : 0;
  const totalPrice = Math.max(originalPrice - discountAmount, 0);

  const handleConfirm = () => {
    if (!selectedCourt || !selectedDuration || !selectedDate) return;

    let priceIntervalsForDuration = null;
    if (selectedCourt.priceIntervals) {
      if (Array.isArray(selectedCourt.priceIntervals)) {
        priceIntervalsForDuration = selectedCourt.priceIntervals;
      } else if (typeof selectedCourt.priceIntervals === "object") {
        priceIntervalsForDuration =
          selectedCourt.priceIntervals[selectedDuration] || null;
      }
    }

    navigation?.navigate("Time", {
      gymId: gym.id,
      gymName: gym.name,
      court: selectedCourt.name,
      courtId: selectedCourt.id,
      fieldId: selectedCourt.fieldId || selectedCourt.id,
      duration: selectedDuration,
      selectedDate,
      displayDate: formatBackendDateForDisplay(selectedDate),
      price: totalPrice,
      originalPrice,
      discountPercent,
      discountAmount,
      totalPrice,
      discountCode: activeDiscount?.code || "",
      priceIntervals: priceIntervalsForDuration,
    });
  };

  return (
    <ScrollView
      key={directionKey}
      style={styles.container}
      contentContainerStyle={scrollContentStyle}
    >
      {gymError ? (
        <View style={styles.inlineErrorContainer}>
          <Text style={[styles.inlineErrorText, localizedBlockTextStyle]}>{gymError}</Text>
          {gymId ? (
            <TouchableOpacity
              style={styles.retryLink}
              onPress={() => {
                setGym(null);
                setLoadingGym(true);
                setGymError("");
                setGymWarnings([]);
                setSelectedCourt(null);
                setSelectedDuration(null);
                setReloadToken((current) => current + 1);
              }}
            >
              <Text style={[styles.retryLinkText, localizedBlockTextStyle]}>
                {t("gyms.details.retryLoadingDetails", {
                  defaultValue: "Retry loading details",
                })}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {gymWarnings.length > 0 ? (
        <View style={styles.inlineWarningContainer}>
          <Text style={[styles.inlineWarningText, localizedBlockTextStyle]}>
            {t("gyms.details.temporaryUnavailable", {
              defaultValue: "Some gym information is temporarily unavailable.",
            })}
          </Text>
        </View>
      ) : null}

      <View style={styles.gymHeader}>
        <View style={[styles.gymHeaderContent, localizedStackStyle]}>
          <Text style={[styles.gymName, localizedBlockTextStyle]}>{gym.name}</Text>

          <View style={[styles.gymLocationRow, localizedRowStyle]}>
            <Ionicons name="location-outline" size={16} color={PRIMARY_TINT} />
            <Text style={[styles.gymLocation, localizedTextStyle]}>
              {[gym.city, gym.address].filter(Boolean).join(" • ")}
            </Text>
          </View>

          <View style={[styles.gymHeaderMetaRow, localizedWrapRowStyle]}>
            {gym.startingPriceLabel ? (
              <View style={[styles.pricePill, localizedRowStyle]}>
                <Ionicons name="pricetag-outline" size={14} color={PRIMARY_DARK} />
                <Text style={[styles.pricePillText, localizedTextStyle]}>
                  {gym.startingPriceLabel}
                </Text>
              </View>
            ) : null}

            {Number.isFinite(gym.rating) && gym.rating > 0 ? (
              <View style={[styles.ratingPill, localizedRowStyle]}>
                <Ionicons name="star" size={14} color="#F59E0B" />
                <Text style={[styles.ratingPillText, ltrValueTextStyle]}>
                  {gym.rating.toFixed(1)} / 5
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {gym.timing && Object.keys(gym.timing).length > 0 ? (
        <View style={styles.openingHoursCard}>
          <Text style={[styles.sectionTitle, localizedBlockTextStyle]}>
            {t("gyms.details.openingHours", { defaultValue: "Opening Hours" })}
          </Text>
          <Text style={[styles.openingHoursSubtitle, localizedBlockTextStyle]}>
            {t("gyms.details.availableBookingTimesByDay", {
              defaultValue: "Available booking times by day",
            })}
          </Text>
          {Object.entries(gym.timing).map(([day, hours]) => (
            <View key={day} style={[styles.hoursRow, localizedRowStyle]}>
              <View style={styles.dayBadge}>
                <Text style={[styles.dayBadgeText, localizedTextStyle]}>
                  {localizeDayLabel(day)}
                </Text>
              </View>
              <Text
                style={[
                  styles.hoursValue,
                  getStartMargin(16),
                  ltrValueTextStyle,
                ]}
              >
                {hours.open} - {hours.close}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {activeDiscount ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, localizedBlockTextStyle]}>
            {t("gyms.details.activeDiscounts", {
              defaultValue: "Active Discounts",
            })}
          </Text>
          <View style={[styles.infoCard, localizedStackStyle]}>
            <Text style={[styles.infoCardTitle, localizedBlockTextStyle]}>
              {activeDiscount.title || activeDiscount.description}
            </Text>
            <Text style={[styles.infoCardText, localizedBlockTextStyle]}>
              {t("gyms.details.discountOff", {
                percent: getDiscountPercent(activeDiscount),
                defaultValue: "{{percent}}% off",
              })}
              {activeDiscount.code
                ? ` | ${t("gyms.details.code", { defaultValue: "Code" })}: ${activeDiscount.code}`
                : ""}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, localizedBlockTextStyle]}>
          {t("gyms.details.selectCourt", { defaultValue: "Select Court" })}
        </Text>

        {courts.length > 0 ? (
          <View style={[styles.courtGrid, localizedWrapRowStyle]}>
            {courts.map((court, index) => (
              <TouchableOpacity
                key={court.id || index}
                style={[
                  styles.courtButton,
                  localizedStackStyle,
                  localizedAlignSelfStyle,
                  selectedCourt?.id === court.id && styles.courtButtonSelected,
                ]}
                onPress={() => handleCourtSelect(court)}
              >
                <Text
                  style={[
                    styles.courtText,
                    localizedBlockTextStyle,
                    selectedCourt?.id === court.id && styles.courtTextSelected,
                  ]}
                >
                  {court.name}
                </Text>
             
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={[styles.emptyCourts, localizedStackStyle]}>
            <Text style={[styles.emptyText, centeredLocalizedTextStyle]}>
              {t("gyms.details.noCourtsAvailable", {
                defaultValue: "No courts available",
              })}
            </Text>
            <Text style={[styles.emptySubtext, centeredLocalizedTextStyle]}>
              {t("gyms.details.contactGymForMoreInfo", {
                defaultValue: "Contact the gym for more information",
              })}
            </Text>
          </View>
        )}
      </View>

      {selectedCourt ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, localizedBlockTextStyle]}>
            {t("gyms.details.selectDuration", {
              defaultValue: "Select Duration",
            })}
          </Text>

          <View style={[styles.durationContainer, localizedRowStyle]}>
            <TouchableOpacity
              style={[
                styles.durationButton,
                localizedStackStyle,
                localizedAlignSelfStyle,
                selectedDuration === 40 && styles.durationButtonSelected,
              ]}
              onPress={() => handleDurationSelect(40)}
            >
              <Text
                style={[
                  styles.durationText,
                  localizedBlockTextStyle,
                  selectedDuration === 40 && styles.durationTextSelected,
                ]}
              >
                40 {t("common.time.minutes", { defaultValue: "Minutes" })}
              </Text>
            
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {selectedCourt && selectedDuration ? (
        <View style={styles.confirmSection}>
          <View style={styles.summaryCard}>
            <Text style={[styles.summaryTitle, localizedBlockTextStyle]}>
              {t("gyms.details.bookingSummary", {
                defaultValue: "Booking Summary",
              })}
            </Text>

            <View style={styles.detailCard}>
              <View style={[styles.summaryRow, localizedRowStyle]}>
                <Text style={[styles.summaryLabel, localizedTextStyle]}>
                  {t("booking.form.court", { defaultValue: "Court" })}
                </Text>
                <Text style={[styles.summaryValue, endAlignedTextStyle]}>
                  {selectedCourt.name}
                </Text>
              </View>
            </View>

            <View style={styles.detailCard}>
              <View style={[styles.summaryRow, localizedRowStyle]}>
                <Text style={[styles.summaryLabel, localizedTextStyle]}>
                  {t("booking.form.duration", { defaultValue: "Duration" })}
                </Text>
                <Text style={[styles.summaryValue, ltrValueTextStyle]}>
                  {selectedDuration} {t("common.time.minutes", { defaultValue: "Minutes" })}
                </Text>
              </View>
            </View>

            <View style={styles.detailCard}>
              <View style={[styles.summaryRow, localizedRowStyle]}>
                <Text style={[styles.summaryLabel, localizedTextStyle]}>
                  {t("gyms.details.date", { defaultValue: "Date" })}
                </Text>
                <Text style={[styles.summaryValue, endAlignedTextStyle]}>
                  {selectedDateLabel ||
                    t("gyms.details.selectDate", {
                      defaultValue: "Select a date",
                    })}
                </Text>
              </View>
            </View>

            <View style={[styles.dateSelectorRow, localizedRowStyle]}>
              {dateOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.dateOptionButton,
                    selectedDate === option.value && styles.dateOptionButtonSelected,
                  ]}
                  onPress={() => setSelectedDate(option.value)}
                >
                  <Text
                    style={[
                      styles.dateOptionText,
                      centeredLocalizedTextStyle,
                      selectedDate === option.value && styles.dateOptionTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.divider} />

            <>
              <View style={[styles.priceRow, localizedRowStyle]}>
                <Text style={[styles.priceLabel, localizedTextStyle]}>
                  {t("gyms.details.originalPrice", {
                    defaultValue: "Original Price",
                  })}
                </Text>
                <Text
                  style={[
                    styles.priceValue,
                    ltrValueTextStyle,
                    discountPercent > 0 && styles.strikethroughPrice,
                  ]}
                >
                  {formatAmount(originalPrice)}
                </Text>
              </View>
              {discountPercent > 0 ? (
                <View style={[styles.priceRow, localizedRowStyle]}>
                  <Text style={[styles.discountLabel, localizedTextStyle]}>
                    {t("gyms.details.discount", {
                      percent: discountPercent,
                      defaultValue: "Discount ({{percent}}%)",
                    })}
                  </Text>
                  <Text style={[styles.discountValue, ltrValueTextStyle]}>
                    -{formatAmount(discountAmount)}
                  </Text>
                </View>
              ) : null}
              <View style={[styles.priceRow, localizedRowStyle]}>
                <Text style={[styles.totalLabel, localizedTextStyle]}>
                  {t("booking.form.totalPrice", {
                    defaultValue: "Total Price",
                  })}
                </Text>
                <Text style={[styles.totalValue, ltrValueTextStyle]}>
                  {formatAmount(totalPrice)}
                </Text>
              </View>
            </>
          </View>

          <TouchableOpacity
            style={[styles.continueButton, { backgroundColor: PRIMARY_COLOR }]}
            onPress={handleConfirm}
          >
            <Text style={[styles.continueButtonText, centeredLocalizedTextStyle]}>
              {t("gyms.details.continueToTimeSelection", {
                defaultValue: "Continue to Time Selection",
              })}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {Array.isArray(gym.reviews) && gym.reviews.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, localizedBlockTextStyle]}>
            {t("gyms.details.recentReviews", {
              defaultValue: "Recent Reviews",
            })}
          </Text>
          {gym.reviews.slice(0, 3).map((review) => (
            <View key={review.id} style={[styles.infoCard, localizedStackStyle]}>
              <Text style={[styles.infoCardTitle, localizedBlockTextStyle]}>
                {review.userName} | {review.rating}/5
              </Text>
              <Text style={[styles.infoCardText, localizedBlockTextStyle]}>
                {review.comment}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {isAuthenticated && role === "customer" ? (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.reviewButton}
            onPress={() =>
              navigation.navigate("CreateReview", {
                gymId: gym.id,
                gymName: gym.name,
                onReviewCreated: () => setReloadToken((current) => current + 1),
              })
            }
            disabled={!canWriteReview}
          >
            <Text style={[styles.reviewButtonText, centeredLocalizedTextStyle]}>
              {canWriteReview
                ? t("gyms.details.writeReview", { defaultValue: "Write a Review" })
                : t("gyms.details.reviewUnavailable", {
                    defaultValue: "Review Unavailable",
                  })}
            </Text>
          </TouchableOpacity>
          {!canWriteReview ? (
            <Text style={[styles.reviewHelperText, centeredLocalizedTextStyle]}>
              {t("gyms.details.existingReviewHelper", {
                defaultValue: "You may already have a review for this gym.",
              })}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.backSection}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: PRIMARY_COLOR }]}
          onPress={() => navigation.navigate("Home")}
        >
          <Text style={[styles.backButtonText, centeredLocalizedTextStyle]}>
            {t("gyms.details.backToHome", { defaultValue: "Back to Home" })}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  gymHeader: {
    margin: 16,
    marginBottom: 12,
    borderRadius: 20,
    backgroundColor: PRIMARY_COLOR,
    padding: 22,
    shadowColor: PRIMARY_DARK,
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  gymHeaderContent: {
    gap: 12,
  },
  gymName: {
    fontSize: 30,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  gymLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  gymLocation: {
    flex: 1,
    fontSize: 14,
    color: PRIMARY_TINT,
    lineHeight: 20,
  },
  gymHeaderMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  pricePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: PRIMARY_TINT,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  pricePillText: {
    fontSize: 14,
    color: PRIMARY_DARK,
    fontWeight: "600",
  },
  ratingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  ratingPillText: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "600",
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1F2932",
    marginBottom: 16,
  },
  openingHoursCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  openingHoursSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: -8,
    marginBottom: 14,
  },
  courtGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  courtButton: {
    
    width: "100%",
    padding: 16,
    borderRadius: 12,
    backgroundColor: "rgb(44, 184, 44)",
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    
  },
  courtButtonSelected: {
    backgroundColor: PRIMARY_TINT,
    borderColor: PRIMARY_COLOR,
  },
  courtText: {
    fontSize: 18,
    fontWeight: "600",
    color:  "white",
  },
  courtTextSelected: {
    color: "#0000",
  },
  // courtPrice: {
  //   fontSize: 14,
  //   color: "white",
  //   marginTop: 4,
  // },
  durationContainer: {
    flexDirection: "row",
    gap: 12,
  },
  durationButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: PRIMARY_COLOR,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
  },
  durationButtonSelected: {
    backgroundColor: PRIMARY_TINT,
    borderColor: PRIMARY_COLOR,
  },
  durationText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },
  durationTextSelected: {
    color: "#000000",
  },
  durationPrice: {
    fontSize: 14,
    color: "white",
    marginTop: 4,
  },
  dateSelectorRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  dateOptionButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  dateOptionButtonSelected: {
    backgroundColor: PRIMARY_TINT,
    borderColor: PRIMARY_COLOR,
  },
  dateOptionText: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "600",
  },
  dateOptionTextSelected: {
    color: "#000000",
  },
  emptyCourts: {
    alignItems: "center",
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#666",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
    marginTop: 8,
  },
  confirmSection: {
    padding: 20,
  },
  continueButton: {
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  continueButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  summaryCard: {
    backgroundColor: "#F3F4F6",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "rgb(88, 210, 36)",
    marginBottom: 16,
  },
  detailCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 15,
    color: "#6B7280",
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1F2937",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  infoLabel: {
    fontSize: 15,
    color: "#6B7280",
    fontWeight: "600",
  },
  infoValue: {
    fontSize: 15,
    color: "#1F2937",
  },
  hoursRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  dayBadge: {
    minWidth: 52,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: PRIMARY_TINT,
    alignItems: "center",
  },
  dayBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: PRIMARY_DARK,
  },
  hoursValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  infoCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  infoCardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 4,
  },
  infoCardText: {
    fontSize: 14,
    color: "#4B5563",
    lineHeight: 20,
  },
  reviewButton: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: PRIMARY_COLOR,
  },
  reviewButtonText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "600",
  },
  reviewHelperText: {
    marginTop: 10,
    color: "#6B7280",
    fontSize: 13,
    textAlign: "center",
  },
  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 12,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  priceLabel: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1F2937",
  },
  priceValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#6B7280",
  },
  strikethroughPrice: {
    textDecorationLine: "line-through",
  },
  discountLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: PRIMARY_COLOR,
  },
  discountValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: PRIMARY_COLOR,
  },
  totalLabel: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1F2937",
  },
  totalValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: PRIMARY_COLOR,
  },
  backSection: {
    padding: 20,
    paddingTop: 0,
  },
  backButton: {
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  backButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  errorText: {
    fontSize: 18,
    color: "#EF4444",
    textAlign: "center",
    marginBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#4B5563",
  },
  inlineErrorContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  inlineErrorText: {
    color: "#DC2626",
    fontSize: 14,
  },
  inlineWarningContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  inlineWarningText: {
    color: "#B45309",
    fontSize: 14,
  },
  retryLink: {
    marginTop: 8,
  },
  retryLinkText: {
    color: PRIMARY_COLOR,
    fontSize: 14,
    fontWeight: "600",
  },
});
