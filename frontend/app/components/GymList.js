import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Image,
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { getActiveDiscount, getDiscountPercent } from "../utils/gymMapper";
import {
  getEndMargin,
  getEndPosition,
  getFlexDirection,
  getStartMargin,
  getTextAlign,
  getWritingDirection,
  isRTL,
} from "../utils/rtl";

const formatTimeTo12Hour = (timeValue, t) => {
  if (!timeValue || typeof timeValue !== "string") {
    return "";
  }

  const [hoursValue, minutesValue] = timeValue.split(":");
  const hours = Number(hoursValue);
  const minutes = Number(minutesValue);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return timeValue;
  }

  const suffix =
    hours >= 12
      ? t("common.time.pm", { defaultValue: "PM" })
      : t("common.time.am", { defaultValue: "AM" });
  const normalizedHours = hours % 12 || 12;
  return `${normalizedHours}:${String(minutes).padStart(2, "0")} ${suffix}`;
};

const getDiscountBadgeText = (discount, t) => {
  if (!discount) {
    return "";
  }

  const percentage = Math.round(getDiscountPercent(discount));
  return percentage > 0
    ? t("gyms.list.discountOff", { percent: percentage })
    : "";
};

const formatOpeningHours = (gym, t) => {
  if (typeof gym?.opening_hours === "string" && gym.opening_hours.trim()) {
    return gym.opening_hours.trim();
  }

  if (
    gym?.opening_hours &&
    typeof gym.opening_hours === "object" &&
    typeof gym.opening_hours.open === "string" &&
    typeof gym.opening_hours.close === "string"
  ) {
    return `${gym.opening_hours.open} - ${gym.opening_hours.close}`;
  }

  if (gym?.timing && typeof gym.timing === "object") {
    const timingValues = Object.values(gym.timing);
    const firstWindow = timingValues.find(
      (value) => value?.open && value?.close,
    );

    if (firstWindow) {
      return `${firstWindow.open} - ${firstWindow.close}`;
    }
  }

  const slots = Array.isArray(gym?.slots)
    ? gym.slots
    : Array.isArray(gym?.schedule)
      ? gym.schedule
      : [];

  if (slots.length === 0) {
    return "";
  }

  const validSlots = slots.filter(
    (slot) =>
      typeof slot?.start_time === "string" &&
      typeof slot?.end_time === "string",
  );

  if (validSlots.length === 0) {
    return "";
  }

  const startTimes = validSlots.map((slot) => slot.start_time).sort();
  const endTimes = validSlots.map((slot) => slot.end_time).sort();
  const earliestStart = startTimes[0];
  const latestEnd = endTimes[endTimes.length - 1];

  if (!earliestStart || !latestEnd) {
    return "";
  }

  return `${formatTimeTo12Hour(earliestStart, t)} - ${formatTimeTo12Hour(latestEnd, t)}`;
};

