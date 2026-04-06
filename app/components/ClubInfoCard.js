import { FontAwesome, Ionicons, MaterialIcons } from "@expo/vector-icons";
import ServiceDetails from "./ServiceDetails";

import { useRef, useState } from "react";
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useGym } from "../context/GymContext";

export default function ClubInfoCard({ navigation, gym }) {
  const { currentGym } = useGym();

  // Use provided gym or fall back to current gym from context
  const selectedGym = gym || currentGym;

  const [activeTab, setActiveTab] = useState("timings");
  const [rating, setRating] = useState(selectedGym?.rating || 0);
  const [selectedCourt, setSelectedCourt] = useState(null);
  const [showServiceDetails, setShowServiceDetails] = useState(false);

  const animation = useRef(new Animated.Value(0)).current;

  // Get courts from gym data
  const courts = selectedGym?.courts?.map((c) => c.name) || ["Court 1"];

  const handleCourtPress = (court) => {
    setSelectedCourt(court);
    setShowServiceDetails(true);
  };

  const handleBackToCourts = () => {
    setShowServiceDetails(false);
    setSelectedCourt(null);
  };

  const changeTab = (tab) => {
    setActiveTab(tab);
    Animated.timing(animation, {
      toValue: tab === "timings" ? 0 : 1,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  const indicatorPosition = animation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "50%"],
  });

  const renderStars = () => {
    let stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <TouchableOpacity key={i} onPress={() => setRating(i)}>
          <FontAwesome
            name={i <= rating ? "star" : "star-o"}
            size={20}
            color="#FFD700"
            style={{ marginRight: 5 }}
          />
        </TouchableOpacity>,
      );
    }
    return stars;
  };

  const getTodayTiming = () => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const today = days[new Date().getDay()];
    const timing = selectedGym?.timing?.[today];
    return timing || { open: "6:00 AM", close: "10:00 PM" };
  };

  const todayTiming = getTodayTiming();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{selectedGym?.name || "Gym"}</Text>
          <View style={styles.ratingRow}>
            {renderStars()}
            <Text style={styles.ratingText}>({rating})</Text>
          </View>
        </View>
        <View style={styles.icons}>
          {selectedGym?.whatsapp && (
            <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
          )}
          {selectedGym?.phone && (
            <Ionicons name="call" size={24} color="#2563EB" />
          )}
          {selectedGym?.address && (
            <MaterialIcons name="location-on" size={24} color="#EF4444" />
          )}
        </View>
      </View>

      <View style={styles.tabContainer}>
        <Animated.View
          style={[styles.tabIndicator, { left: indicatorPosition }]}
        />
        <TouchableOpacity
          style={styles.tab}
          onPress={() => changeTab("timings")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "timings" && styles.activeTabText,
            ]}
          >
            Timings
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tab}
          onPress={() => changeTab("details")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "details" && styles.activeTabText,
            ]}
          >
            Details
          </Text>
        </TouchableOpacity>
      </View>

      {showServiceDetails ? (
        <View style={{ marginTop: 20 }}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBackToCourts}
          >
            <Text style={styles.backButtonText}>← Back to Courts</Text>
          </TouchableOpacity>
          <ServiceDetails
            navigation={navigation}
            selectedCourt={selectedCourt}
          />
        </View>
      ) : activeTab === "timings" ? (
        <ScrollView style={{ marginTop: 30 }}>
          <Text style={styles.selectText}>Select Court</Text>
          <View style={styles.courtContainer}>
            {courts.map((court, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.courtButton,
                  selectedCourt === court && styles.selectedCourt,
                ]}
                onPress={() => handleCourtPress(court)}
              >
                <Text
                  style={[
                    styles.courtText,
                    selectedCourt === court && { color: "white" },
                  ]}
                >
                  {court}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.infoText}>Select a court to view categories</Text>
        </ScrollView>
      ) : (
        <View style={styles.detailsContainer}>
          <Text style={styles.detailsTitle}>Club Details</Text>
          {selectedGym?.description && (
            <Text style={styles.detailsText}>{selectedGym.description}</Text>
          )}
          <Text style={styles.detailsText}>
            Opening Hours: {todayTiming.open} - {todayTiming.close}
          </Text>
          {selectedGym?.address && (
            <Text style={styles.detailsText}>
              Address: {selectedGym.address}, {selectedGym.city}
            </Text>
          )}
          {selectedGym?.phone && (
            <Text style={styles.detailsText}>Phone: {selectedGym.phone}</Text>
          )}
          {selectedGym?.timing && (
            <View style={styles.weeklyTiming}>
              <Text style={styles.weeklyTitle}>Weekly Hours</Text>
              {Object.entries(selectedGym.timing).map(([day, time]) => (
                <View key={day} style={styles.timingRow}>
                  <Text style={styles.timingDay}>{day}</Text>
                  <Text style={styles.timingTime}>
                    {time.open} - {time.close}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 26, fontWeight: "bold" },
  ratingRow: { flexDirection: "row", alignItems: "center", marginTop: 5 },
  ratingText: { marginLeft: 5, color: "#999" },
  icons: { flexDirection: "row", gap: 15 },
  tabContainer: {
    flexDirection: "row",
    marginTop: 30,
    position: "relative",
    borderBottomWidth: 1,
    borderColor: "#eee",
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabText: { fontSize: 18, color: "#888" },
  activeTabText: { color: "#000", fontWeight: "bold" },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    width: "50%",
    height: 3,
    backgroundColor: "black",
  },
  selectText: {
    fontSize: 22,
    textAlign: "center",
    marginBottom: 20,
    color: "#444",
  },
  courtContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 15,
  },
  courtButton: {
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 14,
    backgroundColor: "#fafafa",
  },
  selectedCourt: { backgroundColor: "#111", borderColor: "#111" },
  courtText: { fontSize: 18, fontWeight: "600" },
  infoText: { marginTop: 40, textAlign: "center", color: "#aaa" },
  detailsContainer: { marginTop: 30 },
  detailsTitle: { fontSize: 22, fontWeight: "bold", marginBottom: 15 },
  detailsText: {
    fontSize: 16,
    color: "#555",
    marginBottom: 10,
    lineHeight: 22,
  },
  weeklyTiming: {
    marginTop: 20,
    backgroundColor: "#F9FAFB",
    padding: 16,
    borderRadius: 12,
  },
  weeklyTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 12 },
  timingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  timingDay: { fontSize: 14, fontWeight: "600", color: "#1F2937" },
  timingTime: { fontSize: 14, color: "#6B7280" },
  backButton: { marginBottom: 20, paddingVertical: 10 },
  backButtonText: { fontSize: 16, color: "#2563EB", fontWeight: "600" },
});
