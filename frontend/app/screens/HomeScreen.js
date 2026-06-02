import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { getGymDiscounts, getGyms } from "../api/gymsApi";
import GymList from "../components/GymList";
import { useAuth } from "../context/AuthContext";
import { mapDiscountToUi, mapGymListResponse } from "../utils/gymMapper";
import {
  getEndMargin,
  getFlexDirection,
  getStartMargin,
  getTextAlign,
  getWritingDirection,
  isRTL,
  syncNativeRTL,
} from "../utils/rtl";

const APP_LANGUAGE_STORAGE_KEY = "app_language";
const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "ps", label: "پښتو" },
  { code: "fa", label: "دری" },
];

const PRIMARY_COLOR = "#24a731";
const PRIMARY_DARK = "#1B7F26";
const PRIMARY_TINT = "#EAF8EC";
const PRIMARY_BORDER = "#BFE7C5";

const normalizeLanguageCode = (languageCode) => {
  const locale = languageCode || "en";

  if (locale.startsWith("ps")) return "ps";
  if (locale.startsWith("fa") || locale.startsWith("prs")) return "fa";

  return "en";
};

function FootballAnimation() {
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const bounceAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    );

    const rotateAnimation = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      }),
    );

    bounceAnimation.start();
    rotateAnimation.start();

    return () => {
      bounceAnimation.stop();
      rotateAnimation.stop();
    };
  }, [bounceAnim, rotateAnim]);

  const bounce = bounceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View style={{ transform: [{ translateY: bounce }, { rotate }] }}>
      <Ionicons name="football" size={30} color={PRIMARY_COLOR} />
    </Animated.View>
  );
}

