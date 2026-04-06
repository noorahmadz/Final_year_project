import { useEffect, useState } from "react";
import {
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useGym } from "../context/GymContext";

export default function ServiceDetails({ navigation, route }) {
  // Get gym from route params or use current gym from context
  const { currentGym, getActiveDiscounts } = useGym();
  const gym = route?.params?.gym || currentGym;

  const [selectedCourt, setSelectedCourt] = useState(null);
  const [selectedDuration, setSelectedDuration] = useState(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  // Get courts from gym data
  const courts = gym?.courts || [];

  // Set dynamic date and time on component mount
  useEffect(() => {
    const now = new Date();

    // Format date as "D Month YYYY" (e.g., "6 March 2026")
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const formattedDate = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
    setDate(formattedDate);

    // Format time as "H:MM A" (e.g., "1:30 AM")
    let hours = now.getHours();
    const minutes = now.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    const formattedTime = `${hours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
    setTime(formattedTime);
  }, []);

  if (!gym) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No gym selected</Text>
        <Button title="Go Back" onPress={() => navigation.goBack()} />
      </View>
    );
  }

  const handleCourtSelect = (court) => {
    setSelectedCourt(court);
    setSelectedDuration(null); // Reset duration when court changes
  };

  const handleDurationSelect = (duration) => {
    setSelectedDuration(duration);
  };

  const handleConfirm = () => {
    if (!selectedCourt || !selectedDuration) return;

    // Calculate price based on duration
    let price = 0;
    if (selectedDuration === 30) {
      price = selectedCourt.price30min || 0;
    } else if (selectedDuration === 60) {
      price = selectedCourt.price60min || 0;
    } else if (selectedDuration === 90) {
      price = selectedCourt.price90min || 0;
    }

    // Apply discount if available
    const activeDiscounts = getActiveDiscounts(gym.id);
    const percentageDiscount = activeDiscounts.find(
      (d) => d.type === "percentage",
    );
    let discountedPrice = price;
    let appliedDiscount = null;
    if (percentageDiscount) {
      discountedPrice = price * (1 - percentageDiscount.value / 100);
      appliedDiscount = percentageDiscount;
    }

    // Get price intervals - handle both object format (from OwnerDashboard) and array format (from mockData)
    let priceIntervalsForDuration = null;
    if (selectedCourt.priceIntervals) {
      if (Array.isArray(selectedCourt.priceIntervals)) {
        // Old format - flat array
        priceIntervalsForDuration = selectedCourt.priceIntervals;
      } else if (typeof selectedCourt.priceIntervals === "object") {
        // New format - object with duration keys
        priceIntervalsForDuration =
          selectedCourt.priceIntervals[selectedDuration] || null;
      }
    }

    navigation?.navigate("Time", {
      gymId: gym.id,
      gymName: gym.name,
      court: selectedCourt.name,
      courtId: selectedCourt.id,
      duration: selectedDuration,
      date: date,
      time: time,
      price: Math.round(discountedPrice), // Round to nearest integer
      originalPrice: price,
      appliedDiscount: appliedDiscount,
      priceIntervals: priceIntervalsForDuration,
    });
  };

  return (
    <ScrollView style={styles.container}>
      {/* Gym Header */}
      <View style={styles.gymHeader}>
        <Text style={styles.gymName}> Gym_name:{gym.name}</Text>
        <Text style={styles.gymLocation}>
          {" "}
          {gym.city} Location:{gym.address}
        </Text>
      </View>

      {/* Court Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Select Court</Text>

        {courts.length > 0 ? (
          <View style={styles.courtGrid}>
            {courts.map((court, index) => (
              <TouchableOpacity
                key={court.id || index}
                style={[
                  styles.courtButton,
                  selectedCourt?.id === court.id && styles.courtButtonSelected,
                ]}
                onPress={() => handleCourtSelect(court)}
              >
                <Text
                  style={[
                    styles.courtText,
                    selectedCourt?.id === court.id && styles.courtTextSelected,
                  ]}
                >
                  {court.name}
                </Text>
                {court.price30min && (
                  <Text style={styles.courtPrice}>
                    From {court.price30min} AFG
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.emptyCourts}>
            <Text style={styles.emptyText}>No courts available</Text>
            <Text style={styles.emptySubtext}>
              Contact the gym for more information
            </Text>
          </View>
        )}
      </View>

      {/* Duration Selection */}
      {selectedCourt && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Duration</Text>

          <View style={styles.durationContainer}>
            <TouchableOpacity
              style={[
                styles.durationButton,
                selectedDuration === 30 && styles.durationButtonSelected,
              ]}
              onPress={() => handleDurationSelect(30)}
            >
              <Text
                style={[
                  styles.durationText,
                  selectedDuration === 30 && styles.durationTextSelected,
                ]}
              >
                30 Min
              </Text>
              {selectedCourt.price30min && (
                <Text style={styles.durationPrice}>
                  {selectedCourt.price30min} AFG
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.durationButton,
                selectedDuration === 60 && styles.durationButtonSelected,
              ]}
              onPress={() => handleDurationSelect(60)}
            >
              <Text
                style={[
                  styles.durationText,
                  selectedDuration === 60 && styles.durationTextSelected,
                ]}
              >
                60 Min
              </Text>
              {selectedCourt.price60min && (
                <Text style={styles.durationPrice}>
                  {selectedCourt.price60min} AFG
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.durationButton,
                selectedDuration === 90 && styles.durationButtonSelected,
              ]}
              onPress={() => handleDurationSelect(90)}
            >
              <Text
                style={[
                  styles.durationText,
                  selectedDuration === 90 && styles.durationTextSelected,
                ]}
              >
                90 Min
              </Text>
              {selectedCourt.price90min && (
                <Text style={styles.durationPrice}>
                  {selectedCourt.price90min} AFG
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Confirm Button */}
      {selectedCourt && selectedDuration && (
        <View style={styles.confirmSection}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Booking Summary</Text>

            <View style={styles.detailCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Court</Text>
                <Text style={styles.summaryValue}>{selectedCourt.name}</Text>
              </View>
            </View>

            <View style={styles.detailCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Duration</Text>
                <Text style={styles.summaryValue}>
                  {selectedDuration} minutes
                </Text>
              </View>
            </View>

            <View style={styles.detailCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Date</Text>
                <Text style={styles.summaryValue}>{date}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            {(() => {
              const activeDiscounts = getActiveDiscounts(gym.id);
              const percentageDiscount = activeDiscounts.find(
                (d) => d.type === "percentage",
              );
              const originalPrice =
                selectedDuration === 30
                  ? selectedCourt.price30min
                  : selectedDuration === 60
                    ? selectedCourt.price60min
                    : selectedCourt.price90min;
              const discountedPrice = percentageDiscount
                ? originalPrice * (1 - percentageDiscount.value / 100)
                : originalPrice;

              return (
                <>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Original Price</Text>
                    <Text style={styles.priceValue}>{originalPrice} AFG</Text>
                  </View>
                  {percentageDiscount && (
                    <View style={styles.priceRow}>
                      <Text style={styles.discountLabel}>
                        Discount ({percentageDiscount.value}% off)
                      </Text>
                      <Text style={styles.discountValue}>
                        -
                        {Math.round(
                          (originalPrice * percentageDiscount.value) / 100,
                        )}{" "}
                        AFG
                      </Text>
                    </View>
                  )}
                  <View style={styles.priceRow}>
                    <Text style={styles.totalLabel}>Total Price</Text>
                    <Text style={styles.totalValue}>
                      {Math.round(discountedPrice)} AFG
                    </Text>
                  </View>
                </>
              );
            })()}
          </View>

          <TouchableOpacity
            style={[styles.continueButton, { backgroundColor: "#48bd31" }]}
            onPress={handleConfirm}
          >
            <Text style={styles.continueButtonText}>
              Continue to Time Selection
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Back Button */}
      <View style={styles.backSection}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: "#48bd31" }]}
          onPress={() => navigation.navigate("Home")}
        >
          <Text style={styles.backButtonText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  gymHeader: {
    padding: 20,
    backgroundColor: "#48bd31",
  },
  gymName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#000000",
  },
  gymLocation: {
    fontSize: 14,
    color: "#000000",
    marginTop: 4,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 16,
  },
  courtGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  courtButton: {
    width: "47%",
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
  },
  courtButtonSelected: {
    backgroundColor: "#EEF2FF",
    borderColor: "#48bd31",
  },
  courtText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1F2937",
  },
  courtTextSelected: {
    color: "#000000",
  },
  courtPrice: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
  },
  durationContainer: {
    flexDirection: "row",
    gap: 12,
  },
  durationButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
  },
  durationButtonSelected: {
    backgroundColor: "#EEF2FF",
    borderColor: "#48bd31",
  },
  durationText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
  },
  durationTextSelected: {
    color: "#000000",
  },
  durationPrice: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
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
    color: "black",
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
    color: "#1F2937",
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
  discountLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#10B981",
  },
  discountValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#10B981",
  },
  totalLabel: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1F2937",
  },
  totalValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#48bd31",
  },
  summaryText: {
    fontSize: 16,
    color: "#6B7280",
    marginBottom: 4,
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
    color: "black",
    fontSize: 16,
    fontWeight: "600",
  },
  errorText: {
    fontSize: 18,
    color: "#EF4444",
    textAlign: "center",
    marginBottom: 20,
  },
});
