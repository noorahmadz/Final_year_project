import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
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

export default function OwnerDashboard({ navigation }) {
  const {
    owner,
    gyms,
    bookings,
    logout,
    deleteGym,
    updateGym,
    addGYM,
    addCourtToGym,
    addDiscountToGym,
    updateDiscount,
    deleteDiscount,
    getGymById,
    createTournament,
    updateTournament,
    cancelTournament,
    completeTournament,
    getTournamentsByGym,
    tournaments,
  } = useGym();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingGym, setEditingGym] = useState(null);
  const [activeTab, setActiveTab] = useState("gyms"); // "gyms", "bookings", or "tournaments"

  // Tournament form states
  const [showTournamentModal, setShowTournamentModal] = useState(false);
  const [editingTournament, setEditingTournament] = useState(null);
  const [tournamentName, setTournamentName] = useState("");
  const [tournamentDescription, setTournamentDescription] = useState("");
  const [tournamentStartDate, setTournamentStartDate] = useState("");
  const [tournamentEndDate, setTournamentEndDate] = useState("");
  const [tournamentDeadline, setTournamentDeadline] = useState("");
  const [tournamentEntryFee, setTournamentEntryFee] = useState("");
  // const [tournamentPrize, setTournamentPrize] = useState("");
  // const [tournamentMaxTeams, setTournamentMaxTeams] = useState("");
  const [tournamentFormat, setTournamentFormat] = useState("knockout");
  const [tournamentRules, setTournamentRules] = useState("");
  const [selectedTournamentGym, setSelectedTournamentGym] = useState(null);
  const [selectedTournamentCourts, setSelectedTournamentCourts] = useState([]);
  const [availableCourts, setAvailableCourts] = useState([]);
  const [tournamentDuration, setTournamentDuration] = useState("60");
  const [tournamentTime, setTournamentTime] = useState("");

  // Result form states
  const [showResultModal, setShowResultModal] = useState(false);
  const [resultWinner, setResultWinner] = useState("");
  const [resultRunnerUp, setResultRunnerUp] = useState("");
  const [resultThirdPlace, setResultThirdPlace] = useState("");

  // Form states
  const [gymName, setGymName] = useState("");
  const [gymAddress, setGymAddress] = useState("");
  const [gymCity, setGymCity] = useState("");
  const [gymPhone, setGymPhone] = useState("");
  const [gymEmail, setGymEmail] = useState("");
  const [gymDescription, setGymDescription] = useState("");
  const [gymImage, setGymImage] = useState(null);

  // Court management states
  const [showCourtModal, setShowCourtModal] = useState(false);
  const [selectedGymForCourt, setSelectedGymForCourt] = useState(null);
  const [courtName, setCourtName] = useState("");
  const [openTime, setOpenTime] = useState("");
  const [closeTime, setCloseTime] = useState("");

  // Discount management states
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [selectedGymForDiscount, setSelectedGymForDiscount] = useState(null);
  const [editingDiscount, setEditingDiscount] = useState(null);
  const [discountValue, setDiscountValue] = useState("");
  const [discountDescription, setDiscountDescription] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [selectedCourts, setSelectedCourts] = useState([]); // Array of court IDs

  // Price intervals for each duration type
  const [priceData, setPriceData] = useState({
    30: [
      { id: 1, label: "Morning", startHour: 6, endHour: 12, price: "" },
      { id: 2, label: "Afternoon", startHour: 12, endHour: 17, price: "" },
      { id: 3, label: "Evening", startHour: 17, endHour: 22, price: "" },
    ],
    60: [
      { id: 1, label: "Morning", startHour: 6, endHour: 12, price: "" },
      { id: 2, label: "Afternoon", startHour: 12, endHour: 17, price: "" },
      { id: 3, label: "Evening", startHour: 17, endHour: 22, price: "" },
    ],
    90: [
      { id: 1, label: "Morning", startHour: 6, endHour: 12, price: "" },
      { id: 2, label: "Afternoon", startHour: 12, endHour: 17, price: "" },
      { id: 3, label: "Evening", startHour: 17, endHour: 22, price: "" },
    ],
  });

  // Update price for specific duration and interval
  const updatePrice = (duration, intervalId, value) => {
    setPriceData((prev) => ({
      ...prev,
      [duration]: prev[duration].map((interval) =>
        interval.id === intervalId ? { ...interval, price: value } : interval,
      ),
    }));
  };

  // Get gyms owned by current owner
  const ownerGyms = gyms.filter((gym) => gym.ownerId === owner?.id);

  // Get all bookings for owner's gyms
  const ownerGymIds = ownerGyms.map((g) => g.id);
  const ownerBookings = bookings.filter((booking) =>
    ownerGymIds.includes(booking.gymId),
  );

  // Sort bookings by date (most recent first)
  const sortedBookings = [...ownerBookings].sort((a, b) => {
    return new Date(b.bookedAt || 0) - new Date(a.bookedAt || 0);
  });

  // Get tournaments for owner's gyms
  const ownerTournaments = tournaments.filter((t) =>
    ownerGymIds.includes(t.gymId),
  );

  const upcomingTournaments = ownerTournaments.filter(
    (t) => t.status === "upcoming",
  );
  const pendingTournaments = ownerTournaments.filter(
    (t) => t.status === "pending",
  );
  const completedTournaments = ownerTournaments.filter(
    (t) => t.status === "completed",
  );
  const canceledTournaments = ownerTournaments.filter(
    (t) => t.status === "canceled",
  );

  // Get gym counts by status
  const pendingCount = ownerGyms.filter((g) => g.status === "pending").length;
  const approvedCount = ownerGyms.filter((g) => g.status === "approved").length;
  const rejectedCount = ownerGyms.filter((g) => g.status === "rejected").length;

  // Track previous statuses to detect changes
  const [prevGymStatuses, setPrevGymStatuses] = useState({});
  const [prevTournamentStatuses, setPrevTournamentStatuses] = useState({});

  useEffect(() => {
    if (!owner) {
      navigation.replace("OwnerLogin");
    }
  }, [owner]);

  // Check for status changes and show notifications
  useEffect(() => {
    const newStatuses = {};
    ownerGyms.forEach((gym) => {
      newStatuses[gym.id] = gym.status;

      // Check if status changed from previous
      if (prevGymStatuses[gym.id] && prevGymStatuses[gym.id] !== gym.status) {
        if (gym.status === "approved") {
          Alert.alert(
            "🎉 Gym Approved!",
            `Your gym "${gym.name}" has been approved and is now visible to users!`,
            [{ text: "OK" }],
          );
        } else if (gym.status === "rejected") {
          Alert.alert(
            "❌ Gym Rejected",
            `Your gym "${gym.name}" has been rejected.${gym.rejectionReason ? `\n\nReason: ${gym.rejectionReason}` : ""}`,
            [{ text: "OK" }],
          );
        }
      }
    });
    setPrevGymStatuses(newStatuses);
  }, [gyms]);

  // Check for tournament status changes
  useEffect(() => {
    const newStatuses = {};
    ownerTournaments.forEach((tournament) => {
      newStatuses[tournament.id] = tournament.status;

      if (
        prevTournamentStatuses[tournament.id] &&
        prevTournamentStatuses[tournament.id] !== tournament.status
      ) {
        if (tournament.status === "upcoming") {
          Alert.alert(
            "🎉 Tournament Approved!",
            `Your tournament "${tournament.name}" has been approved and is now visible to users!`,
            [{ text: "OK" }],
          );
        } else if (tournament.status === "rejected") {
          Alert.alert(
            "❌ Tournament Rejected",
            `Your tournament "${tournament.name}" has been rejected.${tournament.rejectionReason ? `\n\nReason: ${tournament.rejectionReason}` : ""}`,
            [{ text: "OK" }],
          );
        }
      }
    });
    setPrevTournamentStatuses(newStatuses);
  }, [tournaments]);

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: () => {
          logout();
          navigation.replace("Home");
        },
      },
    ]);
  };

  const handleDeleteGym = (gymId, gymName) => {
    Alert.alert(
      "Delete Gym",
      `Are you sure you want to delete "${gymName}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteGym(gymId),
        },
      ],
    );
  };

  // Image picker function
  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      setGymImage(result.assets[0].uri);
    }
  };

  const resetForm = () => {
    setGymName("");
    setGymAddress("");
    setGymCity("");
    setGymPhone("");
    setGymEmail("");
    setGymDescription("");
    setGymImage(null);
    setEditingGym(null);
  };

  // Court management methods
  const openCourtModal = (gym) => {
    setSelectedGymForCourt(gym);
    setCourtName("");
    setPriceData({
      30: [
        { id: 1, label: "Morning", startHour: 6, endHour: 12, price: "" },
        { id: 2, label: "Afternoon", startHour: 12, endHour: 17, price: "" },
        { id: 3, label: "Evening", startHour: 17, endHour: 22, price: "" },
      ],
      60: [
        { id: 1, label: "Morning", startHour: 6, endHour: 12, price: "" },
        { id: 2, label: "Afternoon", startHour: 12, endHour: 17, price: "" },
        { id: 3, label: "Evening", startHour: 17, endHour: 22, price: "" },
      ],
      90: [
        { id: 1, label: "Morning", startHour: 6, endHour: 12, price: "" },
        { id: 2, label: "Afternoon", startHour: 12, endHour: 17, price: "" },
        { id: 3, label: "Evening", startHour: 17, endHour: 22, price: "" },
      ],
    });
    setShowCourtModal(true);
  };

  const handleAddCourt = () => {
    if (!courtName.trim()) {
      Alert.alert("Error", "Please enter court name");
      return;
    }
    if (!selectedGymForCourt) {
      Alert.alert("Error", "No gym selected");
      return;
    }

    // Process price data - convert to numbers
    const processPriceData = (duration) => {
      return priceData[duration]
        .filter((interval) => interval.price && interval.price.trim() !== "")
        .map((interval) => ({
          id: interval.id,
          label: interval.label,
          startHour: interval.startHour,
          endHour: interval.endHour,
          price: parseInt(interval.price) || 0,
        }));
    };

    const price30minData = processPriceData(30);
    const price60minData = processPriceData(60);
    const price90minData = processPriceData(90);

    const getBasePrice = (data) => {
      if (data.length > 0 && data[0].price) return data[0].price;
      return 0;
    };

    const newCourt = {
      name: courtName.trim(),
      price30min: getBasePrice(price30minData),
      price60min: getBasePrice(price60minData),
      price90min: getBasePrice(price90minData),
      priceIntervals: {
        30: price30minData,
        60: price60minData,
        90: price90minData,
      },
      timing: { open: openTime || "6:00 AM", close: closeTime || "10:00 PM" },
    };

    addCourtToGym(selectedGymForCourt.id, newCourt);
    setCourtName("");
    setShowCourtModal(false);
    setSelectedGymForCourt(null);
    Alert.alert("Success", "Court added successfully!");
  };

  // Discount management methods
  const openDiscountModal = (gym) => {
    setSelectedGymForDiscount(gym);
    setEditingDiscount(null);
    setDiscountValue("");
    setDiscountDescription("");
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(today.getFullYear() + 1);
    setValidFrom(today.toISOString().split("T")[0]);
    setValidTo(nextYear.toISOString().split("T")[0]);
    setSelectedCourts([]);
    setShowDiscountModal(true);
  };

  const openEditDiscountModal = (gym, discount) => {
    setSelectedGymForDiscount(gym);
    setEditingDiscount(discount);
    setDiscountValue(discount.value?.toString() || "");
    setDiscountDescription(discount.description || "");
    setValidFrom(discount.validFrom || "");
    setValidTo(discount.validTo || "");
    setSelectedCourts(discount.courts || []);
    setShowDiscountModal(true);
  };

  const handleSaveDiscount = () => {
    if (
      !discountValue.trim() ||
      !discountDescription.trim() ||
      !validFrom ||
      !validTo
    ) {
      Alert.alert("Error", "Please fill all required fields");
      return;
    }

    if (new Date(validFrom) >= new Date(validTo)) {
      Alert.alert("Error", "Valid from date must be before valid to date");
      return;
    }

    const discountData = {
      type: "percentage",
      value: parseFloat(discountValue),
      description: discountDescription.trim(),
      validFrom: validFrom,
      validTo: validTo,
      courts: selectedCourts,
    };

    if (editingDiscount) {
      updateDiscount(
        selectedGymForDiscount.id,
        editingDiscount.id,
        discountData,
      );
      Alert.alert("Success", "Discount updated successfully!");
    } else {
      addDiscountToGym(selectedGymForDiscount.id, discountData);
      Alert.alert("Success", "Discount added successfully!");
    }

    setShowDiscountModal(false);
    resetDiscountForm();
  };

  const handleDeleteDiscount = (gymId, discountId, discountDescription) => {
    Alert.alert(
      "Delete Discount",
      `Are you sure you want to delete "${discountDescription}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteDiscount(gymId, discountId);
            Alert.alert("Success", "Discount deleted successfully!");
          },
        },
      ],
    );
  };

  const resetDiscountForm = () => {
    setSelectedGymForDiscount(null);
    setEditingDiscount(null);
    setDiscountValue("");
    setDiscountDescription("");
    setValidFrom("");
    setValidTo("");
    setSelectedCourts([]);
  };

  const toggleCourtSelection = (courtId) => {
    setSelectedCourts((prev) =>
      prev.includes(courtId)
        ? prev.filter((id) => id !== courtId)
        : [...prev, courtId],
    );
  };

  // Tournament form functions
  const openTournamentModal = (gym) => {
    setSelectedTournamentGym(gym);
    setAvailableCourts(gym.courts || []);
    setEditingTournament(null);
    setTournamentName("");
    setTournamentDescription("");
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    const twoWeeksLater = new Date(nextWeek);
    twoWeeksLater.setDate(nextWeek.getDate() + 7);
    const deadline = new Date(nextWeek);
    deadline.setDate(nextWeek.getDate() - 3);
    setTournamentStartDate(nextWeek.toISOString().split("T")[0]);
    setTournamentEndDate(twoWeeksLater.toISOString().split("T")[0]);
    setTournamentDeadline(deadline.toISOString().split("T")[0]);
    setTournamentEntryFee("5000");
    // setTournamentPrize("Winner: 20000, Runner-up: 10000");
    // setTournamentMaxTeams("8");
    setTournamentFormat("knockout");
    setTournamentRules("Standard rules apply");
    setSelectedTournamentCourts([]);
    setTournamentDuration("60");
    setTournamentTime("");
    setShowTournamentModal(true);
  };

  const handleSaveTournament = () => {
    if (!tournamentName.trim()) {
      Alert.alert("Error", "Please enter tournament name");
      return;
    }
    if (!selectedTournamentGym) {
      Alert.alert("Error", "Please select a gym");
      return;
    }
    if (selectedTournamentCourts.length === 0) {
      Alert.alert("Error", "Please select at least one court");
      return;
    }
    if (!tournamentTime) {
      Alert.alert("Error", "Please select a time");
      return;
    }
    if (!tournamentStartDate || !tournamentEndDate) {
      Alert.alert("Error", "Please select start and end dates");
      return;
    }
    if (!tournamentEntryFee) {
      Alert.alert("Error", "Please enter registration pay");
      return;
    }

    const tournamentData = {
      name: tournamentName.trim(),
      description: tournamentDescription.trim(),
      startDate: tournamentStartDate,
      endDate: tournamentEndDate,
      registrationDeadline: tournamentDeadline,
      entryFee: parseInt(tournamentEntryFee),
      // prizeMoney: tournamentPrize.trim(),
      // maxTeams: parseInt(tournamentMaxTeams) || 8,
      format: tournamentFormat,
      rules: tournamentRules.trim(),
      gymId: selectedTournamentGym.id,
      gymName: selectedTournamentGym.name,
      courts: selectedTournamentCourts,
      duration: parseInt(tournamentDuration),
      time: tournamentTime,
      createdBy: owner?.id,
    };

    if (editingTournament) {
      updateTournament(editingTournament.id, tournamentData);
      Alert.alert("Success", "Tournament updated successfully!");
    } else {
      createTournament(tournamentData);
      Alert.alert("Success", "Tournament created successfully!");
    }

    setShowTournamentModal(false);
    resetTournamentForm();
  };

  const resetTournamentForm = () => {
    setSelectedTournamentGym(null);
    setEditingTournament(null);
    setTournamentName("");
    setTournamentDescription("");
    setTournamentStartDate("");
    setTournamentEndDate("");
    setTournamentDeadline("");
    setTournamentEntryFee("");
    // setTournamentPrize("");
    // setTournamentMaxTeams("");
    setTournamentFormat("knockout");
    setTournamentRules("");
    setSelectedTournamentCourts([]);
    setTournamentDuration("60");
    setTournamentTime("");
  };

  const handleAddResult = () => {
    if (!resultWinner.trim()) {
      Alert.alert("Error", "Please enter winner team name");
      return;
    }

    const result = {
      winner: resultWinner.trim(),
      runnerUp: resultRunnerUp.trim() || null,
      thirdPlace: resultThirdPlace.trim() || null,
    };

    completeTournament(editingTournament.id, result);
    Alert.alert("Success", "Tournament result added successfully!");
    setShowResultModal(false);
    setEditingTournament(null);
    setResultWinner("");
    setResultRunnerUp("");
    setResultThirdPlace("");
  };

  const toggleTournamentCourtSelection = (courtId) => {
    setSelectedTournamentCourts((prev) =>
      prev.includes(courtId)
        ? prev.filter((id) => id !== courtId)
        : [...prev, courtId],
    );
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (gym) => {
    setEditingGym(gym);
    setGymName(gym.name);
    setGymAddress(gym.address || "");
    setGymCity(gym.city || "");
    setGymPhone(gym.phone || "");
    setGymEmail(gym.email || "");
    setGymDescription(gym.description || "");
    setGymImage(gym.image || null); // Load existing gym image
    setShowAddModal(true);
  };

  const handleSaveGym = () => {
    if (!gymName.trim()) {
      Alert.alert("Error", "Please enter gym name");
      return;
    }

    const gymData = {
      name: gymName.trim(),
      address: gymAddress.trim(),
      city: gymCity.trim(),
      phone: gymPhone.trim(),
      email: gymEmail.trim(),
      description: gymDescription.trim(),
      image: gymImage, // Add gym image to gym data
      ownerId: owner?.id,
    };

    if (editingGym) {
      updateGym(editingGym.id, gymData);
      Alert.alert("Success", "Gym updated successfully!");
    } else {
      addGYM({
        ...gymData,
        timing: {
          Mon: { open: "6:00 AM", close: "10:00 PM" },
          Tue: { open: "6:00 AM", close: "10:00 PM" },
          Wed: { open: "6:00 AM", close: "10:00 PM" },
          Thu: { open: "6:00 AM", close: "10:00 PM" },
          Fri: { open: "6:00 AM", close: "10:00 PM" },
          Sat: { open: "6:00 AM", close: "10:00 PM" },
          Sun: { open: "6:00 AM", close: "10:00 PM" },
        },
        courts: [],
      });
      Alert.alert("Success", "Gym added successfully!");
    }

    setShowAddModal(false);
    resetForm();
  };

  const renderGymItem = ({ item }) => {
    // Get status badge styles
    const getStatusStyle = () => {
      switch (item.status) {
        case "approved":
          return styles.statusApproved;
        case "rejected":
          return styles.statusRejected;
        default:
          return styles.statusPending;
      }
    };

    const getStatusIcon = () => {
      switch (item.status) {
        case "approved":
          return "checkmark-circle";
        case "rejected":
          return "close-circle";
        default:
          return "time-outline";
      }
    };

    return (
      <View style={styles.gymCard}>
        <View style={styles.gymCardContent}>
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
              <Ionicons name="fitness" size={40} color="#2563EB" />
            )}
          </View>
          <View style={styles.gymInfo}>
            <View style={styles.gymNameRow}>
              <Text style={styles.gymName}>{item.name}</Text>
              <View style={[styles.statusBadge, getStatusStyle()]}>
                <Ionicons name={getStatusIcon()} size={12} color="#fff" />
                <Text style={styles.statusText}>
                  {item.status?.toUpperCase() || "PENDING"}
                </Text>
              </View>
            </View>
            <Text style={styles.gymDetail}>
              <Ionicons name="location" size={14} /> {item.address}, {item.city}
            </Text>
            <Text style={styles.gymDetail}>
              <Ionicons name="call" size={14} /> {item.phone}
            </Text>
            <Text style={styles.gymDetail}>
              Courts: {item.courts?.length || 0}
            </Text>
            {item.status === "rejected" && item.rejectionReason && (
              <Text style={styles.rejectionText}>
                Reason: {item.rejectionReason}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.gymActions}>
          <TouchableOpacity
            style={styles.courtButton}
            onPress={() => openCourtModal(item)}
          >
            <Ionicons name="layers-outline" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.discountButton}
            onPress={() => openDiscountModal(item)}
          >
            <Ionicons name="pricetag-outline" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => openEditModal(item)}
          >
            <Ionicons name="pencil" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDeleteGym(item.id, item.name)}
          >
            <Ionicons name="trash" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Render booking item
  const renderBookingItem = ({ item }) => {
    const gym = getGymById(item.gymId);

    const getStatusBadge = () => {
      switch (item.status) {
        case "confirmed":
          return { color: "#10B981", bg: "#D1FAE5", icon: "checkmark-circle" };
        case "pending_payment":
          return { color: "#F59E0B", bg: "#FEF3C7", icon: "time-outline" };
        case "cancelled":
          return { color: "#EF4444", bg: "#FEE2E2", icon: "close-circle" };
        default:
          return { color: "#6B7280", bg: "#F3F4F6", icon: "help-circle" };
      }
    };

    const statusBadge = getStatusBadge();

    return (
      <View style={styles.bookingCard}>
        <View style={styles.bookingHeader}>
          <View style={styles.bookingGymInfo}>
            <Ionicons name="fitness" size={24} color="#2563EB" />
            <View style={styles.bookingGymDetails}>
              <Text style={styles.bookingGymName}>
                {gym?.name || "Unknown Gym"}
              </Text>
              <Text style={styles.bookingCourt}>{item.court}</Text>
            </View>
          </View>
          <View
            style={[
              styles.bookingStatusBadge,
              { backgroundColor: statusBadge.bg },
            ]}
          >
            <Ionicons
              name={statusBadge.icon}
              size={14}
              color={statusBadge.color}
            />
            <Text
              style={[styles.bookingStatusText, { color: statusBadge.color }]}
            >
              {item.status?.toUpperCase() || "PENDING"}
            </Text>
          </View>
        </View>

        <View style={styles.bookingDetails}>
          <View style={styles.bookingDetailRow}>
            <Ionicons name="calendar-outline" size={16} color="#6B7280" />
            <Text style={styles.bookingDetailText}>{item.date}</Text>
          </View>
          <View style={styles.bookingDetailRow}>
            <Ionicons name="time-outline" size={16} color="#6B7280" />
            <Text style={styles.bookingDetailText}>{item.time}</Text>
          </View>
          <View style={styles.bookingDetailRow}>
            <Ionicons name="timer-outline" size={16} color="#6B7280" />
            <Text style={styles.bookingDetailText}>
              {item.duration} Minutes
            </Text>
          </View>
        </View>

        <View style={styles.bookingDivider} />

        <View style={styles.bookingFooter}>
          <View style={styles.customerInfo}>
            <Ionicons name="person-outline" size={16} color="#6B7280" />
            <Text style={styles.customerEmail}>
              {item.customerEmail || "No email"}
            </Text>
          </View>
          <View style={styles.priceContainer}>
            <Text style={styles.priceLabel}>Total:</Text>
            <Text style={styles.priceValue}>{item.price} AFG</Text>
          </View>
        </View>

        {item.bookedAt && (
          <Text style={styles.bookedAtText}>
            Booked: {new Date(item.bookedAt).toLocaleString()}
          </Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Welcome back: {owner?.name}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={24} color="#black" />
        </TouchableOpacity>
      </View>

      {/* Tab Buttons */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === "gyms" && styles.tabButtonActive,
          ]}
          onPress={() => setActiveTab("gyms")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "gyms" && styles.tabTextActive,
            ]}
          >
            My Gyms
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === "bookings" && styles.tabButtonActive,
          ]}
          onPress={() => setActiveTab("bookings")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "bookings" && styles.tabTextActive,
            ]}
          >
            Bookings ({sortedBookings.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === "tournaments" && styles.tabButtonActive,
          ]}
          onPress={() => setActiveTab("tournaments")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "tournaments" && styles.tabTextActive,
            ]}
          >
            Tournaments
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content based on active tab */}
      {activeTab === "gyms" ? (
        <>
          {/* Stats */}
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{ownerGyms.length}</Text>
              <Text style={styles.statLabel}>My Gyms</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{sortedBookings.length}</Text>
              <Text style={styles.statLabel}>Total Bookings</Text>
            </View>
          </View>

          {/* My Gyms Section */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Gyms</Text>
            <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
              <Ionicons name="add" size={24} color="#black" fontWeight="bold" />
              <Text style={styles.addButtonText}>Add Gym</Text>
            </TouchableOpacity>
          </View>

          {/* Gyms List */}
          {ownerGyms.length > 0 ? (
            <FlatList
              data={ownerGyms}
              renderItem={renderGymItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="business-outline" size={60} color="#ccc" />
              <Text style={styles.emptyText}>No gyms yet</Text>
              <Text style={styles.emptySubtext}>
                Add your first gym to get started
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={openAddModal}
              >
                <Text style={styles.emptyButtonText}>Add Gym</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : activeTab === "bookings" ? (
        <>
          {/* Bookings Section */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Bookings</Text>
          </View>

          {sortedBookings.length > 0 ? (
            <FlatList
              data={sortedBookings}
              renderItem={renderBookingItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={60} color="#ccc" />
              <Text style={styles.emptyText}>No bookings yet</Text>
              <Text style={styles.emptySubtext}>
                Bookings will appear here when customers make payments
              </Text>
            </View>
          )}
        </>
      ) : activeTab === "tournaments" ? (
        <>
          {/* Tournaments Section */}
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{pendingTournaments.length}</Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>
                {upcomingTournaments.length}
              </Text>
              <Text style={styles.statLabel}>Upcoming</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>
                {completedTournaments.length}
              </Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Tournaments</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => {
                if (ownerGyms.length > 0) {
                  openTournamentModal(ownerGyms[0]);
                } else {
                  Alert.alert(
                    "No Gyms",
                    "Please add a gym first before creating a tournament.",
                  );
                }
              }}
            >
              <Ionicons name="add" size={24} color="#black" fontWeight="bold" />
              <Text style={styles.addButtonText}>Add Tournament</Text>
            </TouchableOpacity>
          </View>

          {ownerTournaments.length > 0 ? (
            <FlatList
              data={ownerTournaments}
              renderItem={({ item }) => (
                <View style={styles.tournamentCard}>
                  <View style={styles.tournamentHeader}>
                    <View style={styles.tournamentTitleRow}>
                      <Ionicons name="trophy" size={24} color="#F59E0B" />
                      <Text style={styles.tournamentName}>{item.name}</Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        item.status === "pending"
                          ? styles.statusPending
                          : item.status === "upcoming"
                            ? styles.statusApproved
                            : item.status === "completed"
                              ? styles.statusApproved
                              : styles.statusRejected,
                      ]}
                    >
                      <Text style={styles.statusText}>
                        {item.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.tournamentDetail}>
                    {item.gymName} | {item.startDate} - {item.endDate}
                  </Text>
                  <Text style={styles.tournamentDetail}>
                    registration pay for team: {item.entryFee} AFG
                  </Text>
                  {(item.registeredTeams && item.registeredTeams.length > 0) ? (
                    <View style={styles.registeredTeamsSection}>
                      <Text style={styles.registeredTeamsTitle}>
                        Registered Teams ({item.registeredTeams.length})
                      </Text>
                      {item.registeredTeams.map((team, index) => (
                        <View key={team.id || index} style={styles.registeredTeamItem}>
                          <View style={styles.teamInfoRow}>
                            <Ionicons name="person" size={14} color="#2563EB" />
                            <Text style={styles.teamCaptainName}>{team.captainName}</Text>
                          </View>
                          <Text style={styles.teamPhoneNum}>{team.phoneNumber}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.noTeamsRegistered}>No teams registered yet</Text>
                  )}
                  {item.status === "pending" && (
                    <Text style={styles.pendingApprovalText}>
                      Awaiting admin approval
                    </Text>
                  )}
                  <View style={styles.tournamentActions}>
                    {item.status === "upcoming" && (
                      <>
                        <TouchableOpacity
                          style={styles.completeButton}
                          onPress={() => {
                            setEditingTournament(item);
                            setResultWinner("");
                            setResultRunnerUp("");
                            setResultThirdPlace("");
                            setShowResultModal(true);
                          }}
                        >
                          <Ionicons
                            name="checkmark-circle"
                            size={18}
                            color="#fff"
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.cancelButton}
                          onPress={() => {
                            Alert.alert(
                              "Cancel Tournament",
                              "Are you sure you want to cancel this tournament?",
                              [
                                { text: "No", style: "cancel" },
                                {
                                  text: "Yes",
                                  style: "destructive",
                                  onPress: () => cancelTournament(item.id),
                                },
                              ],
                            );
                          }}
                        >
                          <Ionicons
                            name="close-circle"
                            size={18}
                            color="#fff"
                          />
                        </TouchableOpacity>
                      </>
                    )}
                    {item.status === "completed" && item.result && (
                      <View style={styles.resultDisplay}>
                        <Text style={styles.resultText}>
                          Winner: {item.result.winner}
                        </Text>
                        {/* {item.result.runnerUp && (
                          <Text style={styles.resultText}>
                            Runner-up: {item.result.runnerUp}
                          </Text>
                        )} */}
                      </View>
                    )}
                  </View>
                </View>
              )}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="trophy-outline" size={60} color="#ccc" />
              <Text style={styles.emptyText}>No tournaments yet</Text>
              <Text style={styles.emptySubtext}>
                Add your first tournament to get started
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => setShowTournamentModal(true)}
              >
                <Text style={styles.emptyButtonText}>Add Tournament</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : null}

      {/* View All Gyms Button */}
      <TouchableOpacity
        style={styles.viewAllButton}
        onPress={() => navigation.navigate("Home")}
      >
        <Ionicons name="eye-outline" size={20} color="#2563EB" />
        <Text style={styles.viewAllText}>View All Gyms (User View)</Text>
      </TouchableOpacity>

      {/* Add/Edit Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddModal(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalContainer}
          >
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>
                {editingGym ? "Edit Gym" : "Add New Gym"}
              </Text>
              <TouchableOpacity onPress={handleSaveGym}>
                <Text style={styles.saveButton}>Save</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent}>
              <Text style={styles.inputLabel}>Gym Name *</Text>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="business-outline"
                  size={20}
                  color="#666"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Enter gym name"
                  placeholderTextColor="#999"
                  value={gymName}
                  onChangeText={setGymName}
                />
              </View>

              <Text style={styles.inputLabel}>Address</Text>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="location-outline"
                  size={20}
                  color="#666"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Enter address"
                  placeholderTextColor="#999"
                  value={gymAddress}
                  onChangeText={setGymAddress}
                />
              </View>

              <Text style={styles.inputLabel}>Gym Image</Text>
              <TouchableOpacity
                style={styles.imagePickerContainer}
                onPress={pickImage}
              >
                {gymImage ? (
                  <Image
                    source={{ uri: gymImage }}
                    style={styles.selectedImage}
                  />
                ) : (
                  <View style={styles.imagePickerPlaceholder}>
                    <Ionicons name="camera-outline" size={40} color="#666" />
                    <Text style={styles.imagePickerText}>
                      Tap to select image
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              <Text style={styles.inputLabel}>Phone</Text>
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
                  value={gymPhone}
                  onChangeText={setGymPhone}
                  keyboardType="phone-pad"
                />
              </View>

              <Text style={styles.inputLabel}>Email</Text>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color="#666"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Enter email"
                  placeholderTextColor="#999"
                  value={gymEmail}
                  onChangeText={setGymEmail}
                  keyboardType="email-address"
                />
              </View>

              <Text style={styles.inputLabel}>Description</Text>
              <View style={[styles.inputContainer, styles.textAreaContainer]}>
                <TextInput
                  style={styles.textArea}
                  placeholder="Enter gym description"
                  placeholderTextColor="#999"
                  value={gymDescription}
                  onChangeText={setGymDescription}
                  multiline
                  numberOfLines={4}
                />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Court Management Modal */}
      <Modal
        visible={showCourtModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCourtModal(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.courtModalOverlay}>
            <View style={styles.courtModalContent}>
              <View style={styles.courtModalHeader}>
                <Text style={styles.courtModalTitle}>Add Court</Text>
                <TouchableOpacity onPress={() => setShowCourtModal(false)}>
                  <Ionicons name="close" size={24} color="#333" />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.courtModalBody}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={true}
              >
                <Text style={styles.selectedGymLabel}>
                  Adding court to: {selectedGymForCourt?.name}
                </Text>

                <Text style={styles.inputLabel}>Court Name *</Text>
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="layers-outline"
                    size={20}
                    color="#666"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., Court 1, Padel Court A"
                    placeholderTextColor="#999"
                    value={courtName}
                    onChangeText={setCourtName}
                  />
                </View>

                {/* 30 Min Prices */}
                <Text style={[styles.inputLabel, { marginTop: 16 }]}>
                  30 Min Prices (AFG)
                </Text>
                <View style={styles.priceRow}>
                  <View style={styles.priceColumn}>
                    <Text style={styles.intervalLabelText}>Morning</Text>
                    <TextInput
                      style={styles.priceInput}
                      placeholder="0"
                      placeholderTextColor="#999"
                      value={priceData[30][0].price}
                      onChangeText={(value) => updatePrice(30, 1, value)}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.priceColumn}>
                    <Text style={styles.intervalLabelText}>Afternoon</Text>
                    <TextInput
                      style={styles.priceInput}
                      placeholder="0"
                      placeholderTextColor="#999"
                      value={priceData[30][1].price}
                      onChangeText={(value) => updatePrice(30, 2, value)}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.priceColumn}>
                    <Text style={styles.intervalLabelText}>Evening</Text>
                    <TextInput
                      style={styles.priceInput}
                      placeholder="0"
                      placeholderTextColor="#999"
                      value={priceData[30][2].price}
                      onChangeText={(value) => updatePrice(30, 3, value)}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                {/* 60 Min Prices */}
                <Text style={[styles.inputLabel, { marginTop: 16 }]}>
                  60 Min Prices (AFG)
                </Text>
                <View style={styles.priceRow}>
                  <View style={styles.priceColumn}>
                    <Text style={styles.intervalLabelText}>Morning</Text>
                    <TextInput
                      style={styles.priceInput}
                      placeholder="0"
                      placeholderTextColor="#999"
                      value={priceData[60][0].price}
                      onChangeText={(value) => updatePrice(60, 1, value)}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.priceColumn}>
                    <Text style={styles.intervalLabelText}>Afternoon</Text>
                    <TextInput
                      style={styles.priceInput}
                      placeholder="0"
                      placeholderTextColor="#999"
                      value={priceData[60][1].price}
                      onChangeText={(value) => updatePrice(60, 2, value)}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.priceColumn}>
                    <Text style={styles.intervalLabelText}>Evening</Text>
                    <TextInput
                      style={styles.priceInput}
                      placeholder="0"
                      placeholderTextColor="#999"
                      value={priceData[60][2].price}
                      onChangeText={(value) => updatePrice(60, 3, value)}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                {/* 90 Min Prices */}
                <Text style={[styles.inputLabel, { marginTop: 16 }]}>
                  90 Min Prices (AFG)
                </Text>
                <View style={styles.priceRow}>
                  <View style={styles.priceColumn}>
                    <Text style={styles.intervalLabelText}>Morning</Text>
                    <TextInput
                      style={styles.priceInput}
                      placeholder="0"
                      placeholderTextColor="#999"
                      value={priceData[90][0].price}
                      onChangeText={(value) => updatePrice(90, 1, value)}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.priceColumn}>
                    <Text style={styles.intervalLabelText}>Afternoon</Text>
                    <TextInput
                      style={styles.priceInput}
                      placeholder="0"
                      placeholderTextColor="#999"
                      value={priceData[90][1].price}
                      onChangeText={(value) => updatePrice(90, 2, value)}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.priceColumn}>
                    <Text style={styles.intervalLabelText}>Evening</Text>
                    <TextInput
                      style={styles.priceInput}
                      placeholder="0"
                      placeholderTextColor="#999"
                      value={priceData[90][2].price}
                      onChangeText={(value) => updatePrice(90, 3, value)}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                {/* <Text style={styles.priceInfoText}>
                  Prices will be automatically calculated:\n • Morning
                  (6AM-12PM): Base price\n • Afternoon (12PM-5PM): 80% of base\n
                  • Evening (5PM-10PM): 150% of base (peak)
                </Text> */}

                <TouchableOpacity
                  style={styles.addCourtButton}
                  onPress={handleAddCourt}
                >
                  <Ionicons name="add-circle" size={20} color="#fff" />
                  <Text style={styles.addCourtButtonText}>Add Court</Text>
                </TouchableOpacity>

                {/* <Text style={styles.inputLabel}>Open Time</Text>
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="time-outline"
                    size={20}
                    color="#666"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., 6:00 AM"
                    placeholderTextColor="#999"
                    value={openTime}
                    onChangeText={setOpenTime}
                  />
                </View> */}

                {/* <Text style={styles.inputLabel}>Close Time</Text>
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="time-outline"
                    size={20}
                    color="#666"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., 10:00 PM"
                    placeholderTextColor="#999"
                    value={closeTime}
                    onChangeText={setCloseTime}
                  />
                </View> */}

                {/* <TouchableOpacity
                  style={styles.addCourtButton}
                  onPress={handleAddCourt}
                >
                  <Ionicons name="add-circle" size={20} color="#fff" />
                  <Text style={styles.addCourtButtonText}>Add Court</Text>
                </TouchableOpacity> */}
              </ScrollView>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Discount Management Modal */}
      <Modal
        visible={showDiscountModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDiscountModal(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.discountModalOverlay}>
            <View style={styles.discountModalContent}>
              <View style={styles.discountModalHeader}>
                <Text style={styles.discountModalTitle}>
                  {editingDiscount ? "Edit Discount" : "Add Discount"}
                </Text>
                <TouchableOpacity onPress={() => setShowDiscountModal(false)}>
                  <Ionicons name="close" size={24} color="#333" />
                </TouchableOpacity>
              </View>
              {/* this is discount part */}
              <ScrollView
                style={styles.discountModalBody}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={true}
              >
                <Text style={styles.selectedGymLabel}>
                  Managing discounts for: {selectedGymForDiscount?.name}
                </Text>

                <Text style={styles.inputLabel}>Discount Percentage *</Text>
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="pricetag-outline"
                    size={20}
                    color="#666"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., 10"
                    placeholderTextColor="#999"
                    value={discountValue}
                    onChangeText={setDiscountValue}
                    keyboardType="numeric"
                  />
                </View>

                <Text style={styles.inputLabel}>Description *</Text>
                <View style={[styles.inputContainer, styles.textAreaContainer]}>
                  <TextInput
                    style={styles.textArea}
                    placeholder="e.g., Weekend Special Discount"
                    placeholderTextColor="#999"
                    value={discountDescription}
                    onChangeText={setDiscountDescription}
                    multiline
                    numberOfLines={2}
                  />
                </View>

                <Text style={styles.inputLabel}>Valid From *</Text>
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="calendar-outline"
                    size={20}
                    color="#666"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#999"
                    value={validFrom}
                    onChangeText={setValidFrom}
                  />
                </View>

                <Text style={styles.inputLabel}>Valid To *</Text>
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="calendar-outline"
                    size={20}
                    color="#666"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#999"
                    value={validTo}
                    onChangeText={setValidTo}
                  />
                </View>

                <Text style={styles.inputLabel}>Applicable Courts</Text>
                <Text style={styles.courtSelectionHint}>
                  Select courts this discount applies to (leave empty for all
                  courts)
                </Text>
                {selectedGymForDiscount?.courts?.map((court) => (
                  <TouchableOpacity
                    key={court.id}
                    style={[
                      styles.courtSelectionItem,
                      selectedCourts.includes(court.id) &&
                        styles.courtSelectionItemSelected,
                    ]}
                    onPress={() => toggleCourtSelection(court.id)}
                  >
                    <Ionicons
                      name={
                        selectedCourts.includes(court.id)
                          ? "checkbox-outline"
                          : "square-outline"
                      }
                      size={20}
                      color={
                        selectedCourts.includes(court.id) ? "#2563EB" : "#666"
                      }
                    />
                    <Text style={styles.courtSelectionText}>{court.name}</Text>
                  </TouchableOpacity>
                ))}

                <TouchableOpacity
                  style={styles.saveDiscountButton}
                  onPress={handleSaveDiscount}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.saveDiscountButtonText}>
                    {editingDiscount ? "Update Discount" : "Save Discount"}
                  </Text>
                </TouchableOpacity>

                {editingDiscount && (
                  <TouchableOpacity
                    style={styles.deleteDiscountButton}
                    onPress={() =>
                      handleDeleteDiscount(
                        selectedGymForDiscount.id,
                        editingDiscount.id,
                        editingDiscount.description,
                      )
                    }
                  >
                    <Ionicons name="trash" size={20} color="#fff" />
                    <Text style={styles.deleteDiscountButtonText}>
                      Delete Discount
                    </Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
              {/* --------- */}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Tournament Modal */}
      <Modal
        visible={showTournamentModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowTournamentModal(false)}
      >
        <View style={styles.tournamentModalContainer}>
          <View style={styles.tournamentModalHeader}>
            <Text style={styles.tournamentModalTitle}>
              {editingTournament ? "Edit Tournament" : "Add Tournament"}
            </Text>
            <TouchableOpacity onPress={() => setShowTournamentModal(false)}>
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.tournamentModalScroll}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.inputLabel}>Select Gym *</Text>
            {ownerGyms.length > 0 ? (
              ownerGyms.map((gym) => (
                <TouchableOpacity
                  key={gym.id}
                  style={[
                    styles.gymSelectorButton,
                    selectedTournamentGym?.id === gym.id &&
                      styles.gymSelectorButtonActive,
                  ]}
                  onPress={() => {
                    setSelectedTournamentGym(gym);
                    setAvailableCourts(gym.courts || []);
                    setSelectedTournamentCourts([]);
                  }}
                >
                  <Ionicons
                    name={
                      selectedTournamentGym?.id === gym.id
                        ? "checkbox"
                        : "square-outline"
                    }
                    size={20}
                    color={
                      selectedTournamentGym?.id === gym.id ? "#3edb17" : "#666"
                    }
                  />
                  <Text style={styles.gymSelectorText}>{gym.name}</Text>
                </TouchableOpacity>
              ))
            ) : (
              <Text style={styles.noGymsText}>
                No gyms available. Please add a gym first.
              </Text>
            )}

            <Text style={[styles.inputLabel, { marginTop: 20 }]}>
              Select Courts *
            </Text>
            {selectedTournamentGym && availableCourts.length > 0 ? (
              availableCourts.map((court) => (
                <TouchableOpacity
                  key={court.id}
                  style={[
                    styles.gymSelectorButton,
                    selectedTournamentCourts.includes(court.id) &&
                      styles.gymSelectorButtonActive,
                  ]}
                  onPress={() => toggleTournamentCourtSelection(court.id)}
                >
                  <Ionicons
                    name={
                      selectedTournamentCourts.includes(court.id)
                        ? "checkbox"
                        : "square-outline"
                    }
                    size={20}
                    color={
                      selectedTournamentCourts.includes(court.id)
                        ? "#3edb17"
                        : "#666"
                    }
                  />
                  <Text style={styles.gymSelectorText}>{court.name}</Text>
                </TouchableOpacity>
              ))
            ) : selectedTournamentGym ? (
              <Text style={styles.noGymsText}>
                No courts available for this gym. Add courts first.
              </Text>
            ) : null}

            <Text style={[styles.inputLabel, { marginTop: 20 }]}>
              Tournament Name *
            </Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Enter tournament name"
                placeholderTextColor="#999"
                value={tournamentName}
                onChangeText={setTournamentName}
              />
            </View>

            <Text style={[styles.inputLabel, { marginTop: 15 }]}>
              Registration pay (AFG)
            </Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Enter entry fee"
                placeholderTextColor="#999"
                value={tournamentEntryFee}
                onChangeText={setTournamentEntryFee}
                keyboardType="numeric"
              />
            </View>

            <Text style={[styles.inputLabel, { marginTop: 15 }]}>
              Start Date *
            </Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#999"
                value={tournamentStartDate}
                onChangeText={setTournamentStartDate}
              />
            </View>

            <Text style={[styles.inputLabel, { marginTop: 15 }]}>
              End Date *
            </Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#999"
                value={tournamentEndDate}
                onChangeText={setTournamentEndDate}
              />
            </View>

            <Text style={[styles.inputLabel, { marginTop: 15 }]}>
              Tournament Time *
            </Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="e.g., 10:00 AM"
                placeholderTextColor="#999"
                value={tournamentTime}
                onChangeText={setTournamentTime}
              />
            </View>
            {/* 
            <Text style={[styles.inputLabel, { marginTop: 15 }]}>
              Max Teams
            </Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Enter max teams"
                placeholderTextColor="#999"
                value={tournamentMaxTeams}
                onChangeText={setTournamentMaxTeams}
                keyboardType="numeric"
              />
            </View> */}

            <TouchableOpacity
              style={styles.saveTournamentButton}
              onPress={handleSaveTournament}
            >
              <Text style={styles.saveTournamentButtonText}>
                {editingTournament ? "Update Tournament" : "Create Tournament"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
    marginHorizontal: 4,
  },
  tabButtonActive: {
    backgroundColor: "#3edb17",
  },
  tabText: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
  },
  tabTextActive: {
    color: "black",
    fontWeight: "600",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1F2937",
  },
  addButton: {
    flexDirection: "row",
    backgroundColor: "#3edb17",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: "center",
  },
  addButtonText: {
    color: "black",
    fontWeight: "600",
    marginLeft: 4,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
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
  emptyButton: {
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 20,
  },
  emptyButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2563EB",
  },
  viewAllText: {
    color: "#2563EB",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 8,
  },
  // Booking styles
  bookingCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  bookingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  bookingGymInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  bookingGymDetails: {
    marginLeft: 12,
  },
  bookingGymName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
  },
  bookingCourt: {
    fontSize: 14,
    color: "#6B7280",
  },
  bookingStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  bookingStatusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  bookingDetails: {
    marginBottom: 12,
  },
  bookingDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  bookingDetailText: {
    fontSize: 14,
    color: "#6B7280",
    marginLeft: 8,
  },
  bookingDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 12,
  },
  bookingFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  customerInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  customerEmail: {
    fontSize: 14,
    color: "#6B7280",
    marginLeft: 8,
  },
  priceContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  priceLabel: {
    fontSize: 14,
    color: "#6B7280",
    marginRight: 4,
  },
  priceValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#2563EB",
  },
  bookedAtText: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 50,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1F2937",
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
    marginTop: 16,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: "#1F2937",
  },
  textAreaContainer: {
    minHeight: 100,
    alignItems: "flex-start",
    paddingVertical: 12,
  },
  textArea: {
    fontSize: 16,
    color: "#1F2937",
    width: "100%",
  },
  saveButton: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2563EB",
  },
  imagePickerContainer: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 8,
  },
  imagePickerPlaceholder: {
    height: 150,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
  },
  imagePickerText: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 8,
  },
  selectedImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
  },
  header: {
    backgroundColor: "#3edb17",
    padding: 20,
    paddingTop: 50,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  welcomeText: {
    fontSize: 16,
    color: "black",
    fontWeight: "bold",
  },
  logoutButton: {
    padding: 8,
  },
  statsContainer: {
    flexDirection: "row",
    padding: 20,
    marginTop: -30,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 5,
    alignItems: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  statNumber: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#2563EB",
  },
  statLabel: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1F2937",
  },
  addButton: {
    flexDirection: "row",
    backgroundColor: "#3edb17",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: "center",
  },
  addButtonText: {
    color: "black",
    fontWeight: "600",
    marginLeft: 4,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  gymCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  gymCardContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  gymImageContainer: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    overflow: "hidden",
  },

  gymImage: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
  },
  gymInfo: {
    flex: 1,
  },
  gymName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 4,
  },
  gymDetail: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 2,
  },
  gymActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  courtButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
  },
  discountButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#7C3AED",
    justifyContent: "center",
    alignItems: "center",
  },
  editButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F59E0B",
    justifyContent: "center",
    alignItems: "center",
  },
  deleteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
  },
  rejectionText: {
    fontSize: 12,
    color: "#EF4444",
    marginTop: 4,
    fontStyle: "italic",
  },
  gymNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusPending: {
    backgroundColor: "#F59E0B",
  },
  statusApproved: {
    backgroundColor: "#10B981",
  },
  statusRejected: {
    backgroundColor: "#EF4444",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#fff",
  },
  pendingApprovalText: {
    fontSize: 12,
    color: "#F59E0B",
    fontWeight: "500",
    marginTop: 8,
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
  tournamentDetail: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 4,
  },
  registeredTeamsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  registeredTeamsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 8,
  },
  registeredTeamItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    padding: 8,
    borderRadius: 6,
    marginBottom: 4,
  },
  teamInfoRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  teamCaptainName: {
    fontSize: 13,
    color: "#1F2937",
    marginLeft: 4,
  },
  teamPhoneNum: {
    fontSize: 12,
    color: "#6B7280",
  },
  noTeamsRegistered: {
    fontSize: 13,
    color: "#9CA3AF",
    fontStyle: "italic",
    marginTop: 8,
  },
  tournamentActions: {
    flexDirection: "row",
    marginTop: 12,
    gap: 8,
  },
  completeButton: {
    backgroundColor: "#10B981",
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#EF4444",
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  resultDisplay: {
    backgroundColor: "#FEF3C7",
    padding: 12,
    borderRadius: 8,
  },
  resultText: {
    fontSize: 14,
    color: "#92400E",
    fontWeight: "600",
  },
  // Tournament Modal Styles
  tournamentModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  tournamentModalContent: {
    backgroundColor: "#fff",
    borderRadius: 20,
    width: "95%",
    height: "85%",
    overflow: "hidden",
  },
  tournamentModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 18,
    backgroundColor: "#F59E0B",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  tournamentModalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
  },
  tournamentModalBody: {
    flex: 1,
    padding: 20,
  },
  selectedGymLabel: {
    fontSize: 14,
    color: "#4B5563",
    marginBottom: 12,
  },
  // Court Modal Styles
  courtModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  courtModalContent: {
    backgroundColor: "#fff",
    borderRadius: 20,
    width: "95%",
    maxHeight: "95%",
    overflow: "hidden",
  },
  courtModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 18,
    backgroundColor: "#2563EB",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  courtModalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
  },
  courtModalBody: {
    padding: 20,
    minHeight: 400,
  },
  priceRow: {
    flexDirection: "row",
    gap: 8,
  },
  priceColumn: {
    flex: 1,
  },
  intervalLabelText: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 4,
    fontWeight: "600",
  },
  priceInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: "#1F2937",
    backgroundColor: "#F9FAFB",
    textAlign: "center",
  },
  priceInfoText: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 12,
    fontStyle: "italic",
    lineHeight: 18,
  },
  addCourtButton: {
    flexDirection: "row",
    backgroundColor: "#2563EB",
    paddingVertical: 16,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
    marginBottom: 20,
  },
  addCourtButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
  // Discount Modal Styles
  discountModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  discountModalContent: {
    backgroundColor: "#fff",
    borderRadius: 20,
    width: "95%",
    maxHeight: "95%",
    overflow: "hidden",
  },
  discountModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 18,
    backgroundColor: "#7C3AED",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  discountModalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
  },
  discountModalBody: {
    padding: 20,
    minHeight: 400,
  },
  saveDiscountButton: {
    flexDirection: "row",
    backgroundColor: "#7C3AED",
    paddingVertical: 16,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
    marginBottom: 20,
  },
  saveDiscountButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
  deleteDiscountButton: {
    flexDirection: "row",
    backgroundColor: "#EF4444",
    paddingVertical: 16,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
  },
  deleteDiscountButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
  courtSelectionItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: "#F3F4F6",
  },
  courtSelectionItemSelected: {
    backgroundColor: "#DBEAFE",
    borderWidth: 1,
    borderColor: "#2563EB",
  },
  courtSelectionText: {
    fontSize: 14,
    color: "#374151",
    marginLeft: 8,
  },
  saveTournamentButton: {
    flexDirection: "row",
    backgroundColor: "#F59E0B",
    paddingVertical: 14,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
  },
  saveTournamentButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  resultModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  resultModalContent: {
    backgroundColor: "#fff",
    borderRadius: 20,
    width: "90%",
    padding: 20,
  },
  resultModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  resultModalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1F2937",
  },
  tournamentModalContainer: {
    flex: 1,
    backgroundColor: "#fff",
    marginTop: 50,
  },
  tournamentModalScroll: {
    flex: 1,
    padding: 15,
    minHeight: 400,
  },
  tournamentModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingBottom: 15,
  },
  tournamentModalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1F2937",
  },
  tournamentModalBody: {
    flex: 1,
    padding: 10,
    minHeight: 300,
  },
  gymSelectorContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 15,
  },
  gymSelectorButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB",
    gap: 8,
  },
  gymSelectorButtonActive: {
    borderColor: "#3edb17",
    backgroundColor: "#ECFDF5",
  },
  gymSelectorText: {
    fontSize: 14,
    color: "#1F2937",
  },
  noGymsText: {
    fontSize: 16,
    color: "#EF4444",
    fontStyle: "italic",
    textAlign: "center",
    marginVertical: 20,
    padding: 20,
    backgroundColor: "#FEE2E2",
    borderRadius: 10,
    width: "100%",
  },
  courtSelectorContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 15,
  },
  courtSelectorButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB",
    gap: 8,
  },
  courtSelectorButtonActive: {
    borderColor: "#3edb17",
    backgroundColor: "#ECFDF5",
  },
  courtSelectorText: {
    fontSize: 14,
    color: "#1F2937",
  },
  courtPriceText: {
    fontSize: 12,
    color: "#6B7280",
  },
  noCourtsText: {
    fontSize: 14,
    color: "#EF4444",
    fontStyle: "italic",
  },
  durationSelectorContainer: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 15,
  },
  durationButton: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB",
    alignItems: "center",
  },
  durationButtonActive: {
    borderColor: "#3edb17",
    backgroundColor: "#ECFDF5",
  },
  durationButtonText: {
    fontSize: 14,
    color: "#1F2937",
  },
  durationButtonTextActive: {
    color: "#3edb17",
    fontWeight: "bold",
  },
  saveTournamentButton: {
    flexDirection: "row",
    backgroundColor: "#3edb17",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    marginBottom: 20,
    gap: 8,
  },
  saveTournamentButtonText: {
    color: "black",
    fontSize: 16,
    fontWeight: "bold",
  },
});
