import { useState } from "react";
import {
  Image,
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { useGym } from "../context/GymContext";
import ClubInfoCard from "./ClubInfoCard";

if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental &&
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const GymInfoCard = ({ navigation, gym }) => {
  const { currentGym, selectGym, getActiveDiscounts } = useGym();

  // Use provided gym or fall back to current gym from context
  const selectedGym = gym || currentGym;
  const [expanded, setExpanded] = useState(false);

  const toggleDetails = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);

    // Set this gym as current when expanding
    if (!expanded && selectedGym) {
      selectGym(selectedGym.id);
    }
  };

  // Get lowest price for display
  const getLowestPrice = () => {
    if (selectedGym?.courts && selectedGym.courts.length > 0) {
      const prices = selectedGym.courts.map(
        (c) => c.price30min || c.price60min / 2,
      );
      return Math.min(...prices);
    }
    return 1500;
  };

  return (
    <View style={styles.card}>
      {/* Gym Image */}
      <View style={styles.imageWrapper}>
        {selectedGym?.image ? (
          <Image source={selectedGym.image} style={styles.image} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.gymInitial}>
              {selectedGym?.name?.charAt(0) || "G"}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        {/* Gym Name */}
        <Text style={styles.gymName}>{selectedGym?.name || "Gym Name"}</Text>

        {/* Location */}
        <Text style={styles.location}>
          {selectedGym?.city}, {selectedGym?.address}
        </Text>

        {/* Price */}
        <Text style={styles.price}>Starting from {getLowestPrice()} AFG</Text>

        {/* Courts Count */}
        {selectedGym?.courts && (
          <Text style={styles.courts}>
            {selectedGym.courts.length} Court
            {selectedGym.courts.length !== 1 ? "s" : ""} Available
          </Text>
        )}

        {/* Active Discounts */}
        {(() => {
          const activeDiscounts = getActiveDiscounts(selectedGym?.id);
          return (
            activeDiscounts.length > 0 && (
              <View style={styles.discountsContainer}>
                <Text style={styles.discountsTitle}>Active Discounts:</Text>
                {activeDiscounts.map((discount) => (
                  <View key={discount.id} style={styles.discountItem}>
                    <Text style={styles.discountText}>
                      {discount.type === "percentage"
                        ? `${discount.value}% off`
                        : `${discount.value} AFG off`}
                      - {discount.description}
                    </Text>
                    <Text style={styles.discountValidity}>
                      Valid until{" "}
                      {new Date(discount.validTo).toLocaleDateString()}
                    </Text>
                  </View>
                ))}
              </View>
            )
          );
        })()}

        {/* Expanded Details */}
        {expanded && (
          <View style={styles.details}>
            <ClubInfoCard navigation={navigation} gym={selectedGym} />
          </View>
        )}

        {/* Toggle Button */}
        <TouchableOpacity
          style={[styles.button, expanded ? styles.secondary : styles.primary]}
          onPress={toggleDetails}
        >
          <Text style={styles.buttonText}>
            {expanded ? "Less Details" : "View Details"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default GymInfoCard;

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    margin: 15,
    overflow: "hidden",
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  imageWrapper: {
    alignItems: "center",
    paddingTop: 20,
    backgroundColor: "#EEF2FF",
  },
  image: {
    width: 100,
    height: 100,
    borderRadius: 50,
    resizeMode: "contain",
  },
  imagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
  },
  gymInitial: {
    fontSize: 40,
    fontWeight: "bold",
    color: "#fff",
  },
  content: {
    padding: 16,
  },
  gymName: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 4,
    color: "#1F2937",
  },
  location: {
    fontSize: 14,
    color: "#666",
    marginBottom: 6,
  },
  price: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
    color: "#2563EB",
  },
  courts: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 12,
  },
  discountsContainer: {
    marginBottom: 12,
    padding: 8,
    backgroundColor: "#F0FDF4",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#10B981",
  },
  discountsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#065F46",
    marginBottom: 4,
  },
  discountItem: {
    marginBottom: 4,
  },
  discountText: {
    fontSize: 14,
    color: "#065F46",
    fontWeight: "500",
  },
  discountValidity: {
    fontSize: 12,
    color: "#047857",
  },
  details: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 10,
  },
  button: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  primary: {
    backgroundColor: "#2563EB",
  },
  secondary: {
    backgroundColor: "#E5E7EB",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
});
