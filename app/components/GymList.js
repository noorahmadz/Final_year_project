import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  Image,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { useGym } from "../context/GymContext";

if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental &&
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Individual Gym Card Component
const GymCard = ({ gym, navigation, onSelectGym }) => {
  const [expanded, setExpanded] = useState(false);

  const toggleDetails = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
    if (!expanded) {
      onSelectGym(gym);
    }
  };

  // Get the first court's lowest price for display
  const getLowestPrice = () => {
    if (gym.courts && gym.courts.length > 0) {
      const prices = gym.courts.map((c) => c.price30min || c.price60min / 2);
      return Math.min(...prices);
    }
    return 1500; // Default price
  };

  return (
    <View style={styles.card}>
      {/* Gym Image & Basic Info */}
      <View style={styles.cardHeader}>
        <View style={styles.imageContainer}>
          {gym.image ? (
            <Image
              source={
                typeof gym.image === "string" ? { uri: gym.image } : gym.image
              }
              style={styles.image}
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="fitness" size={40} color="#2563EB" />
            </View>
          )}
        </View>

        <View style={styles.basicInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.gymName}>{gym.name}</Text>
            {(() => {
              const hasDiscounts = gym.discounts && gym.discounts.length > 0;
              return (
                hasDiscounts && (
                  <View style={styles.discountBadge}>
                    <Ionicons name="pricetag" size={12} color="#fff" />
                    <Text style={styles.discountBadgeText}>
                      {gym.discounts.length > 1
                        ? `${gym.discounts.length} Offers`
                        : "Discount"}
                    </Text>
                  </View>
                )
              );
            })()}
          </View>
          <Text style={styles.location}>
            <Ionicons name="location" size={12} color="#666" /> {gym.city},{" "}
            {gym.address}
          </Text>
          <Text style={styles.price}>Starting from {getLowestPrice()} AFG</Text>
          {gym.courts && (
            <Text style={styles.courtsCount}>
              <Ionicons name="tennisball" size={12} color="#2563EB" />{" "}
              {gym.courts.length} Court{gym.courts.length !== 1 ? "s" : ""}
            </Text>
          )}
        </View>
      </View>

      {/* Expanded Details */}
      {expanded && (
        <View style={styles.detailsContainer}>
          {/* Description */}
          {gym.description && (
            <Text style={styles.description} numberOfLines={2}>
              {gym.description}
            </Text>
          )}

          {/* Quick Info Row */}
          <View style={styles.quickInfoRow}>
            <TouchableOpacity
              style={styles.infoButton}
              onPress={() => {
                // Could open phone dialer
              }}
            >
              <Ionicons name="call-outline" size={20} color="#2563EB" />
              <Text style={styles.infoText}>Call</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.infoButton}
              onPress={() => {
                // Could open WhatsApp
              }}
            >
              <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
              <Text style={styles.infoText}>WhatsApp</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.infoButton}
              onPress={() => {
                // Could open maps
              }}
            >
              <Ionicons name="navigate-outline" size={20} color="#EF4444" />
              <Text style={styles.infoText}>Directions</Text>
            </TouchableOpacity>
          </View>

          {/* Today's Timing */}
          {/* {gym.timing && (
            <View style={styles.timingContainer}>
              <Text style={styles.timingLabel}>Today's Hours:</Text>
              <Text style={styles.timingValue}>
                {gym.timing["Mon"]?.open || "6:00 AM"} -{" "}
                {gym.timing["Mon"]?.close || "10:00 PM"}
              </Text>
            </View>
          )} */}

          {/* Discount Information */}
          {(() => {
            const allDiscounts = gym.discounts || [];
            const percentageDiscounts = allDiscounts.filter(
              (d) => d.type === "percentage" && d.value > 0,
            );
            if (percentageDiscounts.length > 0) {
              return (
                <View style={styles.discountContainer}>
                  <Text style={styles.sectionTitle}>Discount Information</Text>
                  {percentageDiscounts.map((discount, index) => {
                    const isActive =
                      discount.validFrom &&
                      discount.validTo &&
                      new Date() >= new Date(discount.validFrom) &&
                      new Date() <= new Date(discount.validTo);
                    return (
                      <View key={index} style={styles.discountItem}>
                        <Text style={styles.inputLabel}>Description</Text>
                        <Text style={styles.discountText}>
                          {discount.description} - {discount.value}% off{" "}
                          {!isActive ? "(Not Active)" : ""}
                        </Text>
                        <Text style={styles.inputLabel}>Valid From</Text>
                        <Text style={styles.discountText}>
                          {discount.validFrom
                            ? new Date(discount.validFrom).toLocaleDateString()
                            : "Not set"}
                        </Text>
                        <Text style={styles.inputLabel}>Valid To</Text>
                        <Text style={styles.discountText}>
                          {discount.validTo
                            ? new Date(discount.validTo).toLocaleDateString()
                            : "Not set"}
                        </Text>
                        {discount.courts && discount.courts.length > 0 && (
                          <>
                            <Text style={styles.inputLabel}>
                              Applicable Courts
                            </Text>
                            <Text style={styles.discountText}>
                              Specific courts
                            </Text>
                          </>
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            }
            return null;
          })()}

          {/* Book Now Button */}
          <TouchableOpacity
            style={styles.bookButton}
            onPress={() => navigation.navigate("ServiceDetails", { gym })}
          >
            <Text style={styles.bookButtonText}>Book Now</Text>
            <Ionicons name="arrow-forward" size={20} color="black" />
          </TouchableOpacity>
        </View>
      )}

      {/* Toggle Button */}
      <TouchableOpacity
        style={[
          styles.toggleButton,
          expanded ? styles.secondary : styles.primary,
        ]}
        onPress={toggleDetails}
      >
        <Text
          style={[styles.toggleText, expanded && styles.toggleTextExpanded]}
        >
          {expanded ? "Less Details" : "View Details"}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

// Main GymList Component
export default function GymList({ navigation }) {
  const { gyms, selectGym, currentGym, getApprovedGyms } = useGym();

  // Only show approved gyms to users
  const approvedGyms = getApprovedGyms();

  const handleSelectGym = (gym) => {
    selectGym(gym.id);
  };

  if (!approvedGyms || approvedGyms.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="business-outline" size={60} color="#ccc" />
        <Text style={styles.emptyTitle}>No Gyms Available</Text>
        <Text style={styles.emptyText}>There are no approved gyms yet.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Available Gyms</Text>
        <Text style={styles.listCount}>
          {approvedGyms.length} gym{approvedGyms.length !== 1 ? "s" : ""}
        </Text>
      </View>

      {/* Gym Cards */}
      {approvedGyms.map((gym) => (
        <GymCard
          key={gym.id}
          gym={gym}
          navigation={navigation}
          onSelectGym={handleSelectGym}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 15,
  },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  listTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#1F2937",
  },
  listCount: {
    fontSize: 14,
    color: "#6B7280",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#666",
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: "#999",
    marginTop: 8,
    textAlign: "center",
  },
  // Card Styles
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    marginBottom: 16,
    overflow: "hidden",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  cardHeader: {
    flexDirection: "row",
    padding: 16,
  },
  imageContainer: {
    marginRight: 16,
  },
  image: {
    width: 80,
    height: 80,
    borderRadius: 12,
  },
  imagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
  },
  basicInfo: {
    flex: 1,
    justifyContent: "center",
  },
  gymName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 4,
  },
  location: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  price: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2563EB",
    marginBottom: 4,
  },
  courtsCount: {
    fontSize: 14,
    color: "#6B7280",
  },
  detailsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 16,
  },
  description: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
    marginBottom: 16,
  },
  quickInfoRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 16,
  },
  infoButton: {
    alignItems: "center",
    padding: 10,
  },
  infoText: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  timingContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  timingLabel: {
    fontSize: 14,
    color: "#666",
  },
  timingValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
  },
  bookButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#48bd31",
    paddingVertical: 14,
    borderRadius: 12,
  },
  bookButtonText: {
    color: "black",
    fontSize: 16,
    fontWeight: "600",
    marginRight: 8,
  },
  toggleButton: {
    paddingVertical: 12,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  primary: {
    backgroundColor: "#F9FAFB",
  },
  secondary: {
    backgroundColor: "#E5E7EB",
  },
  toggleText: {
    color: "#2563EB",
    fontWeight: "600",
    fontSize: 14,
  },
  toggleTextExpanded: {
    color: "#666",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  discountBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#10B981",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  discountBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
  },
  discountNotice: {
    backgroundColor: "#D1FAE5",
    padding: 12,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#10B981",
    marginBottom: 16,
  },
  discountNoticeText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#065F46",
    textAlign: "center",
  },
  discountDetails: {
    fontSize: 12,
    color: "#065F46",
    textAlign: "center",
    marginTop: 4,
  },
  discountContainer: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 12,
  },
  discountItem: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 4,
  },
  discountText: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 8,
  },
});
