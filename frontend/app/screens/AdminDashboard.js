import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import {
  approveGym as approveGymRequest,
  deleteAdminGym,
  getAdminGyms,
} from "../api/adminApi";
import { useAuth } from "../context/AuthContext";
import { useGym } from "../context/GymContext";
import { adaptAdminGym } from "../utils/adminMapper";
import { mapErrorToMessage } from "../utils/errorMapper";
import {
  getFlexDirection,
  getStartMargin,
  getTextAlign,
  getWritingDirection,
} from "../utils/rtl";

const PRIMARY_COLOR = "#24a731";
const PRIMARY_TINT = "#EAF8EC";

export default function AdminDashboard({ navigation }) {
  const router = useRouter();
  const { t } = useTranslation();
  const { tournaments } = useGym();
  const { logout, user } = useAuth();

  const [activeTab, setActiveTab] = useState("gym-pending");
  const [adminGyms, setAdminGyms] = useState([]);
  const [gymsLoading, setGymsLoading] = useState(false);
  const [activeGymActionId, setActiveGymActionId] = useState(null);
  const [selectedGym, setSelectedGym] = useState(null);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectType, setRejectType] = useState("gym");

  const localizedTextStyle = {
    textAlign: getTextAlign(),
    writingDirection: getWritingDirection(),
  };

  const loadAdminGyms = async () => {
    setGymsLoading(true);

    try {
      const response = await getAdminGyms();
      const payload = response?.data?.data ?? response?.data ?? response;
      const results = Array.isArray(payload?.results)
        ? payload.results
        : Array.isArray(payload)
          ? payload
          : [];

      setAdminGyms(results.map(adaptAdminGym).filter(Boolean));
    } catch (error) {
      setAdminGyms([]);
      Alert.alert(t("common.error"), mapErrorToMessage(error).message);
    } finally {
      setGymsLoading(false);
    }
  };

  useEffect(() => {
    loadAdminGyms();
  }, []);

  const pendingGyms = adminGyms.filter((gym) => gym.status === "pending");
  const approvedGyms = adminGyms.filter((gym) => gym.status === "approved");
  const rejectedGyms = adminGyms.filter((gym) => gym.status === "rejected");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const getTournamentStatus = (item) => {
    if (item.status === "canceled") return "canceled";
    if (item.status === "pending") return "pending";
    if (item.status === "rejected") return "rejected";

    const startDate = new Date(item.startDate);
    const endDate = new Date(item.endDate);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    if (today < startDate) return "upcoming";
    if (today >= startDate && today <= endDate) return "in_progress";
    if (today > endDate) return "completed";
    return "upcoming";
  };

  const tournamentsWithStatus = tournaments.map((item) => ({
    ...item,
    calculatedStatus: getTournamentStatus(item),
  }));

  const getAdminGymStatusLabel = (status) => {
    const normalized = String(status || "").toLowerCase();

    if (normalized === "approved") return t("admin.dashboard.approved");
    if (normalized === "rejected") return t("admin.dashboard.rejected");

    return t("admin.dashboard.pending");
  };

  const getTournamentStatusLabel = (status) => {
    const normalized = String(status || "").toLowerCase();

    if (normalized === "upcoming") return t("tournaments.upcoming");
    if (normalized === "ongoing" || normalized === "in_progress") {
      return t("tournaments.inProgress");
    }
    if (normalized === "finished" || normalized === "completed") {
      return t("tournaments.completed");
    }
    if (normalized === "cancelled" || normalized === "canceled") {
      return t("tournaments.canceled");
    }
    if (normalized === "pending") return t("admin.dashboard.pending");
    if (normalized === "rejected") return t("admin.dashboard.rejected");

    return status || "";
  };

  const pendingTournaments = tournamentsWithStatus.filter((t) => t.status === "pending");
  const approvedTournaments = tournamentsWithStatus.filter(
    (t) =>
      t.calculatedStatus === "upcoming" ||
      t.calculatedStatus === "in_progress" ||
      t.calculatedStatus === "completed",
  );

  const handleOpenGymDetail = (gymId) => {
    router.push(`/admin/gym/${gymId}`);
  };

  const handleApproveGym = async (gym) => {
    Alert.alert(t("admin.dashboard.approve"), `${t("admin.dashboard.approve")} "${gym.name}"?`, [
      { text: t("admin.dashboard.cancel"), style: "cancel" },
      {
        text: t("admin.dashboard.approve"),
        onPress: async () => {
          if (activeGymActionId === gym.id) {
            return;
          }

          setActiveGymActionId(gym.id);
          try {
            await approveGymRequest(gym.id, "approved");
            await loadAdminGyms();
            Alert.alert(t("common.success"), t("admin.dashboard.gymApproved"));
          } catch (error) {
            Alert.alert(t("common.error"), mapErrorToMessage(error).message);
          } finally {
            setActiveGymActionId(null);
          }
        },
      },
    ]);
  };

  const handleRejectGym = (gym) => {
    setSelectedGym(gym);
    setRejectType("gym");
    setShowRejectModal(true);
  };

  const handleDeleteGym = (gym) => {
    Alert.alert(
      t("admin.dashboard.deleteGym"),
      t("admin.dashboard.confirmDelete"),
      [
        { text: t("admin.dashboard.cancel"), style: "cancel" },
        {
          text: t("admin.dashboard.deleteGym"),
          style: "destructive",
          onPress: async () => {
            if (activeGymActionId === gym.id) {
              return;
            }

            setActiveGymActionId(gym.id);
            try {
              await deleteAdminGym(gym.id);
              await loadAdminGyms();
              Alert.alert(t("common.success"), t("admin.dashboard.gymDeleted"));
            } catch (error) {
              Alert.alert(t("common.error"), mapErrorToMessage(error).message);
            } finally {
              setActiveGymActionId(null);
            }
          },
        },
      ],
    );
  };

  const handleApproveTournament = (tournament) => {
    Alert.alert(
      t("admin.dashboard.error"),
      `${t("admin.dashboard.unableToApprove")}: ${tournament.name}`,
    );
  };

  const handleRejectTournament = (tournament) => {
    Alert.alert(
      t("admin.dashboard.error"),
      `${t("admin.dashboard.unableToReject")}: ${tournament.name}`,
    );
  };

  const handleDeleteTournament = (tournament) => {
    Alert.alert(
      t("admin.dashboard.error"),
      `${t("admin.dashboard.unableToDelete")}: ${tournament.name}`,
    );
  };

  const confirmReject = async () => {
    if (rejectType === "gym" && selectedGym) {
      if (activeGymActionId === selectedGym.id) {
        return;
      }

      setActiveGymActionId(selectedGym.id);
      try {
        await approveGymRequest(selectedGym.id, "rejected");
        await loadAdminGyms();
        setShowRejectModal(false);
        setRejectReason("");
        setSelectedGym(null);
        Alert.alert(t("common.success"), t("admin.dashboard.gymRejected"));
      } catch (error) {
        Alert.alert(t("common.error"), mapErrorToMessage(error).message);
      } finally {
        setActiveGymActionId(null);
      }
      return;
    }

    if (rejectType === "tournament") {
      setShowRejectModal(false);
      setRejectReason("");
      setSelectedTournament(null);
      Alert.alert(t("admin.dashboard.error"), t("admin.dashboard.unableToReject"));
    }
  };

  const handleLogout = () => {
    Alert.alert(t("common.logout"), t("common.logoutConfirm"), [
      { text: t("admin.dashboard.cancel"), style: "cancel" },
      {
        text: t("common.logout"),
        onPress: () => {
          logout();
          router.replace("/");
        },
      },
    ]);
  };
  const renderGymItem = ({ item }) => (
    <TouchableOpacity
      style={[
        styles.gymCard,
        item.status === "pending" && styles.gymCardPending,
        item.status === "approved" && styles.gymCardApproved,
        item.status === "rejected" && styles.gymCardRejected,
      ]}
      activeOpacity={0.9}
      onPress={() => handleOpenGymDetail(item.id)}
    >
      <View style={[styles.gymHeader, { flexDirection: getFlexDirection() }]}>
        <View style={styles.gymImageContainer}>
          {item.image ? (
            <Image
              source={
                typeof item.image === "string"
                  ? { uri: item.image }
                  : item.image
              }
              style={styles.gymImage}
            />
          ) : (
            <Ionicons name="fitness" size={30} color={PRIMARY_COLOR} />
          )}
        </View>
        <View style={[styles.gymInfo, getStartMargin(12)]}>
          <Text
            style={[
              styles.gymName,
              {
                textAlign: getTextAlign(),
                writingDirection: getWritingDirection(),
              },
            ]}
          >
            {item.name}
          </Text>
          <Text
            style={[
              styles.gymAddress,
              {
                textAlign: getTextAlign(),
                writingDirection: getWritingDirection(),
              },
            ]}
          >
            {item.address}, {item.city}
          </Text>
          <Text
            style={[
              styles.gymDate,
              {
                textAlign: getTextAlign(),
                writingDirection: getWritingDirection(),
              },
            ]}
          >
            {t("admin.dashboard.submitted", { defaultValue: "Submitted" })}:{" "}
            {item.submittedAt
              ? new Date(item.submittedAt).toLocaleDateString()
              : t("admin.dashboard.unknown", { defaultValue: "Unknown" })}
          </Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            item.status === "approved" && styles.statusApproved,
            item.status === "pending" && styles.statusPending,
            item.status === "rejected" && styles.statusRejected,
          ]}
        >
          <Text style={[styles.statusText, localizedTextStyle]}>
            {getAdminGymStatusLabel(item.status)}
          </Text>
        </View>
      </View>

      {item.status === "pending" && (
        <View style={[styles.actionButtons, { flexDirection: getFlexDirection() }]}>
          <TouchableOpacity
            style={[styles.actionButton, styles.approveButton, { flexDirection: getFlexDirection() }]}
            onPress={() => handleApproveGym(item)}
          >
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={[styles.actionButtonText, getStartMargin(8), localizedTextStyle]}>
              {t("admin.dashboard.approve")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.rejectButton, { flexDirection: getFlexDirection() }]}
            onPress={() => handleRejectGym(item)}
          >
            <Ionicons name="close-circle" size={20} color="#fff" />
            <Text style={[styles.actionButtonText, getStartMargin(8), localizedTextStyle]}>
              {t("admin.dashboard.reject")}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {item.status === "rejected" && item.rejectionReason && (
        <View style={styles.rejectionReason}>
          <Text
            style={[
              styles.rejectionLabel,
              {
                textAlign: getTextAlign(),
                writingDirection: getWritingDirection(),
              },
            ]}
          >
            {t("admin.dashboard.rejectionReason")}:
          </Text>
          <Text
            style={[
              styles.rejectionText,
              {
                textAlign: getTextAlign(),
                writingDirection: getWritingDirection(),
              },
            ]}
          >
            {item.rejectionReason}
          </Text>
        </View>
      )}

      {item.status === "approved" && (
        <View style={styles.deleteButtonContainer}>
          <TouchableOpacity
            style={[styles.deleteButton, { flexDirection: getFlexDirection() }]}
            onPress={() => handleDeleteGym(item)}
          >
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
            <Text style={[styles.deleteButtonText, getStartMargin(8), localizedTextStyle]}>
              {t("admin.dashboard.deleteGym")}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderTournamentItem = ({ item }) => {
    const status = item.calculatedStatus || item.status;
    return (
      <View
        style={[
          styles.gymCard,
          (status === "upcoming" || status === "in_progress" || status === "completed") &&
            styles.gymCardApproved,
          item.status === "pending" && styles.gymCardPending,
          item.status === "rejected" && styles.gymCardRejected,
        ]}
      >
        <View style={[styles.gymHeader, { flexDirection: getFlexDirection() }]}>
          <View style={styles.gymImageContainer}>
            <Ionicons name="trophy" size={30} color={PRIMARY_COLOR} />
          </View>
          <View style={[styles.gymInfo, getStartMargin(12)]}>
            <Text
              style={[
                styles.gymName,
                {
                  textAlign: getTextAlign(),
                  writingDirection: getWritingDirection(),
                },
              ]}
            >
              {item.name}
            </Text>
            <Text
              style={[
                styles.gymAddress,
                {
                  textAlign: getTextAlign(),
                  writingDirection: getWritingDirection(),
                },
              ]}
            >
              {item.gymName}
            </Text>
            <Text
              style={[
                styles.gymDate,
                {
                  textAlign: getTextAlign(),
                  writingDirection: getWritingDirection(),
                },
              ]}
          >
            {t("admin.dashboard.created", { defaultValue: "Created" })}:{" "}
            {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </View>
          <View
            style={[
              styles.statusBadge,
              status === "upcoming" || status === "in_progress" ? styles.statusApproved
              : item.status === "pending" ? styles.statusPending
              : item.status === "rejected" ? styles.statusRejected
              : item.status === "completed" ? styles.statusApproved
              : styles.statusPending,
            ]}
          >
            <Text style={[styles.statusText, localizedTextStyle]}>
              {getTournamentStatusLabel(status)}
            </Text>
          </View>
        </View>

        <View style={styles.gymDetails}>
          <Text
            style={[
              styles.detailText,
              {
                textAlign: getTextAlign(),
                writingDirection: getWritingDirection(),
              },
            ]}
          >
            {t("admin.dashboard.start", { defaultValue: "Start" })}: {item.startDate} -{" "}
            {t("admin.dashboard.end", { defaultValue: "End" })}: {item.endDate}
          </Text>
          <Text
            style={[
              styles.detailText,
              {
                textAlign: getTextAlign(),
                writingDirection: getWritingDirection(),
              },
            ]}
          >
            {t("tournaments.registrationFee")}: {item.entryFee}{" "}
            {t("common.currency.afg", { defaultValue: "AFG" })}
          </Text>
        </View>

        {item.status === "pending" && (
          <View style={[styles.actionButtons, { flexDirection: getFlexDirection() }]}>
          <TouchableOpacity
            style={[styles.actionButton, styles.approveButton, { flexDirection: getFlexDirection() }]}
            onPress={() => handleApproveTournament(item)}
          >
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={[styles.actionButtonText, getStartMargin(8), localizedTextStyle]}>
              {t("admin.dashboard.approve")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.rejectButton, { flexDirection: getFlexDirection() }]}
            onPress={() => handleRejectTournament(item)}
          >
            <Ionicons name="close-circle" size={20} color="#fff" />
            <Text style={[styles.actionButtonText, getStartMargin(8), localizedTextStyle]}>
              {t("admin.dashboard.reject")}
            </Text>
          </TouchableOpacity>
          </View>
        )}

        {item.status === "rejected" && item.rejectionReason && (
          <View style={styles.rejectionReason}>
            <Text
              style={[
                styles.rejectionLabel,
                {
                  textAlign: getTextAlign(),
                  writingDirection: getWritingDirection(),
                },
              ]}
          >
            {t("admin.dashboard.rejectionReason")}:
          </Text>
            <Text
              style={[
                styles.rejectionText,
                {
                  textAlign: getTextAlign(),
                  writingDirection: getWritingDirection(),
                },
              ]}
            >
              {item.rejectionReason}
            </Text>
          </View>
        )}

        {(status === "upcoming" || status === "in_progress" || status === "completed") && (
          <View style={styles.deleteButtonContainer}>
          <TouchableOpacity
            style={[styles.deleteButton, { flexDirection: getFlexDirection() }]}
            onPress={() => handleDeleteTournament(item)}
          >
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
            <Text style={[styles.deleteButtonText, getStartMargin(8), localizedTextStyle]}>
              {t("admin.dashboard.deleteTournament", {
                defaultValue: "Delete Tournament",
              })}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      </View>
    );
  };

  const renderContent = () => {
    let data = [];
    let emptyMessage = "";
    let renderItem = renderGymItem;

    switch (activeTab) {
      case "gym-pending":
        data = pendingGyms;
        emptyMessage = gymsLoading
          ? t("admin.dashboard.loadingGyms")
          : t("admin.dashboard.pendingGyms");
        break;
      case "gym-approved":
        data = approvedGyms;
        emptyMessage = gymsLoading
          ? t("admin.dashboard.loadingGyms")
          : t("admin.dashboard.approvedGyms");
        break;
      case "gym-rejected":
        data = rejectedGyms;
        emptyMessage = gymsLoading
          ? t("admin.dashboard.loadingGyms")
          : t("admin.dashboard.rejectedGyms");
        break;
      case "tournament-pending":
        data = pendingTournaments;
        emptyMessage = t("admin.dashboard.noPendingTournaments", {
          defaultValue: "No pending tournament requests",
        });
        renderItem = renderTournamentItem;
        break;
      case "tournament-approved":
        data = approvedTournaments;
        emptyMessage = t("admin.dashboard.noApprovedTournaments", {
          defaultValue: "No approved tournaments",
        });
        renderItem = renderTournamentItem;
        break;
    }

    return (
      <FlatList
        data={data}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="folder-open-outline" size={60} color="#9CA3AF" />
            <Text style={[styles.emptyText, localizedTextStyle]}>{emptyMessage}</Text>
          </View>
        }
      />
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.headerTop, { flexDirection: getFlexDirection() }]}>
          <View style={[styles.headerLeft, { flexDirection: getFlexDirection() }]}>
            <Ionicons name="shield-checkmark" size={28} color="#fff" />
            <Text style={[styles.headerTitle, getStartMargin(10), localizedTextStyle]}>
              {t("admin.dashboard.title")}
            </Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Ionicons name="log-out-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        <Text
          style={[
            styles.headerSubtitle,
            {
              textAlign: getTextAlign(),
              writingDirection: getWritingDirection(),
            },
          ]}
        >
          {t("admin.dashboard.welcome")}, {user?.full_name || user?.name || t("auth.roles.admin")}
        </Text>
      </View>

      {/* Stats */}
      <View style={[styles.statsContainer, { flexDirection: getFlexDirection() }]}>
        <View style={[styles.statCard, styles.statPending]}>
          <Text style={styles.statNumber}>{pendingGyms.length}</Text>
          <Text style={[styles.statLabel, localizedTextStyle]}>{t("admin.dashboard.pendingGyms")}</Text>
        </View>
        <View style={[styles.statCard, styles.statApproved]}>
          <Text style={styles.statNumber}>{approvedGyms.length}</Text>
          <Text style={[styles.statLabel, localizedTextStyle]}>{t("admin.dashboard.approvedGyms")}</Text>
        </View>
        <View style={[styles.statCard, styles.statPending]}>
          <Text style={styles.statNumber}>{pendingTournaments.length}</Text>
          <Text style={[styles.statLabel, localizedTextStyle]}>
            {t("admin.dashboard.pendingTournaments", {
              defaultValue: "Tournaments Pending",
            })}
          </Text>
        </View>
      </View>

      <View style={styles.contentPanel}>
        {/* Tabs */}
        <View style={styles.tabsSection}>
          <View style={[styles.tabContainer, { flexDirection: getFlexDirection() }]}>
            <TouchableOpacity
              style={[styles.tab, activeTab === "gym-pending" && styles.activeTab]}
              onPress={() => setActiveTab("gym-pending")}
            >
                <Text
                  style={[
                    styles.tabText,
                    localizedTextStyle,
                    activeTab === "gym-pending" && styles.activeTabText,
                  ]}
                >
                {t("admin.dashboard.pendingGyms")} 
                {/* ({pendingGyms.length}) */}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === "gym-approved" && styles.activeTab]}
              onPress={() => setActiveTab("gym-approved")}
            >
                <Text
                  style={[
                    styles.tabText,
                    localizedTextStyle,
                    activeTab === "gym-approved" && styles.activeTabText,
                  ]}
                >
                {t("admin.dashboard.approvedGyms")} 
                {/* ({approvedGyms.length}) */}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === "gym-rejected" && styles.activeTab]}
              onPress={() => setActiveTab("gym-rejected")}
            >
                <Text
                  style={[
                    styles.tabText,
                    localizedTextStyle,
                    activeTab === "gym-rejected" && styles.activeTabText,
                  ]}
                >
                {t("admin.dashboard.rejectedGyms")}
                 {/* ({rejectedGyms.length}) */}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.tabContainer, { flexDirection: getFlexDirection() }]}>
            <TouchableOpacity
              style={[styles.tab, activeTab === "tournament-pending" && styles.activeTab]}
              onPress={() => setActiveTab("tournament-pending")}
            >
                <Text
                  style={[
                    styles.tabText,
                    localizedTextStyle,
                    activeTab === "tournament-pending" && styles.activeTabText,
                  ]}
                >
                {t("admin.dashboard.pendingTournaments", {
                  defaultValue: "Tournaments Pending",
                })}{" "}
                {/* ({pendingTournaments.length}) */}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === "tournament-approved" && styles.activeTab]}
              onPress={() => setActiveTab("tournament-approved")}
            >
                <Text
                  style={[
                    styles.tabText,
                    localizedTextStyle,
                    activeTab === "tournament-approved" && styles.activeTabText,
                  ]}
                >
                {t("admin.dashboard.approvedTournaments", {
                  defaultValue: "Approved Tournaments",
                })}{" "}
                {/* ({approvedTournaments.length}) */}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Content */}
        {renderContent()}
      </View>

      {/* Reject Modal */}
      <Modal
        visible={showRejectModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRejectModal(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalOverlay}
          >
            <View style={styles.modalContent}>
              <Text
                style={[
                  styles.modalTitle,
                  {
                    textAlign: getTextAlign(),
                    writingDirection: getWritingDirection(),
                  },
                ]}
              >
                {t("admin.dashboard.reject")}{" "}
                {rejectType === "tournament"
                  ? t("tournaments.title")
                  : t("admin.dashboard.gyms")}
              </Text>
              <Text
                style={[
                  styles.modalSubtitle,
                  {
                    textAlign: getTextAlign(),
                    writingDirection: getWritingDirection(),
                  },
                ]}
              >
                {t("admin.dashboard.enterRejectionReason")}:{" "}
                {rejectType === "tournament"
                  ? selectedTournament?.name
                  : selectedGym?.name}
              </Text>

              <TextInput
                style={[
                  styles.modalInput,
                  {
                    textAlign: getTextAlign(),
                    writingDirection: getWritingDirection(),
                  },
                ]}
                placeholder={t("admin.dashboard.enterRejectionReason")}
                placeholderTextColor="#999"
                value={rejectReason}
                onChangeText={setRejectReason}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              <View style={[styles.modalButtons, { flexDirection: getFlexDirection() }]}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setShowRejectModal(false);
                    setRejectReason("");
                  }}
                >
                  <Text style={[styles.cancelButtonText, localizedTextStyle]}>
                    {t("admin.dashboard.cancel")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmRejectButton]}
                  onPress={confirmReject}
                >
                  <Text style={[styles.confirmRejectButtonText, localizedTextStyle]}>
                    {t("admin.dashboard.submitRejection")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    backgroundColor: PRIMARY_COLOR,
    paddingTop: 50,
    paddingBottom: 28,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
  headerTop: {
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLeft: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#fff",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#E8F7EA",
    marginTop: 8,
  },
  logoutButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  statsContainer: {
    padding: 16,
    gap: 12,
    marginTop: -18,
  },
  statCard: {
    marginTop:16,
    flex: 1,
    paddingVertical: 18,
    paddingHorizontal: 12,
    borderRadius: 18,
    alignItems: "center",
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#71dd91",
  },
  statPending: {
    backgroundColor: "#fff",
  },
  statApproved: {
    backgroundColor: "#fff",
  },
  statRejected: {
    backgroundColor: "#fff",
  },
  statNumber: {
    fontSize: 30,
    fontWeight: "800",
    color: PRIMARY_COLOR,
  },
  statLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 6,
  },
  contentPanel: {
    flex: 1,
  },
  tabsSection: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  tabContainer: {
    padding: 4,
    marginBottom: 10,
    backgroundColor: "#fff",
    borderRadius: 18,
    shadowColor: "#090909",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  activeTab: {
    backgroundColor: PRIMARY_COLOR,
  },
  tabText: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "600",
  },
  activeTabText: {
    color: "#fff",
    fontWeight: "700",
  },
  listContent: {
    padding: 16,
    paddingTop: 2,
    paddingBottom: 28,
  },
  gymCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#EDF2F7",
  },
  gymCardPending: {
    borderLeftWidth: 4,
    borderLeftColor: "#F59E0B",
  },
  gymCardApproved: {
    borderLeftWidth: 4,
    borderLeftColor: PRIMARY_COLOR,
  },
  gymCardRejected: {
    borderLeftWidth: 4,
    borderLeftColor: "#EF4444",
  },
  gymHeader: {
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  gymInfo: {
    flex: 1,
  },
  gymImageContainer: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: PRIMARY_TINT,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  gymImage: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
  },
  gymName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
  },
  gymAddress: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
  },
  gymDate: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
  },
  gymDetails: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  detailText: {
    fontSize: 14,
    color: "#4B5563",
    marginBottom: 6,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusPending: {
    backgroundColor: "#FEF3C7",
  },
  statusApproved: {
    backgroundColor: "#DCFCE7",
  },
  statusRejected: {
    backgroundColor: "#FEE2E2",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1F2937",
  },
  actionButtons: {
    marginTop: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 12,
    gap: 8,
  },
  approveButton: {
    backgroundColor: PRIMARY_COLOR,
  },
  rejectButton: {
    backgroundColor: "#EF4444",
  },
  actionButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  rejectionReason: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#FEE2E2",
    borderRadius: 12,
  },
  rejectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#991B1B",
  },
  rejectionText: {
    fontSize: 14,
    color: "#7F1D1D",
    marginTop: 4,
  },
  deleteButtonContainer: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 12,
  },
  deleteButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
    gap: 6,
  },
  deleteButtonText: {
    color: "#EF4444",
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 80,
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  emptyText: {
    fontSize: 16,
    color: "#9CA3AF",
    marginTop: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 22,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1F2937",
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 8,
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 14,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    color: "#1F2937",
    backgroundColor: "#F9FAFB",
  },
  modalButtons: {
    marginTop: 16,
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#F3F4F6",
  },
  cancelButtonText: {
    color: "#6B7280",
    fontWeight: "600",
  },
  confirmRejectButton: {
    backgroundColor: PRIMARY_COLOR,
  },
  confirmRejectButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
});







