import { Ionicons } from "@expo/vector-icons";
import { useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { createBooking } from "../api/bookingsApi";
import { useAuth } from "../context/AuthContext";
import { mapErrorToMessage } from "../utils/errorMapper";
import { mapBookingResponse } from "../utils/bookingMapper";
import {
  getFlexDirection,
  getStartMargin,
  getStartPosition,
  getTextAlign,
  getWritingDirection,
  isRTL,
} from "../utils/rtl";

const PRIMARY_COLOR = "#24a731";
const PRIMARY_DARK = "#1B7F26";
const PRIMARY_TINT = "#EAF8EC";
const PRIMARY_BORDER = "#BFE7C5";

export default function BookingForm({ route, navigation }) {
  const { t } = useTranslation();
  const {
    fieldId,
    court,
    duration,
    bookingDate,
    displayDate,
    time,
    selectedSlot,
    start_time,
    end_time,
    price,
    originalPrice,
    discountCode,
  } = route.params;
  const { isAuthenticated } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdBooking, setCreatedBooking] = useState(null);

  const rtl = isRTL();
  const localizedTextStyle = {
    textAlign: getTextAlign(),
    writingDirection: getWritingDirection(),
  };
  const localizedLtrValueStyle = {
    textAlign: rtl ? "left" : "right",
    writingDirection: "ltr",
  };

  const discountedPrice = price;
  const hasDiscount = Boolean(originalPrice && discountedPrice < originalPrice);
  const canStartPayment =
    Boolean(createdBooking?.booking_id) && createdBooking?.can_pay === true;
  const displayBookingDate = displayDate || bookingDate;
  const displayTimeRange = selectedSlot || time;

  useLayoutEffect(() => {
    navigation?.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  const handleConfirmBooking = async () => {
    if (!isAuthenticated) {
      setError(t("booking.form.pleaseSignIn"));
      navigation.navigate("OwnerLogin");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await createBooking({
        field: fieldId,
        booking_date: bookingDate,
        start_time,
        end_time,
        discount_code: discountCode,
      });
      const mappedBooking = mapBookingResponse(response);
      setCreatedBooking({
        ...mappedBooking,
        booking_id: mappedBooking?.booking_id,
        can_pay: mappedBooking?.can_pay === true,
      });
    } catch (apiError) {
      const mapped = mapErrorToMessage(apiError);
      setError(mapped.message);

      if (apiError?.status === 401) {
        navigation.navigate("OwnerLogin");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStartPayment = () => {
    if (!createdBooking?.booking_id || !createdBooking?.can_pay) {
      return;
    }

    navigation.navigate("PaymentScreen", {
      bookingId: createdBooking.booking_id,
      bookingStatus: createdBooking.status,
      bookingDisplayStatus: createdBooking.display_status,
      paymentSummary: createdBooking.payment_summary,
      nextActions: createdBooking.next_actions,
      court,
      duration,
      bookingDate,
      displayDate,
      time: selectedSlot || time,
      price,
    });
  };

  const detailRows = [
    {
      key: "court",
      icon: "football-outline",
      label: t("booking.form.courtField", {
        defaultValue: t("booking.form.court"),
      }),
      value: court,
      valueDirection: "auto",
    },
    {
      key: "duration",
      icon: "time-outline",
      label: t("booking.form.duration"),
      value: `${duration} ${t("booking.form.minutes")}`,
      valueDirection: "ltr",
    },
    {
      key: "date",
      icon: "calendar-outline",
      label: t("booking.form.date"),
      value: displayBookingDate,
      valueDirection: "auto",
    },
    {
      key: "time",
      icon: "alarm-outline",
      label: t("booking.form.time"),
      value: displayTimeRange,
      valueDirection: "ltr",
    },
  ];

  const bookingMetaRows = [
    {
      key: "booking_id",
      label: t("booking.form.bookingId"),
      value: createdBooking?.booking_id,
    },
    {
      key: "status",
      label: t("booking.form.statusLabel"),
      value: createdBooking?.display_status,
    },
    {
      key: "lifecycle",
      label: t("booking.form.lifecycle"),
      value: createdBooking?.lifecycle_state,
    },
    {
      key: "payment",
      label: t("booking.form.paymentSummary"),
      value:
        createdBooking?.payment_summary?.status ||
        t("booking.form.notAvailable"),
    },
  ].filter((item) => item.value);

  const BookingDetailRow = ({
    icon,
    label,
    value,
    valueDirection = "auto",
  }) => {
    const resolvedValueDirection =
      valueDirection === "ltr"
        ? "ltr"
        : valueDirection === "rtl"
          ? "rtl"
          : getWritingDirection();

    return (
      <View style={styles.detailRow}>
        <View
          style={[
            styles.detailContentRow,
            {
              flexDirection: getFlexDirection(),
            },
          ]}
        >
          <View
            style={[
              styles.detailLabelGroup,
              {
                flexDirection: getFlexDirection(),
              },
            ]}
          >
            <View style={styles.detailIconCircle}>
              <Ionicons name={icon} size={20} color="#FFFFFF" />
            </View>

            <Text style={[styles.detailLabel, localizedTextStyle]}>{label}</Text>
          </View>

          <Text
            style={[
              styles.detailValue,
              {
                textAlign: rtl ? "left" : "right",
                writingDirection: resolvedValueDirection,
              },
            ]}
            numberOfLines={2}
          >
            {value}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.header, { flexDirection: getFlexDirection() }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backIcon}>{rtl ? "→" : "←"}</Text>
        </TouchableOpacity>

        <Ionicons
          name={rtl ? "arrow-forward" : "arrow-back"}
          size={28}
          color="#111827"
          style={[styles.backIconOverlay, getStartPosition(27)]}
          pointerEvents="none"
        />

        <Text style={[styles.headerTitle, localizedTextStyle]}>
          {t("booking.form.bookingForm", { defaultValue: "Booking Form" })}
        </Text>

        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.introBlock}>
          <Text style={[styles.pageTitle, localizedTextStyle]}>
            {t("booking.form.bookingInformation", {
              defaultValue: t("booking.form.bookingDetails"),
            })}
          </Text>

          <Text style={[styles.pageSubtitle, localizedTextStyle]}>
            {t("booking.form.reviewDetails", {
              defaultValue: "Please review your booking details",
            })}
          </Text>
        </View>

        <View style={styles.detailsCard}>
          {detailRows.map((item, index) => (
            <View key={item.key}>
              <BookingDetailRow
                icon={item.icon}
                label={item.label}
                value={item.value}
                valueDirection={item.valueDirection}
              />
              {index < detailRows.length - 1 ? (
                <View style={styles.detailDivider} />
              ) : null}
            </View>
          ))}
        </View>

        <View style={styles.totalCard}>
          <View
            style={[
              styles.totalCardContent,
              { flexDirection: getFlexDirection() },
            ]}
          >
            <View style={styles.totalTextBlock}>
              <Text style={[styles.totalLabel, localizedTextStyle]}>
                {t("booking.form.totalPrice")}:
              </Text>
              {hasDiscount && originalPrice ? (
                <Text style={[styles.totalHint, localizedTextStyle]}>
                  {t("booking.form.originalPrice")}: {originalPrice}{" "}
                  {t("common.currency.afg")}
                </Text>
              ) : null}
            </View>

            <Text
              style={[
                styles.totalValue,
                localizedLtrValueStyle,
              ]}
            >
              {discountedPrice} {t("common.currency.afg", { defaultValue: "AFG" })}
            </Text>
          </View>
        </View>

        {!!error ? (
          <Text style={[styles.errorText, localizedTextStyle]}>{error}</Text>
        ) : null}

        <TouchableOpacity
          style={[
            styles.createButton,
            (loading || Boolean(createdBooking)) && styles.createButtonDisabled,
          ]}
          onPress={handleConfirmBooking}
          disabled={loading || Boolean(createdBooking)}
        >
          <View
            style={[
              styles.createButtonContent,
              { flexDirection: getFlexDirection() },
            ]}
          >
            <Ionicons name="ticket-outline" size={20} color="#FFFFFF" />
            <Text style={[styles.createButtonText, localizedTextStyle]}>
              {loading
                ? t("booking.form.creatingBooking")
                : t("booking.form.createBooking")}
            </Text>
          </View>
        </TouchableOpacity>

        {createdBooking ? (
          <View style={styles.resultCard}>
            <View
              style={[
                styles.resultHeader,
                { flexDirection: getFlexDirection() },
              ]}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={22}
                color={PRIMARY_COLOR}
              />
              <Text
                style={[
                  styles.successText,
                  localizedTextStyle,
                  getStartMargin(10),
                ]}
              >
                {t("booking.form.bookingCreated")}
              </Text>
            </View>

            {bookingMetaRows.map((item) => (
              <View
                key={item.key}
                style={[
                  styles.metaRow,
                  { flexDirection: rtl ? "row-reverse" : "row" },
                ]}
              >
                <Text style={[styles.metaLabel, localizedTextStyle]}>
                  {item.label}
                </Text>
                <Text style={[styles.metaValue, localizedTextStyle]}>
                  {item.value}
                </Text>
              </View>
            ))}

            {createdBooking?.booking_id ? (
              <TouchableOpacity
                style={[
                  styles.payButton,
                  !canStartPayment && styles.payButtonDisabled,
                ]}
                onPress={handleStartPayment}
                disabled={!canStartPayment}
              >
                <View
                  style={[
                    styles.payButtonContent,
                    { flexDirection: getFlexDirection() },
                  ]}
                >
                  <Ionicons name="card-outline" size={18} color={PRIMARY_DARK} />
                  <Text style={[styles.payButtonText, localizedTextStyle]}>
                    {canStartPayment
                      ? t("booking.form.payNow")
                      : t("booking.form.paymentUnavailable")}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {createdBooking ? (
          <Text style={[styles.helperText, localizedTextStyle]}>
            {t("booking.form.paymentStartsHelper")}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    height: 64,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  backIcon: {
    fontSize: 34,
    color: "#111827",
    display: "none",
  },
  backIconOverlay: {
    position: "absolute",
    top: 18,
  },
  headerTitle: {
    flex: 1,
    fontSize: 24,
    fontWeight: "900",
    color: "#111827",
  },
  headerSpacer: {
    width: 42,
  },
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 40,
  },
  introBlock: {
    marginBottom: 22,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 8,
  },
  pageSubtitle: {
    fontSize: 15,
    color: "#64748B",
    lineHeight: 22,
  },
  detailsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  detailRow: {
    minHeight: 86,
    justifyContent: "center",
  },
  detailContentRow: {
    width: "100%",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  detailLabelGroup: {
    flex: 1.1,
    alignItems: "center",
    gap: 12,
  },
  detailIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: PRIMARY_COLOR,
    alignItems: "center",
    justifyContent: "center",
  },
  detailLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    color: "#64748B",
  },
  detailValue: {
    flex: 0.9,
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
  },
  detailDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
  },
  totalCard: {
    marginTop: 22,
    minHeight: 78,
    borderRadius: 18,
    backgroundColor: PRIMARY_COLOR,
    justifyContent: "center",
    paddingHorizontal: 22,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  totalCardContent: {
    width: "100%",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalTextBlock: {
    flex: 1,
    paddingVertical: 10,
  },
  totalLabel: {
    flex: 1,
    fontSize: 19,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  totalHint: {
    marginTop: 6,
    fontSize: 13,
    color: PRIMARY_TINT,
  },
  totalValue: {
    flex: 1,
    fontSize: 30,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  errorText: {
    color: "#DC2626",
    fontSize: 14,
    marginTop: 16,
  },
  createButton: {
    marginTop: 22,
    minHeight: 58,
    borderRadius: 12,
    backgroundColor: PRIMARY_COLOR,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  createButtonText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  resultCard: {
    marginTop: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: PRIMARY_BORDER,
  },
  resultHeader: {
    alignItems: "center",
    marginBottom: 10,
  },
  successText: {
    flex: 1,
    color: PRIMARY_DARK,
    fontSize: 15,
    fontWeight: "700",
  },
  metaRow: {
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  metaLabel: {
    flex: 1,
    fontSize: 14,
    color: "#64748B",
  },
  metaValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  payButton: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: PRIMARY_TINT,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: PRIMARY_BORDER,
  },
  payButtonDisabled: {
    opacity: 0.55,
  },
  payButtonContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  payButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: PRIMARY_DARK,
  },
  helperText: {
    marginTop: 12,
    color: "#4B5563",
    fontSize: 14,
    lineHeight: 20,
  },
});
