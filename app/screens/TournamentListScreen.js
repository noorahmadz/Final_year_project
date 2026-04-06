import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useGym } from "../context/GymContext";

export default function TournamentListScreen({ navigation }) {
  const { tournaments, gyms, registerTeamToTournament } = useGym();
  const [activeFilter, setActiveFilter] = useState("all");
  const [expandedCards, setExpandedCards] = useState({});
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [captainName, setCaptainName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [registrationFee, setRegistrationFee] = useState("");
  const [feeError, setFeeError] = useState("");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const getTournamentStatus = (item) => {
    const startDate = new Date(item.startDate);
    const endDate = new Date(item.endDate);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    if (item.status === "canceled") return "canceled";
    if (item.status === "completed") return "completed";
    if (today < startDate) return "upcoming";
    if (today >= startDate && today <= endDate) return "in_progress";
    if (today > endDate) return "completed";
    return item.status || "upcoming";
  };

  const approvedTournaments = tournaments
    .filter(
      (t) =>
        t.status === "upcoming" ||
        t.status === "in_progress" ||
        t.status === "completed" ||
        t.status === "pending" ||
        !t.status,
    )
    .map((item) => ({
      ...item,
      calculatedStatus: getTournamentStatus(item),
    }));

  const filteredTournaments =
    activeFilter === "all"
      ? approvedTournaments
      : approvedTournaments.filter((t) => t.calculatedStatus === activeFilter);

  const toggleCardExpansion = (tournamentId) => {
    setExpandedCards((prev) => ({
      ...prev,
      [tournamentId]: !prev[tournamentId],
    }));
  };

  const openAddTeamModal = (tournament) => {
    setSelectedTournament(tournament);
    setCaptainName("");
    setPhoneNumber("");
    setRegistrationFee("");
    setFeeError("");
    setShowTeamModal(true);
  };

  const handleAddTeam = () => {
    if (!captainName.trim()) {
      Alert.alert("Error", "Please enter captain name");
      return;
    }
    if (!phoneNumber.trim()) {
      Alert.alert("Error", "Please enter phone number");
      return;
    }
    if (!registrationFee.trim()) {
      Alert.alert("Error", "Please enter registration fee");
      return;
    }

    const feeValue = parseInt(registrationFee);
    if (feeValue !== selectedTournament.entryFee) {
      setFeeError(`You must enter exactly ${selectedTournament.entryFee} AFG`);
      return;
    }

    registerTeamToTournament(selectedTournament.id, {
      captainName: captainName.trim(),
      phoneNumber: phoneNumber.trim(),
      registrationFee: feeValue,
    });

    Alert.alert("Success", "Team registered successfully!");
    setShowTeamModal(false);
    setCaptainName("");
    setPhoneNumber("");
    setRegistrationFee("");
    setFeeError("");
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "upcoming":
        return {
          color: "#10B981",
          bg: "#D1FAE5",
          icon: "time-outline",
          label: "Upcoming",
        };
      case "completed":
        return {
          color: "#6B7280",
          bg: "#E5E7EB",
          icon: "checkmark-circle",
          label: "Completed",
        };
      case "canceled":
        return {
          color: "#EF4444",
          bg: "#FEE2E2",
          icon: "close-circle",
          label: "Canceled",
        };
      case "in_progress":
        return {
          color: "#3B82F6",
          bg: "#DBEAFE",
          icon: "play-circle",
          label: "In Progress",
        };
      default:
        return {
          color: "#6B7280",
          bg: "#F3F4F6",
          icon: "help-circle",
          label: status,
        };
    }
  };

  const renderTournamentItem = ({ item }) => {
    const gym = gyms.find((g) => g.id === item.gymId);
    const status = item.calculatedStatus || getTournamentStatus(item);
    const statusBadge = getStatusBadge(status);
    const startDate = new Date(item.startDate);
    const endDate = new Date(item.endDate);
    const isRegistrationOpen =
      new Date(item.registrationDeadline) >= new Date();
    const isExpanded = expandedCards[item.id];
    const registeredTeams = item.registeredTeams || [];

    return (
      <View style={styles.tournamentCard}>
        <View style={styles.tournamentHeader}>
          <View style={styles.tournamentTitleRow}>
            <Ionicons name="trophy" size={24} color="#F59E0B" />
            <Text style={styles.tournamentName}>{item.name}</Text>
          </View>
          <View
            style={[styles.statusBadge, { backgroundColor: statusBadge.bg }]}
          >
            <Ionicons
              name={statusBadge.icon}
              size={14}
              color={statusBadge.color}
            />
            <Text style={[styles.statusText, { color: statusBadge.color }]}>
              {statusBadge.label}
            </Text>
          </View>
        </View>

        <View style={styles.tournamentDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="business" size={16} color="#6B7280" />
            <Text style={styles.detailText}>
              {item.gymName || gym?.name || "Unknown Gym"}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="calendar-outline" size={16} color="#6B7280" />
            <Text style={styles.detailText}>
              {startDate.toLocaleDateString()} - {endDate.toLocaleDateString()}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="cash-outline" size={16} color="#6B7280" />
            <Text style={styles.detailText}>
              The team registration pay: {item.entryFee} AFG
            </Text>
          </View>
        </View>

        {status === "completed" && item.result && (
          <View style={styles.resultSection}>
            <Text style={styles.resultTitle}>Results</Text>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Winner:</Text>
              <Text style={styles.resultValue}>{item.result.winner}</Text>
            </View>
            {item.result.runnerUp && (
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Runner-up:</Text>
                <Text style={styles.resultValue}>{item.result.runnerUp}</Text>
              </View>
            )}
          </View>
        )}

        {status === "upcoming" && (
          <View style={styles.registrationInfo}>
            {isRegistrationOpen ? (
              <Text style={styles.registrationOpen}>
                Registration Open until{" "}
                {new Date(item.registrationDeadline).toLocaleDateString()}
              </Text>
            ) : (
              <Text style={styles.registrationClosed}>Registration Closed</Text>
            )}
          </View>
        )}

        {item.description && (
          <Text style={styles.description} numberOfLines={2}>
            {item.description}
          </Text>
        )}

        <View style={styles.cardActions}>
          {status === "upcoming" && isRegistrationOpen && (
            <TouchableOpacity
              style={styles.addTeamButton}
              onPress={() => openAddTeamModal(item)}
            >
              <Ionicons name="person-add" size={16} color="#fff" />
              <Text style={styles.addTeamButtonText}>Add Team</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.expandButton}
            onPress={() => toggleCardExpansion(item.id)}
          >
            <Ionicons
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={20}
              color="#fff"
            />
            <Text style={styles.expandButtonText}>
              {isExpanded ? "Less" : "More"}
            </Text>
          </TouchableOpacity>
        </View>

        {isExpanded && (
          <View style={styles.expandedContent}>
            <Text style={styles.registeredTeamsTitle}>Registered Teams</Text>
            {registeredTeams.length > 0 ? (
              registeredTeams.map((team, index) => (
                <View key={team.id || index} style={styles.teamItem}>
                  <View style={styles.teamInfo}>
                    <Ionicons name="people" size={16} color="#2563EB" />
                    <Text style={styles.teamName}>{team.captainName}</Text>
                  </View>
                  <Text style={styles.teamPhone}>{team.phoneNumber}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.noTeamsText}>No teams registered yet</Text>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tournaments</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Filter Buttons */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[
            styles.filterButton,
            activeFilter === "all" && styles.filterButtonActive,
          ]}
          onPress={() => setActiveFilter("all")}
        >
          <Text
            style={[
              styles.filterText,
              activeFilter === "all" && styles.filterTextActive,
            ]}
          >
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterButton,
            activeFilter === "upcoming" && styles.filterButtonActive,
          ]}
          onPress={() => setActiveFilter("upcoming")}
        >
          <Text
            style={[
              styles.filterText,
              activeFilter === "upcoming" && styles.filterTextActive,
            ]}
          >
            Upcoming
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterButton,
            activeFilter === "in_progress" && styles.filterButtonActive,
          ]}
          onPress={() => setActiveFilter("in_progress")}
        >
          <Text
            style={[
              styles.filterText,
              activeFilter === "in_progress" && styles.filterTextActive,
            ]}
          >
            In Progress
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterButton,
            activeFilter === "completed" && styles.filterButtonActive,
          ]}
          onPress={() => setActiveFilter("completed")}
        >
          <Text
            style={[
              styles.filterText,
              activeFilter === "completed" && styles.filterTextActive,
            ]}
          >
            Completed
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterButton,
            activeFilter === "canceled" && styles.filterButtonActive,
          ]}
          onPress={() => setActiveFilter("canceled")}
        >
          <Text
            style={[
              styles.filterText,
              activeFilter === "canceled" && styles.filterTextActive,
            ]}
          >
            Canceled
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tournament List */}
      {filteredTournaments.length > 0 ? (
        <FlatList
          data={filteredTournaments}
          renderItem={renderTournamentItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="trophy-outline" size={60} color="#ccc" />
          <Text style={styles.emptyText}>No tournaments found</Text>
          <Text style={styles.emptySubtext}>
            {activeFilter === "all"
              ? "Tournaments will appear here when added by gym owners"
              : `No ${activeFilter} tournaments available`}
          </Text>
        </View>
      )}

      <Modal
        visible={showTeamModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowTeamModal(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalContainer}
          >
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowTeamModal(false)}>
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Register Team</Text>
              <View style={{ width: 28 }} />
            </View>

            <ScrollView style={styles.modalContent}>
              <Text style={styles.tournamentInfo}>
                Tournament: {selectedTournament?.name}
              </Text>
              <Text style={styles.tournamentInfo}>
                Registration Fee: {selectedTournament?.entryFee} AFG
              </Text>

              <Text style={styles.inputLabel}>Captain Name *</Text>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="person-outline"
                  size={20}
                  color="#666"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Enter captain name"
                  placeholderTextColor="#999"
                  value={captainName}
                  onChangeText={setCaptainName}
                />
              </View>

              <Text style={styles.inputLabel}>Phone Number *</Text>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="call-outline"
                  size={20}
                  color="#666"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Enter phone number"
                  placeholderTextColor="#999"
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                />
              </View>

              <Text style={styles.inputLabel}>Registration Fee *</Text>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="cash-outline"
                  size={20}
                  color="#666"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder={`Enter ${selectedTournament?.entryFee || 0} AFG`}
                  placeholderTextColor="#999"
                  value={registrationFee}
                  onChangeText={(text) => {
                    setRegistrationFee(text);
                    setFeeError("");
                  }}
                  keyboardType="numeric"
                />
              </View>
              {feeError ? (
                <Text style={styles.errorText}>{feeError}</Text>
              ) : null}

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleAddTeam}
              >
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.submitButtonText}>Register Team</Text>
              </TouchableOpacity>
            </ScrollView>
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
    backgroundColor: "#F59E0B",
    padding: 20,
    paddingTop: 50,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
  },
  filterContainer: {
    flexDirection: "row",
    padding: 12,
    backgroundColor: "#f1eaea",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 20,
    marginRight: 4,
    backgroundColor: "#3974eb",
  },
  filterButtonActive: {
    backgroundColor: "#F59E0B",
  },
  filterText: {
    fontSize: 13,
    color: "#fff",
    fontWeight: "500",
  },
  filterTextActive: {
    color: "#fff",
  },
  listContent: {
    padding: 16,
  },
  tournamentCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  tournamentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  tournamentTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  tournamentName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1F2937",
    marginLeft: 8,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
  },
  tournamentDetails: {
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  detailText: {
    fontSize: 14,
    color: "#6B7280",
    marginLeft: 8,
  },
  resultSection: {
    backgroundColor: "#FEF3C7",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#92400E",
    marginBottom: 8,
  },
  resultRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  resultLabel: {
    fontSize: 14,
    color: "#92400E",
    fontWeight: "600",
    width: 80,
  },
  resultValue: {
    fontSize: 14,
    color: "#92400E",
  },
  registrationInfo: {
    marginTop: 8,
  },
  registrationOpen: {
    fontSize: 13,
    color: "#10B981",
    fontWeight: "500",
  },
  registrationClosed: {
    fontSize: 13,
    color: "#EF4444",
    fontWeight: "500",
  },
  description: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 8,
    fontStyle: "italic",
  },
  cardActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  addTeamButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#10B981",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  addTeamButtonText: {
    color: "#fff",
    fontWeight: "600",
    marginLeft: 6,
    fontSize: 14,
  },
  expandButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#6B7280",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  expandButtonText: {
    color: "#fff",
    fontWeight: "600",
    marginLeft: 6,
    fontSize: 14,
  },
  expandedContent: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  registeredTeamsTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 8,
  },
  teamItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  teamInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  teamName: {
    fontSize: 14,
    color: "#1F2937",
    fontWeight: "500",
    marginLeft: 6,
  },
  teamPhone: {
    fontSize: 13,
    color: "#6B7280",
  },
  noTeamsText: {
    fontSize: 13,
    color: "#9CA3AF",
    fontStyle: "italic",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1F2937",
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  tournamentInfo: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 4,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginTop: 16,
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: "#1F2937",
  },
  errorText: {
    color: "#EF4444",
    fontSize: 12,
    marginTop: 4,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10B981",
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 24,
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#666",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
    marginTop: 8,
    textAlign: "center",
  },
});
