import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { getAdminGymDetail } from "../../api/adminApi";
import { adaptAdminGym } from "../../utils/adminMapper";
import { mapErrorToMessage } from "../../utils/errorMapper";
import {
  getFlexDirection,
  getStartMargin,
  getTextAlign,
  getWritingDirection,
  isRTL,
} from "../../utils/rtl";

export default function AdminGymDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [gym, setGym] = useState(null);
  const [loading, setLoading] = useState(true);
  const rtl = isRTL();
  const localizedTextStyle = {
    textAlign: getTextAlign(),
    writingDirection: getWritingDirection(),
  };

  useEffect(() => {
    const loadGymDetail = async () => {
      if (!id) {
        setLoading(false);
        Alert.alert(
          t("common.error"),
          t("admin.gymDetail.missingGymId", {
            defaultValue: "Gym ID is missing.",
          }),
        );
        return;
      }

      setLoading(true);
      try {
        const response = await getAdminGymDetail(id);
        const payload = response?.data?.data ?? response?.data ?? response;
        setGym(adaptAdminGym(payload));
      } catch (error) {
        setGym(null);
        Alert.alert(t("common.error"), mapErrorToMessage(error).message);
      } finally {
        setLoading(false);
      }
    };

    loadGymDetail();
  }, [id, t]);

  const statusLabel = gym?.status
    ? t(`admin.dashboard.${String(gym.status).toLowerCase()}`, {
        defaultValue: String(gym.status),
      })
    : t("admin.dashboard.unknown");

  if (loading) {
    return (
      <View style={styles.centeredState}>
        <ActivityIndicator size="large" color="#48bd31" />
        <Text style={[styles.stateText, localizedTextStyle]}>
          {t("gyms.details.loadingDetails")}
        </Text>
      </View>
    );
  }

  if (!gym) {
    return (
      <View style={styles.centeredState}>
        <Text style={[styles.stateText, localizedTextStyle]}>
          {t("admin.gymDetail.unavailable", {
            defaultValue: "Gym details are unavailable.",
          })}
        </Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>{t("gyms.details.goBack")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity
        style={[styles.inlineBackButton, { flexDirection: getFlexDirection() }]}
        onPress={() => router.back()}
      >
        <Ionicons
          name={rtl ? "arrow-forward" : "arrow-back"}
          size={20}
          color="#666"
        />
        <Text style={[styles.inlineBackText, getStartMargin(8), localizedTextStyle]}>
          {t("gyms.details.goBack")}
        </Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <View style={styles.imageContainer}>
          {gym.image ? (
            <Image
              source={typeof gym.image === "string" ? { uri: gym.image } : gym.image}
              style={styles.image}
            />
          ) : (
            <Ionicons name="fitness" size={40} color="#2563EB" />
          )}
        </View>

        <Text style={[styles.title, localizedTextStyle]}>{gym.name}</Text>
        <Text style={[styles.status, localizedTextStyle]}>{statusLabel}</Text>

        <View style={styles.detailsSection}>
          <Text style={[styles.label, localizedTextStyle]}>
            {t("ownerDashboard.gyms.address")}
          </Text>
          <Text style={[styles.value, localizedTextStyle]}>{gym.address || "-"}</Text>

          <Text style={[styles.label, localizedTextStyle]}>
            {t("ownerDashboard.gyms.city")}
          </Text>
          <Text style={[styles.value, localizedTextStyle]}>{gym.city || "-"}</Text>

          <Text style={[styles.label, localizedTextStyle]}>
            {t("admin.dashboard.phone")}
          </Text>
          <Text style={[styles.value, localizedTextStyle]}>{gym.phone || "-"}</Text>

          <Text style={[styles.label, localizedTextStyle]}>
            {t("admin.gymDetail.ownerEmail", {
              defaultValue: "Owner Email",
            })}
          </Text>
          <Text style={[styles.value, localizedTextStyle]}>
            {gym.ownerEmail || "-"}
          </Text>

          <Text style={[styles.label, localizedTextStyle]}>
            {t("ownerDashboard.gyms.description")}
          </Text>
          <Text style={[styles.value, localizedTextStyle]}>
            {gym.description || "-"}
          </Text>
        </View>
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
    paddingTop: 48,
  },
  centeredState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    padding: 24,
  },
  stateText: {
    marginTop: 12,
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
  },
  inlineBackButton: {
    alignItems: "center",
    marginBottom: 16,
  },
  inlineBackText: {
    fontSize: 16,
    color: "#666",
  },
  backButton: {
    marginTop: 16,
    backgroundColor: "#3edb17",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  imageContainer: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    marginBottom: 16,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 8,
  },
  status: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 16,
  },
  detailsSection: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    marginTop: 8,
  },
  value: {
    fontSize: 16,
    color: "#1F2937",
  },
});
