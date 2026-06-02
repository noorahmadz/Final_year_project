import { useStripe } from "@stripe/stripe-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  confirmBookingPayment,
  confirmTournamentPayment,
  createBookingPaymentIntent,
} from "../api/paymentsApi";
import { useAuth } from "../context/AuthContext";
import { mapErrorToMessage } from "../utils/errorMapper";
import { formatCurrency, formatDate, formatTime } from "../utils/formatters";
import { getStatusLabel } from "../utils/statusMapper";
import {
  getFlexDirection,
  getTextAlign,
  getWritingDirection,
  isRTL,
} from "../utils/rtl";

const PRIMARY_COLOR = "#24a731";
const PRIMARY_DARK = "#1B7F26";
const PRIMARY_TINT = "#EAF8EC";
const PRIMARY_BORDER = "#BFE7C5";

const PAYMENT_SHEET_CANCELED_CODE = "Canceled";

export default function PaymentScreen({ route, navigation }) {
  const { t } = useTranslation();
  const {
    paymentMode,
    bookingId,
    bookingStatus,
    bookingDisplayStatus,
    paymentSummary,
    nextActions,
    tournamentId,
    tournamentName,
    teamName,
    captainName,
    paymentIntentClientSecret,
    paymentIntentId,
    court,
    duration,
    bookingDate,
    displayDate,
    time,
    price,
  } = route.params || {};
  const { isAuthenticated, user } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const rtl = isRTL();
  const localizedTextStyle = {
    textAlign: getTextAlign(),
    writingDirection: getWritingDirection(),
  };
  const localizedLtrValueStyle = {
    textAlign: rtl ? "left" : "right",
    writingDirection: "ltr",
  };

  const [email, setEmail] = useState(user?.email || "");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [confirmedPayment, setConfirmedPayment] = useState(null);
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  const isTournamentRegistration = paymentMode === "tournament_registration";
  const canPayFromBooking =
    Boolean(bookingId) &&
    bookingStatus !== "confirmed" &&
    paymentSummary?.status !== "paid" &&
    paymentSummary?.can_retry !== false;
  const canPayTournamentRegistration =
    isTournamentRegistration &&
    Boolean(tournamentId) &&
    Boolean(paymentIntentClientSecret) &&
    Boolean(paymentIntentId);
  const canSubmitPayment = isTournamentRegistration
    ? canPayTournamentRegistration
    : canPayFromBooking;

  const validateEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const formattedAmount = formatCurrency(price || 0);
  const formattedBookingDate =
    formatDate(displayDate || bookingDate) || displayDate || bookingDate || "";
  const formattedBookingTime = formatTime(time) || time || "";

  const getPaymentStatusLabel = (status) => {
    const normalized = String(status || "").toLowerCase();

    const statusKeyMap = {
      pending: "pending",
      success: "success",
      paid: "paid",
      failed: "failed",
      refunded: "refunded",
      cancelled: "cancelled",
      canceled: "canceled",
    };

    const key = statusKeyMap[normalized] || "unknown";

    return t(`payment.status.${key}`);
  };

  const SummaryRow = ({ label, value, valueDirection = "auto" }) => (
    <View
      style={[
        styles.row,
        {
          flexDirection: getFlexDirection(),
        },
      ]}
    >
      <Text style={[styles.label, localizedTextStyle]}>{label}</Text>

      <Text
        style={[
          styles.value,
          {
            textAlign: rtl ? "left" : "right",
            writingDirection:
              valueDirection === "ltr"
                ? "ltr"
                : valueDirection === "rtl"
                  ? "rtl"
                  : getWritingDirection(),
          },
        ]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );

  const handlePayment = async () => {
    if (!isAuthenticated) {
      setPaymentError(t("payment.screen.pleaseSignIn"));
      navigation.navigate("OwnerLogin");
      return;
    }

    if (!isTournamentRegistration && !bookingId) {
      setPaymentError(t("payment.screen.missingBookingId"));
      return;
    }

    if (!canSubmitPayment) {
      setPaymentError(t("payment.screen.paymentNotEligible"));
      return;
    }

    if (!email.trim()) {
      setEmailError(t("payment.screen.emailRequired"));
      return;
    }

    if (!validateEmail(email)) {
      setEmailError(t("payment.screen.invalidEmail"));
      return;
    }

    setLoading(true);
    setEmailError("");
    setPaymentError("");
    setStatusMessage("");

    try {
      let clientSecret = paymentIntentClientSecret;
      let resolvedPaymentIntentId = paymentIntentId;

      if (!isTournamentRegistration) {
        const intentResponse = await createBookingPaymentIntent(bookingId);
        clientSecret = intentResponse?.client_secret;
        resolvedPaymentIntentId = intentResponse?.payment_intent_id;
      }

      if (!clientSecret || !resolvedPaymentIntentId) {
        setPaymentError(t("payment.screen.setupFailed"));
        return;
      }

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: "Futsal Project",
        defaultBillingDetails: {
          email: email.trim(),
        },
      });

      if (initError) {
        setPaymentError(
          initError.message || t("payment.screen.paymentInitFailed"),
        );
        return;
      }

      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code === PAYMENT_SHEET_CANCELED_CODE) {
          setPaymentError(t("payment.screen.paymentCanceled"));
        } else {
          setPaymentError(
            presentError.message || t("payment.screen.setupFailed"),
          );
        }
        return;
      }

      if (isTournamentRegistration) {
        const confirmedResponse = await confirmTournamentPayment(
          resolvedPaymentIntentId,
        );

        setConfirmedPayment(confirmedResponse?.payment || null);
        setStatusMessage(
          confirmedResponse?.registration_status === "pending_owner_approval"
            ? t("payment.screen.pendingOwnerApproval", {
                defaultValue:
                  "Payment confirmed. Team registration is pending owner approval.",
              })
            : t("payment.screen.paymentConfirmed"),
        );

        Alert.alert(
          t("payment.screen.paymentSuccessful"),
          t("payment.screen.pendingOwnerApprovalAlert", {
            defaultValue:
              `Team "{{teamName}}" is now pending owner approval for {{tournamentName}}.`,
            teamName: teamName || captainName || "Team",
            tournamentName: tournamentName || "this tournament",
          }),
          [{ text: t("common.confirm"), onPress: () => navigation.goBack() }],
        );
        return;
      }

      const confirmedResponse = await confirmBookingPayment(
        resolvedPaymentIntentId,
      );

      setConfirmedPayment(confirmedResponse?.payment || null);
      setConfirmedBooking(confirmedResponse?.booking || null);
      setStatusMessage(
        confirmedResponse?.booking?.display_status ||
          t("payment.screen.paymentConfirmed"),
      );

      Alert.alert(
        t("payment.screen.paymentSuccessful"),
        t("payment.screen.bookingConfirmedAlert", {
          defaultValue: `Booking {{id}} is now {{status}}.`,
          id: confirmedResponse?.booking?.id || bookingId,
          status: getStatusLabel(
            confirmedResponse?.booking?.status || "confirmed",
            confirmedResponse?.booking?.display_status,
          ),
        }),
        [{ text: t("common.confirm"), onPress: () => navigation.navigate("Home") }],
      );
    } catch (apiError) {
      const mapped = mapErrorToMessage(apiError);
      setPaymentError(mapped.message);

      if (apiError?.status === 401) {
        navigation.navigate("OwnerLogin");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryCard}>
          <Text style={[styles.title, localizedTextStyle]}>
            {t("payment.screen.bookingSummary")}
          </Text>

          <SummaryRow
            label={`${t("payment.screen.bookingId")}:`}
            value={bookingId || t("payment.history.unavailable")}
            valueDirection="ltr"
          />
          <SummaryRow
            label={`${t("payment.screen.court")}:`}
            value={court || t("payment.history.unavailable")}
          />
          <SummaryRow
            label={`${t("payment.screen.duration")}:`}
            value={`${duration || 0} ${t("booking.form.minutes")}`}
            valueDirection="ltr"
          />
          <SummaryRow
            label={`${t("payment.screen.date")}:`}
            value={formattedBookingDate || t("payment.history.unavailable")}
            valueDirection="ltr"
          />
          <SummaryRow
            label={`${t("payment.screen.time")}:`}
            value={formattedBookingTime || t("payment.history.unavailable")}
            valueDirection="ltr"
          />
          <SummaryRow
            label={`${t("payment.screen.bookingStatus")}:`}
            value={getStatusLabel(
              confirmedBooking?.status || bookingStatus || "pending",
              confirmedBooking?.display_status || bookingDisplayStatus,
            )}
          />
          <SummaryRow
            label={`${t("payment.screen.paymentStatus")}:`}
            value={getPaymentStatusLabel(
              confirmedPayment?.payment_status || paymentSummary?.status || "unknown",
            )}
          />

          <View style={styles.divider} />

          <View
            style={[
              styles.row,
              {
                flexDirection: getFlexDirection(),
              },
            ]}
          >
            <Text style={[styles.totalLabel, localizedTextStyle]}>
              {t("payment.screen.total")}
            </Text>
            <Text
              style={[
                styles.totalValue,
                localizedLtrValueStyle,
              ]}
            >
              {formattedAmount}
            </Text>
          </View>
        </View>

        <View style={styles.inputCard}>
          <Text style={[styles.sectionTitle, localizedTextStyle]}>
            {t("payment.screen.yourEmail")}
          </Text>
          <Text style={[styles.subtitle, localizedTextStyle]}>
            {t("payment.screen.billingEmailHelp")}
          </Text>
          <TextInput
            style={[
              styles.input,
              emailError ? styles.inputError : null,
              {
                textAlign: "left",
                writingDirection: "ltr",
              },
            ]}
            placeholder={t("payment.screen.enterEmail")}
            placeholderTextColor="#9CA3AF"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (emailError) {
                setEmailError("");
              }
            }}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {emailError ? <Text style={[styles.errorText, localizedTextStyle]}>{emailError}</Text> : null}
        </View>

        <View style={styles.cardCard}>
          <Text style={[styles.sectionTitle, localizedTextStyle]}>
            {t("payment.screen.paymentSectionTitle")}
          </Text>
          <Text style={[styles.subtitle, localizedTextStyle]}>
            {t("payment.screen.secureStripeTestMode")}
          </Text>
          {paymentError ? <Text style={[styles.errorText, localizedTextStyle]}>{paymentError}</Text> : null}
          {statusMessage ? (
            <Text style={[styles.successText, localizedTextStyle]}>{statusMessage}</Text>
          ) : null}
        </View>

        <View style={styles.testCardInfo}>
          <Text style={[styles.testCardTitle, localizedTextStyle]}>
            {t("payment.screen.stripeTestCard")}
          </Text>
          <Text style={[styles.testCardText, localizedLtrValueStyle]}>
            4242 4242 4242 4242
          </Text>
          <Text style={[styles.testCardText, localizedTextStyle]}>
            {t("payment.screen.testCardHint")}
          </Text>
          {Array.isArray(nextActions) && nextActions.length > 0 ? (
            <Text style={[styles.testCardText, localizedTextStyle]}>
              {t("payment.screen.nextActions")}: {nextActions.join(", ")}
            </Text>
          ) : null}
        </View>

        <View style={styles.buttonContainer}>
          <Button
            title={
              loading
                ? t("payment.screen.processing")
                : `${t("payment.screen.paySecurely")} ${formattedAmount}`
            }
            onPress={handlePayment}
            disabled={loading || !canSubmitPayment}
            color={PRIMARY_COLOR}
          />
        </View>

        <View style={styles.backButtonContainer}>
          <Button
            title={t("payment.screen.backToBooking")}
            onPress={() => navigation.goBack()}
            disabled={loading}
            color="#6B7280"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 16,
  },
  row: {
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  label: {
    fontSize: 16,
    color: "#6B7280",
  },
  value: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
  },
  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 12,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1F2937",
  },
  totalValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: PRIMARY_COLOR,
  },
  inputCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 12,
  },
  input: {
    backgroundColor: PRIMARY_TINT,
    borderWidth: 1,
    borderColor: PRIMARY_BORDER,
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: "#1F2937",
  },
  inputError: {
    borderColor: "#EF4444",
  },
  errorText: {
    color: "#EF4444",
    fontSize: 12,
    marginTop: 4,
  },
  successText: {
    color: PRIMARY_DARK,
    fontSize: 13,
    marginTop: 6,
  },
  cardCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  testCardInfo: {
    backgroundColor: PRIMARY_TINT,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: PRIMARY_BORDER,
  },
  testCardTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: PRIMARY_DARK,
    marginBottom: 4,
  },
  testCardText: {
    fontSize: 12,
    color: PRIMARY_DARK,
  },
  buttonContainer: {
    marginBottom: 12,
    borderRadius: 8,
    overflow: "hidden",
  },
  backButtonContainer: {
    marginBottom: 30,
    borderRadius: 8,
    overflow: "hidden",
  },
});
