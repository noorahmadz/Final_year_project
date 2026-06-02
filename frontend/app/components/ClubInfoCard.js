import { FontAwesome, Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useGym } from "../context/GymContext";
import {
  getEndMargin,
  getFlexDirection,
  getStartMargin,
  getStartPosition,
  getTextAlign,
  getWritingDirection,
} from "../utils/rtl";

export default function ClubInfoCard({ navigation, gym }) {
  const { t } = useTranslation();
  const { currentGym } = useGym();
  const selectedGym = gym || currentGym;
  const localizedTextStyle = {
    textAlign: getTextAlign(),
    writingDirection: getWritingDirection(),
  };
  const localizedLtrValueStyle = {
    textAlign: getTextAlign(),
    writingDirection: "ltr",
  };

  const [activeTab, setActiveTab] = useState("timings");
  const [rating, setRating] = useState(selectedGym?.rating || 0);
  const [selectedCourt, setSelectedCourt] = useState(null);

  const animation = useRef(new Animated.Value(0)).current;
  const courts = selectedGym?.courts?.map((court) => court.name) || [
    t("ownerDashboard.courts.court"),
  ];

  const handleCourtPress = (court) => {
    setSelectedCourt(court);

    if (selectedGym?.id || selectedGym?.gymId) {
      navigation?.navigate("ServiceDetails", {
        gymId: selectedGym.id || selectedGym.gymId,
      });
    }
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
    const stars = [];

    for (let i = 1; i <= 5; i += 1) {
      stars.push(
        <TouchableOpacity key={i} onPress={() => setRating(i)}>
          <FontAwesome
            name={i <= rating ? "star" : "star-o"}
            size={20}
            color="#FFD700"
            style={getEndMargin(5)}
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

  const getLocalizedDayLabel = (day) => {
    const dayKeyMap = {
      Sun: "common.time.sun",
      Mon: "common.time.mon",
      Tue: "common.time.tue",
      Wed: "common.time.wed",
      Thu: "common.time.thu",
      Fri: "common.time.fri",
      Sat: "common.time.sat",
    };

    return t(dayKeyMap[day] || "", { defaultValue: day });
  };

  const todayTiming = getTodayTiming();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { flexDirection: getFlexDirection() }]}>
        <View>
          <Text style={[styles.title, localizedTextStyle]}>
            {selectedGym?.name || t("ownerDashboard.gyms.gymName")}
          </Text>
          <View style={[styles.ratingRow, { flexDirection: getFlexDirection() }]}>
            {renderStars()}
            <Text style={[styles.ratingText, getStartMargin(5), localizedLtrValueStyle]}>
              ({rating})
            </Text>
          </View>
        </View>
        <View style={[styles.icons, { flexDirection: getFlexDirection() }]}>
          {selectedGym?.whatsapp ? (
            <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
          ) : null}
          {selectedGym?.phone ? (
            <Ionicons name="call" size={24} color="#2563EB" />
          ) : null}
          {selectedGym?.address ? (
            <MaterialIcons name="location-on" size={24} color="#EF4444" />
          ) : null}
        </View>
      </View>

      <View style={[styles.tabContainer, { flexDirection: getFlexDirection() }]}>
        <Animated.View
          style={[styles.tabIndicator, getStartPosition(indicatorPosition)]}
        />
        <TouchableOpacity
          style={styles.tab}
          onPress={() => changeTab("timings")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "timings" && styles.activeTabText,
              localizedTextStyle,
            ]}
          >
            {t("gyms.details.timingsTab", { defaultValue: "Timings" })}
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
              localizedTextStyle,
            ]}
          >
            {t("gyms.details.detailsTab", { defaultValue: "Details" })}
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === "timings" ? (
        <ScrollView style={{ marginTop: 30 }}>
          <Text style={[styles.selectText, localizedTextStyle]}>
            {t("gyms.details.selectCourt")}
          </Text>
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
                    localizedTextStyle,
                  ]}
                >
                  {court}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.infoText, localizedTextStyle]}>
            {t("gyms.details.selectCourtHint", {
              defaultValue: "Select a court to view categories",
            })}
          </Text>
        </ScrollView>
      ) : (
        <View style={styles.detailsContainer}>
          <Text style={[styles.detailsTitle, localizedTextStyle]}>
            {t("gyms.details.gymDetailsTitle", {
              defaultValue: "Gym Details",
            })}
          </Text>
          {selectedGym?.description ? (
            <Text style={[styles.detailsText, localizedTextStyle]}>
              {selectedGym.description}
            </Text>
          ) : null}
          <Text style={[styles.detailsText, localizedTextStyle]}>
            {t("gyms.details.openingHours")}:{" "}
            <Text style={localizedLtrValueStyle}>
              {todayTiming.open} - {todayTiming.close}
            </Text>
          </Text>
          {selectedGym?.address ? (
            <Text style={[styles.detailsText, localizedTextStyle]}>
              {t("gyms.details.address", { defaultValue: "Address" })}:{" "}
              {selectedGym.address}, {selectedGym.city}
            </Text>
          ) : null}
          {selectedGym?.phone ? (
            <Text style={[styles.detailsText, localizedTextStyle]}>
              {t("gyms.details.phone", { defaultValue: "Phone" })}:{" "}
              <Text style={localizedLtrValueStyle}>{selectedGym.phone}</Text>
            </Text>
          ) : null}
          {selectedGym?.timing ? (
            <View style={styles.weeklyTiming}>
              <Text style={[styles.weeklyTitle, localizedTextStyle]}>
                {t("gyms.details.weeklyHours", { defaultValue: "Weekly Hours" })}
              </Text>
              {Object.entries(selectedGym.timing).map(([day, time]) => (
                <View
                  key={day}
                  style={[styles.timingRow, { flexDirection: getFlexDirection() }]}
                >
                  <Text style={[styles.timingDay, localizedTextStyle]}>
                    {getLocalizedDayLabel(day)}
                  </Text>
                  <Text style={[styles.timingTime, localizedLtrValueStyle]}>
                    {time.open} - {time.close}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 20 },
  header: {
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 26, fontWeight: "bold" },
  ratingRow: { alignItems: "center", marginTop: 5 },
  ratingText: { color: "#999" },
  icons: { gap: 15 },
  tabContainer: {
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
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  timingDay: { fontSize: 14, fontWeight: "600", color: "#1F2937" },
  timingTime: { fontSize: 14, color: "#6B7280" },
});