if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental &&
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const GymCard = ({ gym, navigation }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const toggleDetails = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((previous) => !previous);
  };

  const activeDiscount = getActiveDiscount(gym);
  const discountBadgeText = getDiscountBadgeText(activeDiscount, t);
  const openingHours = formatOpeningHours(gym, t);
  const rtl = isRTL();
  const localizedTextStyle = {
    textAlign: getTextAlign(),
    writingDirection: getWritingDirection(),
  };

  return (
    <View style={styles.card}>
      {discountBadgeText ? (
        <View style={[styles.discountBadge, getEndPosition(14)]}>
          <Text style={styles.discountBadgeText}>{discountBadgeText}</Text>
        </View>
      ) : null}
      <View style={[styles.cardContent, { flexDirection: getFlexDirection() }]}>
        <View style={styles.imageContainer}>
          {gym.image ? (
            <Image source={{ uri: gym.image }} style={styles.image} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="business-outline" size={42} color="#16A34A" />
            </View>
          )}
        </View>

        <View
          style={[
            styles.basicInfo,
            { alignItems: rtl ? "flex-end" : "flex-start" },
          ]}
        >
          <Text
            style={[styles.gymName, localizedTextStyle]}
            numberOfLines={1}
          >
            {gym.name}
          </Text>

          <View style={[styles.gymMetaRow, { flexDirection: getFlexDirection() }]}>
            <Ionicons
              name="location"
              size={13}
              color="#6B7280"
              style={getEndMargin(6)}
            />
            <Text
              style={[styles.location, localizedTextStyle]}
              numberOfLines={1}
            >
              {gym.city}, {gym.address}
            </Text>
          </View>

          {Number.isFinite(gym.rating) && gym.rating > 0 ? (
            <View style={[styles.ratingRow, { flexDirection: getFlexDirection() }]}>
              <Ionicons
                name="star"
                size={14}
                color="#F59E0B"
                style={getEndMargin(6)}
              />
              <Text
                style={[
                  styles.rating,
                  {
                    textAlign: getTextAlign(),
                    writingDirection: getWritingDirection(),
                  },
                ]}
              >
                {gym.rating.toFixed(1)}
              </Text>
            </View>
          ) : null}

          <Text
            style={[
              styles.price,
              {
                textAlign: getTextAlign(),
                writingDirection: getWritingDirection(),
              },
            ]}
            numberOfLines={1}
          >
            {gym.startingPriceLabel}
          </Text>

          <TouchableOpacity
            style={[
              styles.toggleButton,
              { flexDirection: getFlexDirection() },
              rtl ? styles.actionButtonRtl : styles.actionButtonLtr,
            ]}
            onPress={toggleDetails}
          >
            <Text
              style={[styles.toggleText, getStartMargin(8), localizedTextStyle]}
            >
              {expanded
                ? t("gyms.list.lessDetails")
                : t("gyms.list.viewDetails")}
            </Text>
            <Ionicons
              name={
                expanded ? "chevron-up" : rtl ? "chevron-back" : "chevron-forward"
              }
              size={18}
              color="#16A34A"
            />
          </TouchableOpacity>
        </View>
      </View>

      {expanded ? (
        <View style={styles.detailsContainer}>
          {openingHours ? (
            <Text
              style={[
                styles.hoursText,
                {
                  textAlign: getTextAlign(),
                  writingDirection: getWritingDirection(),
                },
              ]}
            >
              <Ionicons name="time-outline" size={13} color="#6B7280" />{" "}
              {openingHours}
            </Text>
          ) : null}

          {gym.courtsCount ? (
            <Text
              style={[
                styles.courtsCount,
                {
                  textAlign: getTextAlign(),
                  writingDirection: getWritingDirection(),
                },
              ]}
            >
              <Ionicons name="tennisball" size={13} color="#16A34A" />{" "}
              {gym.courtsCount}{" "}
              {gym.courtsCount === 1
                ? t("gyms.list.courtSingular")
                : t("gyms.list.courtPlural")}
            </Text>
          ) : null}

          {gym.description ? (
            <Text
              style={[
                styles.description,
                {
                  textAlign: getTextAlign(),
                  writingDirection: getWritingDirection(),
                },
              ]}
              numberOfLines={2}
            >
              {gym.description}
            </Text>
          ) : null}

          <View
            style={[styles.quickInfoRow, { flexDirection: getFlexDirection() }]}
          >
            <TouchableOpacity style={styles.infoButton}>
              <Ionicons name="call-outline" size={18} color="#2563EB" />
              <Text style={[styles.infoText, localizedTextStyle]}>
                {t("gyms.list.call")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.infoButton}>
              <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
              <Text style={[styles.infoText, localizedTextStyle]}>
                {t("gyms.list.whatsapp")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.infoButton}>
              <Ionicons name="navigate-outline" size={18} color="#EF4444" />
              <Text style={[styles.infoText, localizedTextStyle]}>
                {t("gyms.list.directions")}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[
              styles.bookButton,
              { flexDirection: getFlexDirection() },
              rtl ? styles.actionButtonRtl : styles.actionButtonLtr,
            ]}
            onPress={() =>
              navigation.navigate("ServiceDetails", { gymId: gym.id })
            }
          >
            <Text
              style={[
                styles.bookButtonText,
                getStartMargin(8),
                localizedTextStyle,
              ]}
            >
              {t("gyms.list.bookNow")}
            </Text>
            <Ionicons
              name={rtl ? "arrow-back" : "arrow-forward"}
              size={18}
              color="#166534"
            />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
};

export default function GymList({
  navigation,
  searchQuery = "",
  gyms = [],
  loading = false,
  error = "",
  onRetry,
  hideHeader = false,
}) {
  const { t } = useTranslation();
  const localizedTextStyle = {
    textAlign: getTextAlign(),
    writingDirection: getWritingDirection(),
  };
  const filteredGyms = gyms.filter((gym) =>
    gym.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const isSearchingNoResults =
    searchQuery.length > 0 && filteredGyms.length === 0 && !loading;
  const showNoGymsYet = !loading && !error && gyms.length === 0;

  if (loading) {
    return (
      <View style={styles.emptyContainer}>
        <ActivityIndicator size="large" color="#16A34A" />
        <Text style={[styles.emptyTitle, localizedTextStyle]}>
          {t("gyms.list.loadingTitle")}
        </Text>
        <Text style={[styles.emptyText, localizedTextStyle]}>
          {t("gyms.list.loadingMessage")}
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="alert-circle-outline" size={60} color="#DC2626" />
        <Text style={[styles.emptyTitle, localizedTextStyle]}>
          {t("gyms.list.loadErrorTitle")}
        </Text>
        <Text style={[styles.emptyText, localizedTextStyle]}>{error}</Text>
        {typeof onRetry === "function" ? (
          <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
            <Text style={[styles.retryButtonText, localizedTextStyle]}>
              {t("gyms.list.tryAgain")}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  if (showNoGymsYet || isSearchingNoResults) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons
          name={isSearchingNoResults ? "search" : "business-outline"}
          size={60}
          color="#9CA3AF"
        />
        <Text style={[styles.emptyTitle, localizedTextStyle]}>
          {isSearchingNoResults
            ? t("gyms.list.noGymsFound")
            : t("gyms.list.noGymsAvailable")}
        </Text>
        <Text style={[styles.emptyText, localizedTextStyle]}>
          {isSearchingNoResults
            ? t("gyms.list.searchNoResultsMessage", { query: searchQuery })
            : t("gyms.list.noGymsAvailableMessage")}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!hideHeader ? (
        <View style={[styles.listHeader, { flexDirection: getFlexDirection() }]}>
          <Text style={[styles.listTitle, localizedTextStyle, { flex: 1 }]}>
            {t("gyms.list.availableGyms")}
          </Text>
          <Text
            style={[
              styles.listCount,
              localizedTextStyle,
            ]}
          >
            {filteredGyms.length}{" "}
            {filteredGyms.length === 1
              ? t("gyms.list.gymSingular")
              : t("gyms.list.gymPlural")}
          </Text>
        </View>
      ) : null}

      {filteredGyms.map((gym) => (
        <GymCard key={gym.id} gym={gym} navigation={navigation} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  listHeader: {
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
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#374151",
    marginTop: 16,
    alignSelf: "stretch",
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 8,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: "#16A34A",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 26,
    marginBottom: 18,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    position: "relative",
  },
  cardContent: {
    alignItems: "flex-start",
    gap: 14,
  },
  imageContainer: {
    flexShrink: 0,
  },
  image: {
    width: 118,
    height: 118,
    borderRadius: 18,
  },
  imagePlaceholder: {
    width: 118,
    height: 118,
    borderRadius: 18,
    backgroundColor: "#F0FDF4",
    justifyContent: "center",
    alignItems: "center",
  },
  basicInfo: {
    flex: 1,
    minHeight: 118,
    justifyContent: "space-between",
  },
  gymName: {
    alignSelf: "stretch",
    fontSize: 20,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 6,
  },
  location: {
    alignSelf: "stretch",
    flex: 1,
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 4,
  },
  rating: {
    alignSelf: "stretch",
    fontSize: 15,
    color: "#4B5563",
    marginBottom: 4,
  },
  price: {
    alignSelf: "stretch",
    fontSize: 18,
    fontWeight: "800",
    color: "#16A34A",
    marginBottom: 8,
  },
  gymMetaRow: {
    alignItems: "center",
    marginBottom: 4,
  },
  ratingRow: {
    alignItems: "center",
    marginBottom: 4,
  },
  discountBadge: {
    position: "absolute",
    top: 14,
    zIndex: 5,
    backgroundColor: "#16A34A",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  discountBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  toggleButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0FDF4",
    borderWidth: 1.5,
    borderColor: "#DCFCE7",
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  actionButtonLtr: {
    alignSelf: "flex-start",
  },
  actionButtonRtl: {
    alignSelf: "flex-end",
  },
  toggleText: {
    color: "#166534",
    fontWeight: "800",
    fontSize: 14,
  },
  detailsContainer: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#ECF0F3",
    paddingTop: 14,
  },
  hoursText: {
    alignSelf: "stretch",
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 6,
  },
  courtsCount: {
    alignSelf: "stretch",
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 8,
  },
  description: {
    alignSelf: "stretch",
    fontSize: 14,
    color: "#4B5563",
    lineHeight: 20,
    marginBottom: 14,
  },
  quickInfoRow: {
    justifyContent: "space-around",
    marginBottom: 14,
  },
  infoButton: {
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  infoText: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
  },
  bookButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0FDF4",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  bookButtonText: {
    color: "#166534",
    fontSize: 15,
    fontWeight: "800",
  },
});
