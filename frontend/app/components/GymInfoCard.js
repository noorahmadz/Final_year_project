import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import { getTextAlign, getWritingDirection } from "../utils/rtl";
import ClubInfoCard from "./ClubInfoCard";

if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental &&
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const GymInfoCard = ({ navigation, gym }) => {
  const { t } = useTranslation();
  const { currentGym } = useGym();
  const localizedTextStyle = {
    textAlign: getTextAlign(),
    writingDirection: getWritingDirection(),
  };

  // Use provided gym or fall back to current gym from context
  const selectedGym = gym || currentGym;
  const [expanded, setExpanded] = useState(false);

  const toggleDetails = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
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
          <Image
            source={
              typeof selectedGym.image === "string"
                ? { uri: selectedGym.image }
                : selectedGym.image
            }
            style={styles.image}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.gymInitial}>
              {selectedGym?.name?.charAt(0) ||
                t("gyms.list.gymSingular", { defaultValue: "G" }).charAt(0)}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        {/* Gym Name */}
        <Text style={[styles.gymName, localizedTextStyle]}>
          {selectedGym?.name || t("ownerDashboard.gyms.gymName")}
        </Text>

        {/* Location */}
        <Text style={[styles.location, localizedTextStyle]}>
          {selectedGym?.city}, {selectedGym?.address}
        </Text>

        {/* Price */}
        <Text style={[styles.price, localizedTextStyle]}>
          {selectedGym?.startingPriceLabel ||
            t("gyms.details.fromPrice", {
              amount: getLowestPrice(),
              currency: t("common.currency.afg", { defaultValue: "AFG" }),
              defaultValue: "From {{amount}} {{currency}}",
            })}
        </Text>

        {/* Courts Count */}
        {selectedGym?.courts && (
          <Text style={[styles.courts, localizedTextStyle]}>
            {selectedGym.courts.length}{" "}
            {t(
              selectedGym.courts.length === 1
                ? "gyms.list.courtSingular"
                : "gyms.list.courtPlural",
            )}
          </Text>
        )}

        {/* Active Discounts */}
        {(() => {
          const activeDiscounts = selectedGym?.discounts || [];
          return (
            activeDiscounts.length > 0 && (
              <View style={styles.discountsContainer}>
                <Text style={[styles.discountsTitle, localizedTextStyle]}>
                  {t("gyms.details.activeDiscounts")}
                </Text>
                {activeDiscounts.map((discount) => (
                  <View key={discount.id} style={styles.discountItem}>
                    <Text style={[styles.discountText, localizedTextStyle]}>
                      {discount.type === "percentage"
                        ? t("gyms.details.discountOff", {
                            percent: discount.value,
                            defaultValue: "{{percent}}% off",
                          })
                        : t("gyms.details.fixedDiscountOff", {
                            amount: discount.value,
                            currency: t("common.currency.afg", {
                              defaultValue: "AFG",
                            }),
                            defaultValue: "{{amount}} {{currency}} off",
                          })}
                      - {discount.description}
                    </Text>
                    <Text style={[styles.discountValidity, localizedTextStyle]}>
                      {t("gyms.details.validUntil", {
                        defaultValue: "Valid until",
                      })}{" "}
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
          <Text style={[styles.buttonText, localizedTextStyle]}>
            {expanded ? t("gyms.list.lessDetails") : t("gyms.list.viewDetails")}
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
