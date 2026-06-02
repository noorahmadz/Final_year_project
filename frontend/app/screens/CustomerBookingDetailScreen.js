import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { getBookingDetail } from "../api/bookingsApi";
import {
  formatBackendDateForDisplay,
  formatBackendTimeRangeForDisplay,
  mapBookingResponse,
} from "../utils/bookingMapper";
import { mapErrorToMessage } from "../utils/errorMapper";
import { getStatusLabel } from "../utils/statusMapper";

const PRIMARY_COLOR = "#24a731";

const formatBoolean = (value) => (value ? "Yes" : "No");

export default function CustomerBookingDetailScreen({ route }) {
  const bookingId = route?.params?.bookingId;
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadBookingDetail = useCallback(async () => {
    if (!bookingId) {
      setBooking(null);
      setError("Missing booking ID.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await getBookingDetail(bookingId);
      setBooking(mapBookingResponse(response));
    } catch (apiError) {
      setBooking(null);
      setError(mapErrorToMessage(apiError).message);
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useFocusEffect(
    useCallback(() => {
      loadBookingDetail();
    }, [loadBookingDetail]),
  );

  if (loading) {
    return (
      <View style={styles.centeredState}>
        <ActivityIndicator size="large" color={PRIMARY_COLOR} />
        <Text style={styles.stateText}>Loading booking details...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centeredState}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.actionButton} onPress={loadBookingDetail}>
          <Text style={styles.actionButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={styles.centeredState}>
        <Text style={styles.stateTitle}>Booking not available</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>Booking #{booking.booking_id}</Text>
        <Text style={styles.gymName}>{booking.gym_name || "Gym unavailable"}</Text>
        <Text style={styles.fieldName}>{booking.field_name || "Field unavailable"}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Schedule</Text>
        <Text style={styles.detailText}>
          Date: {formatBackendDateForDisplay(booking.booking_date) || booking.booking_date}
        </Text>
        <Text style={styles.detailText}>
          Time:
          {" "}
          {formatBackendTimeRangeForDisplay({
            start_time: booking.start_time,
            end_time: booking.end_time,
          }) || "Unavailable"}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Status</Text>
        <Text style={styles.detailText}>
          Booking status: {getStatusLabel(booking.status, booking.display_status)}
        </Text>
        <Text style={styles.detailText}>
          Lifecycle state: {getStatusLabel(booking.lifecycle_state)}
        </Text>
        <Text style={styles.detailText}>Can pay: {formatBoolean(booking.can_pay)}</Text>
        <Text style={styles.detailText}>Can cancel: {formatBoolean(booking.can_cancel)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Payment Summary</Text>
        <Text style={styles.detailText}>
          Status: {getStatusLabel(booking.payment_summary?.status)}
        </Text>
        <Text style={styles.detailText}>
          Amount: {booking.payment_summary?.amount || "-"}
          {" "}
          {booking.payment_summary?.currency || ""}
        </Text>
        <Text style={styles.detailText}>
          Can retry: {formatBoolean(booking.payment_summary?.can_retry)}
        </Text>
        <Text style={styles.detailText}>
          Paid at: {booking.payment_summary?.paid_at || "Not paid yet"}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Next Actions</Text>
        <Text style={styles.detailText}>
          {booking.next_actions?.length ? booking.next_actions.join(", ") : "None"}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  content: {
    padding: 16,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  title: {
    fontSize: 21,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 8,
  },
  gymName: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 4,
  },
  fieldName: {
    fontSize: 15,
    color: "#4B5563",
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 10,
  },
  detailText: {
    fontSize: 15,
    color: "#4B5563",
    marginBottom: 6,
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
