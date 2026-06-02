import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { getBookings } from "../api/bookingsApi";
import {
  formatBackendDateForDisplay,
  formatBackendTimeRangeForDisplay,
  mapBookingResponse,
} from "../utils/bookingMapper";
import { mapErrorToMessage } from "../utils/errorMapper";
import { getStatusLabel } from "../utils/statusMapper";

const PRIMARY_COLOR = "#24a731";
const PRIMARY_DARK = "#1B7F26";
const PRIMARY_TINT = "#EAF8EC";
const PRIMARY_BORDER = "#BFE7C5";

export default function CustomerBookingHistoryScreen({ navigation }) {
  const [bookings, setBookings] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await getBookings();
      const results = Array.isArray(response?.results) ? response.results : [];

      setBookings(results.map(mapBookingResponse));
      setCount(Number(response?.count) || results.length);
    } catch (apiError) {
      setBookings([]);
      setCount(0);
      setError(mapErrorToMessage(apiError).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadBookings();
    }, [loadBookings]),
  );

  const renderBookingItem = ({ item }) => {
    const paymentStatusLabel = getStatusLabel(item.payment_summary?.status);
    const timeLabel = formatBackendTimeRangeForDisplay({
      start_time: item.start_time,
      end_time: item.end_time,
    });

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() =>
          navigation.navigate("CustomerBookingDetail", {
            bookingId: item.booking_id,
          })
        }
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Booking #{item.booking_id}</Text>
          <Text style={styles.statusBadge}>
            {getStatusLabel(item.status, item.display_status)}
          </Text>
        </View>

        <Text style={styles.primaryText}>{item.gym_name || "Gym unavailable"}</Text>
        <Text style={styles.secondaryText}>{item.field_name || "Field unavailable"}</Text>
        <Text style={styles.detailText}>
          {formatBackendDateForDisplay(item.booking_date) || item.booking_date}
        </Text>
        <Text style={styles.detailText}>{timeLabel || "Time unavailable"}</Text>
        <Text style={styles.detailText}>Payment: {paymentStatusLabel}</Text>
        <Text style={styles.detailText}>
          Next actions: {item.next_actions?.length ? item.next_actions.join(", ") : "None"}
        </Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centeredState}>
        <ActivityIndicator size="large" color={PRIMARY_COLOR} />
        <Text style={styles.stateText}>Loading booking history...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centeredState}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.actionButton} onPress={loadBookings}>
          <Text style={styles.actionButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (bookings.length === 0) {
    return (
      <View style={styles.centeredState}>
        <Text style={styles.stateTitle}>No bookings yet</Text>
        <Text style={styles.stateText}>Your booking history will appear here.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Booking History</Text>
        <Text style={styles.summaryText}>Recent bookings: {bookings.length}</Text>
        {count > bookings.length ? (
          <Text style={styles.summaryText}>Total records on server: {count}</Text>
        ) : null}
      </View>

      <FlatList
        data={bookings}
        keyExtractor={(item) => String(item.booking_id)}
        renderItem={renderBookingItem}
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
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 6,
  },
  summaryText: {
    fontSize: 14,
    color: "#6B7280",
  },
  listContent: {
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
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#1F2937",
  },
  statusBadge: {
    fontSize: 13,
    fontWeight: "600",
    color: PRIMARY_DARK,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 4,
  },
  secondaryText: {
    fontSize: 14,
    color: "#4B5563",
    marginBottom: 8,
  },
  detailText: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 4,
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