export default function HomeScreen({ navigation }) {
  const { t, i18n } = useTranslation();
  const currentLanguage = i18n.language;
  const { isAuthenticated, role } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [gyms, setGyms] = useState([]);
  const [loadingGyms, setLoadingGyms] = useState(true);
  const [gymsError, setGymsError] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState(
    normalizeLanguageCode(i18n.resolvedLanguage || i18n.language || "en"),
  );

  const rtl = isRTL();
  const isCustomer = isAuthenticated && role === "customer";
  const currentTextAlign = getTextAlign();
  const currentWritingDirection = getWritingDirection();
  const localizedTextStyle = {
    textAlign: currentTextAlign,
    writingDirection: currentWritingDirection,
  };
  const filteredGyms = gyms.filter((gym) =>
    gym.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  useEffect(() => {
    navigation.setOptions({
      headerTitleAlign: "center",
      headerTitle: () => (
        <View style={styles.headerTitleContainer}>
          <Text
            style={[
              styles.headerTitleText,
              {
                textAlign: currentTextAlign,
                writingDirection: currentWritingDirection,
              },
            ]}
          >
            {t("home.homeTitle")}
          </Text>
        </View>
      ),
    });
  }, [
    navigation,
    currentLanguage,
    currentTextAlign,
    currentWritingDirection,
    selectedLanguage,
    t,
  ]);

  const clearSearch = () => {
    setSearchQuery("");
  };

  const handleLanguageChange = async (languageCode) => {
    try {
      const normalizedLanguageCode = normalizeLanguageCode(languageCode);

      if (!["en", "ps", "fa"].includes(normalizedLanguageCode)) {
        return;
      }

      await AsyncStorage.setItem(
        APP_LANGUAGE_STORAGE_KEY,
        normalizedLanguageCode,
      );
      setSelectedLanguage(normalizedLanguageCode);
      await i18n.changeLanguage(normalizedLanguageCode);
      syncNativeRTL(normalizedLanguageCode);
    } catch (error) {
      console.log("Language change error:", error);
    }
  };

  const loadGyms = async () => {
    setLoadingGyms(true);
    setGymsError("");

    try {
      const response = await getGyms();
      const normalized = mapGymListResponse(response);
      const discountResults = await Promise.allSettled(
        normalized.results.map((gym) => getGymDiscounts(gym.id)),
      );

      const gymsWithDiscounts = normalized.results.map((gym, index) => {
        const discountResult = discountResults[index];
        const discounts =
          discountResult?.status === "fulfilled" &&
          Array.isArray(discountResult.value?.results)
            ? discountResult.value.results.map(mapDiscountToUi)
            : [];

        return {
          ...gym,
          discounts,
        };
      });

      setGyms(gymsWithDiscounts);
    } catch (error) {
      setGyms([]);
      setGymsError(error.message || "Unable to load gyms right now.");
    } finally {
      setLoadingGyms(false);
    }
  };

  useEffect(() => {
    loadGyms();
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.topShell}>
          <View style={[styles.topBar, { flexDirection: getFlexDirection() }]}>
            <TouchableOpacity style={styles.iconButton}>
              <View
                style={[styles.notificationDot, rtl ? styles.notificationDotRtl : null]}
              />
              <Ionicons name="notifications-outline" size={22} color="#111827" />
            </TouchableOpacity>

              <Text
                style={[
                  styles.pageTitle,
                  localizedTextStyle,
                  { alignSelf: rtl ? "flex-end" : "flex-start" },
                ]}
                numberOfLines={1}
              >
                {t("home.homeTitle")}
              </Text>

            <View style={styles.languagePill}>
              <View
                style={[
                  styles.languageOptionsRow,
                  { flexDirection: getFlexDirection() },
                ]}
              >
                {LANGUAGE_OPTIONS.map((item) => {
                  const isActive = selectedLanguage === item.code;

                  return (
                    <TouchableOpacity
                      key={item.code}
                      style={[
                        styles.languageOptionButton,
                        isActive && styles.languageOptionButtonActive,
                      ]}
                      onPress={() => handleLanguageChange(item.code)}
                    >
                      <Text
                        style={[
                          styles.languageOptionText,
                          isActive && styles.languageOptionTextActive,
                          { writingDirection: getWritingDirection() },
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          <View style={styles.heroCard}>
            <View
              style={[styles.heroTopRow, { flexDirection: getFlexDirection() }]}
            >
              <TouchableOpacity
                style={[
                  styles.outlineActionButton,
                  styles.heroSideButton,
                  { flexDirection: getFlexDirection() },
                ]}
                onPress={() => navigation.navigate("AdminLogin")}
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={20}
                  color={PRIMARY_COLOR}
                />
                <Text
                  style={[
                    styles.outlineActionText,
                    getStartMargin(8),
                    localizedTextStyle,
                  ]}
                  numberOfLines={1}
                >
                  {t("home.admin")}
                </Text>
              </TouchableOpacity>

              <View style={styles.heroHeadingBlock}>
                <View
                  style={[
                    styles.heroTitleRow,
                    { flexDirection: getFlexDirection() },
                  ]}
                >
                  <View style={styles.heroIconCircle}>
                    <FootballAnimation />
                  </View>
                  <Text style={[styles.heroTitle, localizedTextStyle]}>
                    {t("home.title")}
                  </Text>
                </View>
                <Text style={[styles.heroSubtitle, localizedTextStyle]}>
                  {t("home.subtitle")}
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.outlineActionButton,
                  styles.heroSideButton,
                  { flexDirection: getFlexDirection() },
                ]}
                onPress={() => navigation.navigate("OwnerLogin")}
              >
                <Ionicons name="person-outline" size={15} color={PRIMARY_COLOR} />
                <Text
                  style={[
                    styles.outlineActionText,
                    getStartMargin(8),
                    localizedTextStyle,
                  ]}
                  numberOfLines={1}
                >
                  {t("home.signIn")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.tournamentButton, { flexDirection: getFlexDirection() }]}
          onPress={() => navigation.navigate("Tournaments")}
        >
          <Ionicons name="trophy-outline" size={24} color="#FFFFFF" />
          <Text
            style={[
              styles.tournamentText,
              getStartMargin(10),
              { writingDirection: getWritingDirection() },
            ]}
          >
            {t("home.seeTournaments")}
          </Text>
        </TouchableOpacity>

        {isCustomer ? (
          <View style={[styles.historyGrid, { flexDirection: getFlexDirection() }]}>
            <TouchableOpacity
              style={[styles.historyCard, { flexDirection: getFlexDirection() }]}
              onPress={() => navigation.navigate("CustomerBookingHistory")}
            >
              <Ionicons
                name="time-outline"
                size={26}
                color={PRIMARY_COLOR}
                style={getEndMargin(10)}
              />
              <View style={styles.historyTextBlock}>
                <Text
                  style={[styles.historyTitle, localizedTextStyle]}
                >
                  {t("home.bookingHistory")}
                </Text>
                <Text
                  style={[styles.historySubtitle, localizedTextStyle]}
                >
                  {t("home.bookingHistorySubtitle")}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.historyCard, { flexDirection: getFlexDirection() }]}
              onPress={() => navigation.navigate("CustomerPaymentHistory")}
            >
              <Ionicons
                name="card-outline"
                size={24}
                color={PRIMARY_COLOR}
                style={getEndMargin(10)}
              />
              <View style={styles.historyTextBlock}>
                <Text
                  style={[styles.historyTitle, localizedTextStyle]}
                >
                  {t("home.paymentHistory")}
                </Text>
                <Text
                  style={[styles.historySubtitle, localizedTextStyle]}
                >
                  {t("home.paymentHistorySubtitle")}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={[styles.searchBox, { flexDirection: getFlexDirection(true) }]}>
          <Ionicons
            name="search"
            size={24}
            color={PRIMARY_COLOR}
            style={getEndMargin(12)}
          />
          <TextInput
            style={[
              styles.searchInput,
              {
                
                writingDirection: getWritingDirection(),
              },
            ]}
            placeholder={t("home.searchPlaceholder")}
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity onPress={clearSearch} style={styles.clearButton}>
              <Ionicons name="close" size={20} color="#6B7280" />
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView
          style={styles.listScroll}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[styles.sectionHeader, { flexDirection: getFlexDirection(false) }]}
          >
            <Text
              style={[
                styles.sectionTitle,
                localizedTextStyle,
              ]}
            >
              {t("gyms.list.availableGyms")}
            </Text>
            <View style={styles.countBadge}>
              <Text
                style={[
                  styles.countBadgeText,
                  {
                    textAlign: "center",
                    writingDirection: getWritingDirection(),
                  },
                ]}
              >
                {t("home.gymsCount", { count: filteredGyms.length })}
              </Text>
            </View>
          </View>

          <GymList
            navigation={navigation}
            searchQuery={searchQuery}
            gyms={gyms}
            loading={loadingGyms}
            error={gymsError}
            onRetry={loadGyms}
            hideHeader
          />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  listScroll: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 24,
  },
  topShell: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  topBar: {
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    position: "relative",
  },
  notificationDot: {
    position: "absolute",
    top: 9,
    right: 10,
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: PRIMARY_COLOR,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  notificationDotRtl: {
    right: undefined,
    left: 10,
  },
  pageTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: "900",
    color: "",
    paddingHorizontal:2,
    paddingBottom:7,
    paddingTop:9,
  },
  languagePill: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 4,
  },
  languageOptionsRow: {
    alignItems: "center",
    gap: 6,
  },
  languageOptionButton: {
    minHeight: 42,
    borderRadius: 999,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  languageOptionButtonActive: {
    backgroundColor: PRIMARY_COLOR,
  },
  languageOptionText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  languageOptionTextActive: {
    color: "#FFFFFF",
  },
  headerTitleContainer: {
    flex: 1,
    width: "100%",
  },
  headerTitleText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    width: "100%",
  },
  heroCard: {
    backgroundColor: "#FFFFff",
    paddingHorizontal: 5,
    paddingTop: 7,
    paddingBottom:14,
  },
  heroTopRow: {
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  heroHeadingBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
  },
  heroTitleRow: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  heroIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 31,
    backgroundColor: PRIMARY_TINT,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    flexShrink: 1,
    fontSize: 20,
    fontWeight: "900",
    color: PRIMARY_DARK,
  },
  heroSubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
  },
  outlineActionButton: {
    minHeight: 40,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: PRIMARY_COLOR,
    backgroundColor: PRIMARY_TINT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  heroSideButton: {
    width: 100,
   
  },
  outlineActionText: {
    fontSize: 15,
    fontWeight: "900",
    color: PRIMARY_DARK,
  },
  tournamentButton: {
    marginHorizontal: 20,
    marginTop: 10,
    minHeight: 42,
    borderRadius: 20,
    backgroundColor: "#24a731",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  tournamentText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  historyGrid: {
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 16,
  },
  historyCard: {
    flex: 1,
    minHeight: 40,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    padding: 4,
    alignItems: "center",
    borderWidth: 1,
  
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  historyTextBlock: {
    flex: 1,
    alignSelf: "stretch",
  },
  historyTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#111827",
  },
  historySubtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  searchBox: {
    marginHorizontal: 20,
    marginTop: 18,
    height: 43,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    paddingHorizontal: 18,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#111827",
  },
  clearButton: {
    padding: 4,
  },
  sectionHeader: {
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#111827",
  },
  countBadge: {
    backgroundColor: PRIMARY_TINT,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: PRIMARY_BORDER,
  },
  countBadgeText: {
    fontSize: 14,
    fontWeight: "800",
    color: PRIMARY_DARK,
  },
});
