import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { getPaymentHistory } from "../api/paymentsApi";
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

export default function CustomerPaymentHistoryScreen() {
  const { t } = useTranslation();
  const rtl = isRTL();
  const localizedTextStyle = {
    textAlign: getTextAlign(),
    writingDirection: getWritingDirection(),
  };
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await getPaymentHistory();
      setPayments(
        Array.isArray(response?.booking_payments) ? response.booking_payments : [],
      );
    } catch (apiError) {
      setPayments([]);
      setError(mapErrorToMessage(apiError).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPayments();
    }, [loadPayments]),
  );

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

  const PaymentInfoRow = ({ label, value, valueDirection = "auto" }) => (
    <View
      style={[
        styles.paymentRow,
        {
          flexDirection: getFlexDirection(),
        },
      ]}
    >
      <Text style={[styles.paymentLabel, localizedTextStyle]}>{label}</Text>

      <Text
        style={[
          styles.paymentValue,
          {
            textAlign: rtl ? "left" : "right",
            writingDirection: valueDirection === "ltr" ? "ltr" : "auto",
          },
        ]}
      >
        {value}
      </Text>
    </View>
  );

  const renderPaymentItem = ({ item }) => (
    <View style={styles.card}>
      <View style={[styles.cardHeader, { flexDirection: getFlexDirection() }]}>
        <Text style={[styles.cardTitle, localizedTextStyle]}>
          {t("payment.history.paymentNumber", { id: item.booking_payment_id })}
        </Text>
        <Text style={[styles.statusText, localizedTextStyle]}>
          {getPaymentStatusLabel(item.payment_status)}
        </Text>
      </View>

      <Text
        style={[
          styles.primaryText,
          {
            textAlign: rtl ? "left" : "right",
            writingDirection: "ltr",
          },
        ]}
      >
        {formatCurrency(item.amount)}
      </Text>
      <PaymentInfoRow
        label={`${t("payment.history.gym")}:`}
        value={item.booking_details?.gym_name || t("payment.history.gymUnavailable")}
      />
      <PaymentInfoRow
        label={`${t("payment.history.field")}:`}
        value={
          item.booking_details?.field_name || t("payment.history.fieldUnavailable")
        }
      />
      <PaymentInfoRow
        label={`${t("payment.history.bookingDate")}:`}
        value={
          formatDate(item.booking_details?.booking_date) ||
          item.booking_details?.booking_date ||
          t("payment.history.unavailable")
        }
        valueDirection="ltr"
      />
      <PaymentInfoRow
        label={`${t("payment.history.time")}:`}
        value={`${formatTime(item.booking_details?.start_time) || item.booking_details?.start_time || "-"} - ${
          formatTime(item.booking_details?.end_time) || item.booking_details?.end_time || "-"
        }`}
        valueDirection="ltr"
      />
      <PaymentInfoRow
        label={`${t("payment.history.bookingStatus")}:`}
        value={getStatusLabel(
          item.booking_status,
          item.booking_display_status || t("payment.history.unavailable"),
        )}
      />
      <Text style={[styles.detailText, localizedTextStyle]}>
        {t("payment.history.paidOn", {
          date:
            formatDate(item.created_at) ||
            item.created_at ||
            t("payment.history.unavailable"),
        })}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centeredState}>
        <ActivityIndicator size="large" color={PRIMARY_COLOR} />
        <Text style={[styles.stateText, localizedTextStyle]}>
          {t("payment.history.loading")}
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centeredState}>
        <Text style={[styles.stateTitle, localizedTextStyle]}>
          {t("payment.history.loadError")}
        </Text>
        <Text style={[styles.errorText, localizedTextStyle]}>{error}</Text>
        <TouchableOpacity style={styles.actionButton} onPress={loadPayments}>
          <Text style={styles.actionButtonText}>{t("payment.history.retry")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (payments.length === 0) {
    return (
      <View style={styles.centeredState}>
        <Text style={[styles.stateTitle, localizedTextStyle]}>
          {t("payment.history.noPaymentsYet")}
        </Text>
        <Text style={[styles.stateText, localizedTextStyle]}>
          {t("payment.history.historyAppearsHere")}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.screenTitle, localizedTextStyle]}>
        {t("payment.history.title")}
      </Text>
      <FlatList
        data={payments}
        keyExtractor={(item) => String(item.booking_payment_id)}
        renderItem={renderPaymentItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    padding: 16,
  },
  listContent: {
    paddingBottom: 24,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 16,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  cardHeader: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#1F2937",
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
    color: PRIMARY_DARK,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 8,
  },
  detailText: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 4,
  },
  paymentRow: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  paymentLabel: {
    flex: 1,
    fontSize: 14,
    color: "#6B7280",
  },
  paymentValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
  },
  centeredState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    padding: 24,
  },
  stateTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 8,
  },
  stateText: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 8,
  },
  errorText: {
    fontSize: 15,
    color: "#DC2626",
    textAlign: "center",
    marginBottom: 16,
  },
  actionButton: {
    backgroundColor: PRIMARY_COLOR,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  actionButtonText: {
    color: "#000000",
    fontSize: 15,
    fontWeight: "600",
  },
});
