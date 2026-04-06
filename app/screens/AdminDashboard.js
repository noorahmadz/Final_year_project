import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
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
import { useGym } from "../context/GymContext";

export default function AdminDashboard({ navigation }) {
  const {
    currentUser,
    logout,
    gyms,
    getPendingGyms,
    getApprovedGyms,
    getRejectedGyms,
    approveGym,
    rejectGym,
    deleteGym,
    admin,
    tournaments,
    getPendingTournaments,
    getApprovedTournaments,
    approveTournament,
    rejectTournament,
    deleteTournament,
  } = useGym();

  const [activeTab, setActiveTab] = useState("gym-pending");
  const [selectedGym, setSelectedGym] = useState(null);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectType, setRejectType] = useState("gym");

  const pendingGyms = getPendingGyms();
  const approvedGyms = getApprovedGyms();
  const rejectedGyms = getRejectedGyms();

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

  const tournamentsWithStatus = tournaments.map(item => ({
    ...item,
    calculatedStatus: getTournamentStatus(item)
  }));

  const pendingTournaments = tournamentsWithStatus.filter((t) => t.status === "pending");
  const approvedTournaments = tournamentsWithStatus.filter((t) => 
    t.calculatedStatus === "upcoming" || t.calculatedStatus === "in_progress" || t.calculatedStatus === "completed"
  );

  const handleApprove = (gym) => {
    Alert.alert(
      "Approve Gym",
      `Are you sure you want to approve "${gym.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Approve",
          onPress: () => {
            approveGym(gym.id, admin?.id);
            Alert.alert("Success", "Gym has been approved!");
          },
        },
      ],
    );
  };

  const handleReject = (gym) => {
    setSelectedGym(gym);
    setRejectType("gym");
    setShowRejectModal(true);
  };

  const handleDelete = (gym) => {
    Alert.alert(
      "Delete Gym",
      `Are you sure you want to permanently delete "${gym.name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteGym(gym.id);
            Alert.alert("Success", "Gym has been deleted!");
          },
        },
      ],
    );
  };

  const handleApproveTournament = (tournament) => {
    Alert.alert(
      "Approve Tournament",
      `Are you sure you want to approve "${tournament.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Approve",
          onPress: () => {
            approveTournament(tournament.id, admin?.id);
            Alert.alert("Success", "Tournament has been approved!");
          },
        },
      ],
    );
  };

  const handleRejectTournament = (tournament) => {
    setSelectedTournament(tournament);
    setRejectType("tournament");
    setShowRejectModal(true);
  };

  const handleDeleteTournament = (tournament) => {
    Alert.alert(
      "Delete Tournament",
      `Are you sure you want to permanently delete "${tournament.name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteTournament(tournament.id);
            Alert.alert("Success", "Tournament has been deleted!");
          },
        },
      ],
    );
  };

  const confirmReject = () => {
    if (rejectType === "gym" && selectedGym) {
      rejectGym(selectedGym.id, rejectReason);
      setShowRejectModal(false);
      setRejectReason("");
      setSelectedGym(null);
      Alert.alert("Success", "Gym has been rejected!");
    } else if (rejectType === "tournament" && selectedTournament) {
      rejectTournament(selectedTournament.id, rejectReason);
      setShowRejectModal(false);
      setRejectReason("");
      setSelectedTournament(null);
      Alert.alert("Success", "Tournament has been rejected!");
    }
  };

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        onPress: () => {
          logout();
          navigation.replace("Home");
        },
      },
    ]);
  };

  const renderGymItem = ({ item }) => (
    <View style={styles.gymCard}>
      <View style={styles.gymHeader}>
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
            <Ionicons name="fitness" size={30} color="#2563EB" />
          )}
        </View>
        <View style={styles.gymInfo}>
          <Text style={styles.gymName}>{item.name}</Text>
          <Text style={styles.gymAddress}>
            {item.address}, {item.city}
          </Text>
          <Text style={styles.gymDate}>
            Submitted: {new Date(item.submittedAt).toLocaleDateString()}
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
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>

      {item.status === "pending" && (
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, styles.approveButton]}
            onPress={() => handleApprove(item)}
          >
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>Approve</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.rejectButton]}
            onPress={() => handleReject(item)}
          >
            <Ionicons name="close-circle" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>Reject</Text>
          </TouchableOpacity>
        </View>
      )}

      {item.status === "rejected" && item.rejectionReason && (
        <View style={styles.rejectionReason}>
          <Text style={styles.rejectionLabel}>Rejection Reason:</Text>
          <Text style={styles.rejectionText}>{item.rejectionReason}</Text>
        </View>
      )}

      {item.status === "approved" && (
        <View style={styles.deleteButtonContainer}>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDelete(item)}
          >
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
            <Text style={styles.deleteButtonText}>Delete Gym</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderTournamentItem = ({ item }) => {
    const status = item.calculatedStatus || item.status;
    return (
    <View style={styles.gymCard}>
      <View style={styles.gymHeader}>
        <View style={styles.gymImageContainer}>
          <Ionicons name="trophy" size={30} color="#F59E0B" />
        </View>
        <View style={styles.gymInfo}>
          <Text style={styles.gymName}>{item.name}</Text>
          <Text style={styles.gymAddress}>
            {item.gymName}
          </Text>
          <Text style={styles.gymDate}>
            Created: {new Date(item.createdAt).toLocaleDateString()}
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
          <Text style={styles.statusText}>
            {status === "in_progress" ? "IN PROGRESS" : status.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.gymDetails}>
        <Text style={styles.detailText}>
          Start: {item.startDate} - End: {item.endDate}
        </Text>
        <Text style={styles.detailText}>
          Entry Fee: {item.entryFee} AFG
        </Text>
      </View>

      {item.status === "pending" && (
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, styles.approveButton]}
            onPress={() => handleApproveTournament(item)}
          >
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>Approve</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.rejectButton]}
            onPress={() => handleRejectTournament(item)}
          >
            <Ionicons name="close-circle" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>Reject</Text>
          </TouchableOpacity>
        </View>
      )}

      {item.status === "rejected" && item.rejectionReason && (
        <View style={styles.rejectionReason}>
          <Text style={styles.rejectionLabel}>Rejection Reason:</Text>
          <Text style={styles.rejectionText}>{item.rejectionReason}</Text>
        </View>
      )}

      {(status === "upcoming" || status === "in_progress" || status === "completed") && (
        <View style={styles.deleteButtonContainer}>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDeleteTournament(item)}
          >
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
            <Text style={styles.deleteButtonText}>Delete Tournament</Text>
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
        emptyMessage = "No pending gym requests";
        break;
      case "gym-approved":
        data = approvedGyms;
        emptyMessage = "No approved gyms";
        break;
      case "gym-rejected":
        data = rejectedGyms;
        emptyMessage = "No rejected gyms";
        break;
      case "tournament-pending":
        data = pendingTournaments;
        emptyMessage = "No pending tournament requests";
        renderItem = renderTournamentItem;
        break;
      case "tournament-approved":
        data = approvedTournaments;
        emptyMessage = "No approved tournaments";
        renderItem = renderTournamentItem;
        break;
    }

    return (
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="folder-open-outline" size={60} color="#9CA3AF" />
            <Text style={styles.emptyText}>{emptyMessage}</Text>
          </View>
        }
      />
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <Ionicons name="shield-checkmark" size={28} color="#7C3AED" />
            <Text style={styles.headerTitle}>Admin Dashboard</Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Ionicons name="log-out-outline" size={24} color="#666" />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerSubtitle}>
          Welcome, {admin?.name || "Admin"}
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={[styles.statCard, styles.statPending]}>
          <Text style={styles.statNumber}>{pendingGyms.length}</Text>
          <Text style={styles.statLabel}>Gyms Pending</Text>
        </View>
        <View style={[styles.statCard, styles.statApproved]}>
          <Text style={styles.statNumber}>{approvedGyms.length}</Text>
          <Text style={styles.statLabel}>Gyms Approved</Text>
        </View>
        <View style={[styles.statCard, styles.statPending]}>
          <Text style={styles.statNumber}>{pendingTournaments.length}</Text>
          <Text style={styles.statLabel}>Tournaments Pending</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "gym-pending" && styles.activeTab]}
          onPress={() => setActiveTab("gym-pending")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "gym-pending" && styles.activeTabText,
            ]}
          >
            Gyms ({pendingGyms.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "gym-approved" && styles.activeTab]}
          onPress={() => setActiveTab("gym-approved")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "gym-approved" && styles.activeTabText,
            ]}
          >
            Gyms ({approvedGyms.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "gym-rejected" && styles.activeTab]}
          onPress={() => setActiveTab("gym-rejected")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "gym-rejected" && styles.activeTabText,
            ]}
          >
            Gyms ({rejectedGyms.length})
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "tournament-pending" && styles.activeTab]}
          onPress={() => setActiveTab("tournament-pending")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "tournament-pending" && styles.activeTabText,
            ]}
          >
            Tournaments ({pendingTournaments.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "tournament-approved" && styles.activeTab]}
          onPress={() => setActiveTab("tournament-approved")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "tournament-approved" && styles.activeTabText,
            ]}
          >
            Tournaments ({approvedTournaments.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {renderContent()}

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
              <Text style={styles.modalTitle}>
                Reject {rejectType === "tournament" ? "Tournament" : "Gym"}
              </Text>
              <Text style={styles.modalSubtitle}>
                Please provide a reason for rejecting "{rejectType === "tournament" ? selectedTournament?.name : selectedGym?.name}"
              </Text>

              <TextInput
                style={styles.modalInput}
                placeholder="Rejection reason..."
                placeholderTextColor="#999"
                value={rejectReason}
                onChangeText={setRejectReason}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setShowRejectModal(false);
                    setRejectReason("");
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmRejectButton]}
                  onPress={confirmReject}
                >
                  <Text style={styles.confirmRejectButtonText}>Reject</Text>
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
    backgroundColor: "#F3F4F6",
  },
  header: {
    backgroundColor: "#fff",
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#1F2937",
    marginLeft: 10,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 5,
    marginLeft: 38,
  },
  logoutButton: {
    padding: 8,
  },
  statsContainer: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  statPending: {
    backgroundColor: "#FEF3C7",
  },
  statApproved: {
    backgroundColor: "#D1FAE5",
  },
  statRejected: {
    backgroundColor: "#FEE2E2",
  },
  statNumber: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1F2937",
  },
  statLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
  },
  tabContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTab: {
    borderBottomColor: "#7C3AED",
  },
  tabText: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
  },
  activeTabText: {
    color: "#7C3AED",
    fontWeight: "600",
  },
  listContent: {
    padding: 16,
    paddingTop: 0,
  },
  gymCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  gymHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  gymInfo: {
    flex: 1,
    marginLeft: 12,
  },
  gymImageContainer: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
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
    fontWeight: "600",
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
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  detailText: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 4,
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
    backgroundColor: "#D1FAE5",
  },
  statusRejected: {
    backgroundColor: "#FEE2E2",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1F2937",
  },
  actionButtons: {
    flexDirection: "row",
    marginTop: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  approveButton: {
    backgroundColor: "#10B981",
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
    borderRadius: 8,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 6,
  },
  deleteButtonText: {
    color: "#EF4444",
    fontWeight: "500",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
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
    borderRadius: 16,
    padding: 20,
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
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    color: "#1F2937",
  },
  modalButtons: {
    flexDirection: "row",
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
    backgroundColor: "#EF4444",
  },
  confirmRejectButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
});
