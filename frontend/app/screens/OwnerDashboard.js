import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import React, { useEffect, useState, useCallback, useRef } from "react";
import Svg, { Circle, Path } from "react-native-svg";
import {
  ActivityIndicator,
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
import {
  createOwnerGym,
  createGymDiscount,
  getGymFields,
  getOwnerGyms,
  uploadOwnerGymImage,
  updateOwnerGym as updateOwnerGymApi,
} from "../api/ownerGymsApi";
import {
  createTournament as createTournamentApi,
  approveTournamentTeam as approveTournamentTeamApi,
  assignTournamentTeamGroup as assignTournamentTeamGroupApi,
  finishTournament as finishTournamentApi,
  getMatches as getMatchesApi,
  getRanking as getRankingApi,
  getStandings as getStandingsApi,
  getTournamentDetail as getTournamentDetailApi,
  getTournamentTeams as getTournamentTeamsApi,
  getTournaments as getTournamentsApi,
  rejectTournamentTeam as rejectTournamentTeamApi,
  startTournament as startTournamentApi,
  submitMatchResult as submitMatchResultApi,
  updateTournament as updateTournamentApi,
} from "../api/tournamentsApi";
import { getOwnerBookings } from "../api/bookingsApi";
import { createExpense, getOwnerExpenses } from "../api/expensesApi";
import { getOwnerFinanceSummary, getOwnerRevenues } from "../api/revenuesApi";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useGym } from "../context/GymContext";
import { adaptExpenseList } from "../utils/expenseMapper";
import { adaptFinanceSummary } from "../utils/financeMapper";
import { formatWeekday } from "../utils/formatters";
import { adaptRevenueList } from "../utils/revenueMapper";
import {
  adaptMatch,
  adaptStandings,
  adaptTournamentDetail,
  adaptTournamentListItem,
} from "../utils/tournamentMapper";
import { adaptOwnerBooking } from "../utils/bookingMapper";
import { adaptOwnerGymForDashboard } from "../utils/ownerGymMapper";
import { mapErrorToMessage } from "../utils/errorMapper";
import {
  getFlexDirection,
  getStartMargin,
  isRTL,
  getTextAlign,
  getWritingDirection,
  normalizeLanguageCode,
} from "../utils/rtl";
import {
  buildOwnerGymCreatePayload,
  buildOwnerGymUpdatePayload,
} from "../utils/ownerGymMapper";
import { useTranslation } from "react-i18next";

const EXPENSE_TYPE_OPTIONS = [
  { label: "Rent", value: "rent" },
  { label: "Electricity", value: "electricity" },
  { label: "Staff Salary", value: "staff_salary" },
];

const PRIMARY_COLOR = "#24a731";
const PRIMARY_DARK = "#1B7F26";
const PRIMARY_TINT = "#EAF8EC";
const PRIMARY_BORDER = "#BFE7C5";

export default function OwnerDashboard({ navigation }) {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { t, i18n } = useTranslation();
  const rtl = isRTL();
  const normalizedLanguage = normalizeLanguageCode(i18n.language || "en");
  const localizedTextStyle = {
    textAlign: getTextAlign(),
    writingDirection: getWritingDirection(),
  };
  const localizedBlockTextStyle = {
    ...localizedTextStyle,
    alignSelf: rtl ? "flex-end" : "flex-start",
  };
  const localizedLtrInputStyle = {
    textAlign: rtl ?  "right" : "left",
    writingDirection: "ltr",
  };
  const localizedLtrValueStyle = {
    textAlign: rtl ? "left" : "right",
    writingDirection: "ltr",
  };
  const discountTranslationFallbacks = {
    en: {
      addDiscount: "Add Discount",
      editDiscountTitle: "Edit Discount",
      managingFor: "Managing discounts for: {{name}}",
      percentage: "Percentage",
      percentagePlaceholder: "e.g.,10 ",
      description: "Description",
      descriptionPlaceholder: "e.g., Weekend Special Discount",
      code: "Discount Code",
      codePlaceholder: "e.g., WEEKEND10",
      validFrom: "Valid From",
      validTo: "Valid To",
      applicableCourts: "Applicable Courts",
      applicableCourtsHint:
        "Select courts this discount applies to (leave empty for all courts)",
      saveDiscount: "Save Discount",
      updateDiscount: "Update Discount",
      deleteDiscount: "Delete Discount",
      requiredFields: "Please fill all required fields",
      percentageValidation: "Discount percentage must be between 1 and 100",
      validRangeValidation: "Valid from date must be before valid to date",
      addedSuccessfully: "Discount added successfully!",
      updatedSuccessfully: "Discount updated successfully!",
      deletedSuccessfully: "Discount deleted successfully!",
      confirmDeleteMessage:
        'Are you sure you want to delete "{{description}}"? This action cannot be undone.',
    },
    fa: {
      addDiscount: "افزودن تخفیف",
      editDiscountTitle: "ویرایش تخفیف",
      managingFor: "مدیریت تخفیف‌ها برای: {{name}}",
      percentage: "درصد",
      percentagePlaceholder: "مثلاً 10",
      description: "توضیحات",
      descriptionPlaceholder: "مثلاً تخفیف ویژه آخر هفته",
      code: "کد تخفیف",
      codePlaceholder: "مثلاً WEEKEND10",
      validFrom: "معتبر از",
      validTo: "معتبر تا",
      applicableCourts: "میدان‌های قابل اعمال",
      applicableCourtsHint:
        "میدان‌هایی را انتخاب کنید که این تخفیف برای آن‌ها اعمال می‌شود (برای همه میدان‌ها خالی بگذارید)",
      saveDiscount: "ذخیره تخفیف",
      updateDiscount: "به‌روزرسانی تخفیف",
      deleteDiscount: "حذف تخفیف",
      requiredFields: "لطفاً همه فیلدهای ضروری را تکمیل کنید",
      percentageValidation: "درصد تخفیف باید بین 1 تا 100 باشد",
      validRangeValidation: "تاریخ شروع باید قبل از تاریخ پایان باشد",
      addedSuccessfully: "تخفیف با موفقیت اضافه شد!",
      updatedSuccessfully: "تخفیف با موفقیت به‌روزرسانی شد!",
      deletedSuccessfully: "تخفیف با موفقیت حذف شد!",
      confirmDeleteMessage:
        'آیا مطمئن هستید که می‌خواهید "{{description}}" را حذف کنید؟ این عمل قابل بازگشت نیست.',
    },
    ps: {
      addDiscount: "تخفیف اضافه کړه",
      editDiscountTitle: "تخفیف سم کړه",
      managingFor: "د دې لپاره تخفیفونه سمبالوه: {{name}}",
      percentage: "سلنه",
      percentagePlaceholder: "لکه 10",
      description: "تشریح",
      descriptionPlaceholder: "لکه د اونۍ پای ځانګړی تخفیف",
      code: "د تخفیف کوډ",
      codePlaceholder: "لکه WEEKEND10",
      validFrom: "معتبر له",
      validTo: "معتبر تر",
      applicableCourts: "د تطبیق وړ میدانونه",
      applicableCourtsHint:
        "هغه میدانونه وټاکئ چې دا تخفیف پرې تطبیقېږي (د ټولو میدانونو لپاره یې تش پرېږدئ)",
      saveDiscount: "تخفیف ذخیره کړه",
      updateDiscount: "تخفیف تازه کړه",
      deleteDiscount: "تخفیف حذف کړه",
      requiredFields: "مهرباني وکړئ ټول اړین فیلډونه ډک کړئ",
      percentageValidation: "د تخفیف سلنه باید د 1 او 100 ترمنځ وي",
      validRangeValidation: "د پیل نېټه باید د پای له نېټې مخکې وي",
      addedSuccessfully: "تخفیف په بریالیتوب سره اضافه شو!",
      updatedSuccessfully: "تخفیف په بریالیتوب سره تازه شو!",
      deletedSuccessfully: "تخفیف په بریالیتوب سره حذف شو!",
      confirmDeleteMessage:
        'ایا ډاډه یاست چې غواړئ "{{description}}" حذف کړئ؟ دا عمل بېرته نه راګرځي.',
    },
  };
  const interpolateFallback = (template, values = {}) =>
    String(template).replace(/\{\{(\w+)\}\}/g, (_, key) =>
      values[key] === undefined || values[key] === null ? "" : String(values[key]),
    );
  const tDiscount = (key, options = {}) => {
    const fullKey = `ownerDashboard.discounts.${key}`;
    const translated = t(fullKey, options);
    if (translated !== fullKey) {
      return translated;
    }
    const fallbackTemplate =
      discountTranslationFallbacks[normalizedLanguage]?.[key] ??
      discountTranslationFallbacks.en[key] ??
      fullKey;
    return interpolateFallback(fallbackTemplate, options);
  };
  const {
    owner,
    gyms,
    addCourtToGym,
    addDiscountToGym,
    updateDiscount,
    deleteDiscount,
  } = useGym();
  const { logout } = useAuth();

  const getOwnerGymStatusLabel = (status) => {
    if (status === "approved") return t("ownerDashboard.gyms.approved");
    if (status === "rejected") return t("ownerDashboard.gyms.rejected");
    return t("ownerDashboard.gyms.pending");
  };

  const getExpenseTypeLabel = (type) => {
    const normalized = String(type || "")
      .toLowerCase()
      .replace(/[\s-]+/g, "_");

    if (normalized === "rent") return t("ownerDashboard.finance.rent");
    if (normalized === "electricity") {
      return t("ownerDashboard.finance.electricity");
    }
    if (normalized === "staff_salary" || normalized === "staff_salaries") {
      return t("ownerDashboard.finance.staffSalary");
    }

    return type || "";
  };

  const normalizeRankingEntries = useCallback((entries = []) => {
    if (!Array.isArray(entries)) {
      return [];
    }

    return entries.map((entry, index) => ({
      ...entry,
      teamId: entry?.teamId ?? entry?.team_id ?? null,
      teamName:
        entry?.teamName ??
        entry?.team_name ??
        entry?.captainName ??
        entry?.captain_name ??
        "",
      position: entry?.position ?? entry?.rank ?? index + 1,
    }));
  }, []);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingGym, setEditingGym] = useState(null);
  const [activeTab, setActiveTab] = useState("gyms");
  const [serverOwnerGyms, setServerOwnerGyms] = useState([]);
  const [ownerGymsLoading, setOwnerGymsLoading] = useState(false);
  const [ownerGymsError, setOwnerGymsError] = useState(null);
  const [ownerGymsLoaded, setOwnerGymsLoaded] = useState(false);
  const [ownerBookings, setOwnerBookings] = useState([]);
  const [ownerBookingsLoading, setOwnerBookingsLoading] = useState(false);
  const [ownerBookingsError, setOwnerBookingsError] = useState(null);
  const [ownerBookingsLoaded, setOwnerBookingsLoaded] = useState(false);
  const [savingGym, setSavingGym] = useState(false);
  const [serverTournaments, setServerTournaments] = useState([]);
  const [serverTournamentDetails, setServerTournamentDetails] = useState({});
  const [serverTournamentMatches, setServerTournamentMatches] = useState({});
  const [serverTournamentStandings, setServerTournamentStandings] = useState({});
  const [serverTournamentRanking, setServerTournamentRanking] = useState({});
  const [tournamentsLoaded, setTournamentsLoaded] = useState(false);
  const [tournamentsError, setTournamentsError] = useState(null);
  const [financeSummary, setFinanceSummary] = useState(null);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [financeError, setFinanceError] = useState(null);
  const [financeLoaded, setFinanceLoaded] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    gym: "",
    expense_type: "",
    amount: "",
    expense_date: "",
    notes: "",
  });
  const [expenses, setExpenses] = useState([]);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [expensesError, setExpensesError] = useState(null);
  const [expensesLoaded, setExpensesLoaded] = useState(false);
  const [revenues, setRevenues] = useState([]);
  const [revenuesLoading, setRevenuesLoading] = useState(false);
  const [revenuesError, setRevenuesError] = useState(null);
  const [revenuesLoaded, setRevenuesLoaded] = useState(false);

  // Tournament form states
  const [showTournamentModal, setShowTournamentModal] = useState(false);
  const [editingTournament, setEditingTournament] = useState(null);
  const [tournamentName, setTournamentName] = useState("");
  const [tournamentDescription, setTournamentDescription] = useState("");
  const [tournamentStartDate, setTournamentStartDate] = useState("");
  const [tournamentEndDate, setTournamentEndDate] = useState("");
  const [tournamentDeadline, setTournamentDeadline] = useState("");
  const [tournamentEntryFee, setTournamentEntryFee] = useState("");
  const [firstPlaceAward, setFirstPlaceAward] = useState("");
  const [secondPlaceAward, setSecondPlaceAward] = useState("");
  const [thirdPlaceAward, setThirdPlaceAward] = useState("");
  const [topScorerAward, setTopScorerAward] = useState("");
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

  // Match management states
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [selectedMatchTournament, setSelectedMatchTournament] = useState(null);
  const [selectedTeam1, setSelectedTeam1] = useState(null);
  const [selectedTeam2, setSelectedTeam2] = useState(null);
  const [matchRound, setMatchRound] = useState("1");
  const [showMatchResultModal, setShowMatchResultModal] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [matchScore1, setMatchScore1] = useState("");
  const [matchScore2, setMatchScore2] = useState("");

  // Group match generation states
  const [showGroupMatchModal, setShowGroupMatchModal] = useState(false);
  const [selectedGroupForMatch, setSelectedGroupForMatch] = useState(null);
  const [showKnockoutModal, setShowKnockoutModal] = useState(false);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [editingMatch, setEditingMatch] = useState(null);
  const [score1Input, setScore1Input] = useState("");
  const [score2Input, setScore2Input] = useState("");
  const [topPlayerId, setTopPlayerId] = useState(null);
  const [topPlayerGoals, setTopPlayerGoals] = useState("");
  const [playerGoalInputs, setPlayerGoalInputs] = useState({});

  // Expanded tournament state
  const [expandedTournaments, setExpandedTournaments] = useState({});
  const [expandedBookings, setExpandedBookings] = useState({});
  const [expandedTeamRosters, setExpandedTeamRosters] = useState({});

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
  const [pricePerHour, setPricePerHour] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [businessHours, setBusinessHours] = useState({
    open_time: "",
    close_time: "",
  });
  const [openPeriod, setOpenPeriod] = useState("AM");
  const [closePeriod, setClosePeriod] = useState("PM");
  const courtScrollViewRef = useRef(null);
  const financeScrollRef = useRef(null);

  // Discount management states
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [selectedGymForDiscount, setSelectedGymForDiscount] = useState(null);
  const [editingDiscount, setEditingDiscount] = useState(null);
  const [timeSlotsModalVisible, setTimeSlotsModalVisible] = useState(false);
  const [selectedGymForSlots, setSelectedGymForSlots] = useState(null);
  const [discountValue, setDiscountValue] = useState("");
  const [discountDescription, setDiscountDescription] = useState("");
  const [discountCode, setDiscountCode] = useState("");
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

  const getWeekday = (date) => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return formatWeekday(days[new Date(date).getDay()], { long: true });
  };

  const SLOT_DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const getPeriodFromTimeValue = (timeValue) => {
    if (!timeValue || typeof timeValue !== "string") {
      return "AM";
    }

    const [hourValue] = timeValue.split(":");
    const hour = Number(hourValue);

    if (!Number.isFinite(hour)) {
      return "AM";
    }

    return hour >= 12 ? "PM" : "AM";
  };

  const formatTimeInput = (value) => {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 4);

    if (digits.length <= 2) {
      return digits;
    }

    return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  };

  const getTimeInputParts = (value) => {
    const [hours = "", minutes = ""] = String(value || "").split(":");

    return {
      hours: hours.replace(/\D/g, "").slice(0, 2),
      minutes: minutes.replace(/\D/g, "").slice(0, 2),
    };
  };

  const updateTimeInputPart = (currentValue, part, nextValue) => {
    const sanitizedValue = String(nextValue || "").replace(/\D/g, "").slice(0, 2);
    const currentParts = getTimeInputParts(currentValue);
    const hours = part === "hours" ? sanitizedValue : currentParts.hours;
    const minutes = part === "minutes" ? sanitizedValue : currentParts.minutes;

    if (!hours && !minutes) {
      return "";
    }

    if (!minutes && part !== "minutes") {
      return hours;
    }

    return `${hours}:${minutes}`;
  };

  const normalizeCollection = (payload) => {
    if (Array.isArray(payload?.results)) {
      return payload.results;
    }
    if (Array.isArray(payload?.data?.results)) {
      return payload.data.results;
    }
    if (Array.isArray(payload?.data)) {
      return payload.data;
    }
    return Array.isArray(payload) ? payload : [];
  };

  const formatTime12Hour = (time) => {
    if (!time || typeof time !== "string") return "";

    const [hourPart, minutePart = "00"] = time.split(":");
    const hour = Number(hourPart);
    const minute = Number(minutePart);

    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      return time;
    }

    const period = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    const displayMinute = String(minute).padStart(2, "0");

    return `${displayHour}:${displayMinute} ${period}`;
  };

  const getSlotBookingStatus = (slot = {}) => {
    const hasExplicitStatusField =
      slot?.is_booked !== undefined ||
      slot?.isBooked !== undefined ||
      slot?.booked !== undefined ||
      slot?.status !== undefined ||
      slot?.booking_status !== undefined ||
      slot?.bookingStatus !== undefined ||
      slot?.is_available !== undefined ||
      slot?.isAvailable !== undefined;

    if (__DEV__ && !hasExplicitStatusField) {
      console.log("OWNER SLOT SHAPE:", slot);
    }

    const normalizedStatus =
      typeof slot.status === "string" ? slot.status.toLowerCase() : slot.status;
    const normalizedBookingStatus =
      typeof slot.booking_status === "string"
        ? slot.booking_status.toLowerCase()
        : slot.booking_status;
    const normalizedBookingStatusCamel =
      typeof slot.bookingStatus === "string"
        ? slot.bookingStatus.toLowerCase()
        : slot.bookingStatus;

    if (
      slot.is_booked === true ||
      slot.isBooked === true ||
      slot.booked === true
    ) {
      return "booked";
    }

    if (
      normalizedStatus === "booked" ||
      normalizedStatus === "reserved" ||
      normalizedBookingStatus === "booked" ||
      normalizedBookingStatus === "reserved" ||
      normalizedBookingStatusCamel === "booked" ||
      normalizedBookingStatusCamel === "reserved"
    ) {
      return "booked";
    }

    if (slot.is_available === true || slot.isAvailable === true) {
      return "available";
    }

    if (slot.is_available === false || slot.isAvailable === false) {
      return "booked";
    }

    // TODO: Replace default availability with backend-provided booked status when endpoint includes it.
    return "available";
  };

  const formatMoney = (value) => `${Number(value || 0).toLocaleString()} AFG`;

  const updateExpenseForm = (field, value) => {
    setExpenseForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const resetExpenseForm = () => {
    setExpenseForm({
      gym: "",
      expense_type: "",
      amount: "",
      expense_date: "",
      notes: "",
    });
  };

  const validateExpenseForm = () => {
    const parsedAmount = Number(expenseForm.amount);

    if (!expenseForm.gym) {
      Alert.alert(t("common.error"), t("ownerDashboard.validation.selectGym"));
      return false;
    }

    if (!expenseForm.expense_type) {
      Alert.alert(
        t("common.error"),
        t("ownerDashboard.validation.selectExpenseType"),
      );
      return false;
    }

    if (!expenseForm.expense_date) {
      Alert.alert(
        t("common.error"),
        t("ownerDashboard.validation.selectExpenseDate"),
      );
      return false;
    }

    if (!expenseForm.amount.trim() || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert(
        t("common.error"),
        t("ownerDashboard.validation.enterValidAmount"),
      );
      return false;
    }

    return true;
  };

  const buildGymSchedulePreview = (fields = [], slots = []) => {
    const courtNameById = Object.fromEntries(
      fields.map((field) => [
        String(field?.field_id ?? field?.id ?? ""),
        field?.field_name || field?.name || "Court",
      ]),
    );

    return slots
      .map((slot) => {
        const fieldId = slot?.field ?? slot?.field_id ?? slot?.fieldId;
        const dayIndex = Number(slot?.day_of_week);

        return {
          ...slot,
          id:
            slot?.slot_id ??
            `${fieldId ?? "court"}-${slot?.day_of_week ?? "day"}-${slot?.start_time ?? "start"}`,
          courtName: courtNameById[String(fieldId)] || "Court",
          dayIndex,
          startTime: slot?.start_time || "",
          endTime: slot?.end_time || "",
          dayLabel: SLOT_DAY_NAMES[dayIndex] || `Day ${slot?.day_of_week ?? "-"}`,
          timeLabel: `${formatTime12Hour(slot?.start_time)} - ${formatTime12Hour(slot?.end_time)}`,
        };
      })
      .filter((slot) => slot.timeLabel !== "--:-- - --:--")
      .sort((left, right) => {
        if (left.courtName !== right.courtName) {
          return left.courtName.localeCompare(right.courtName);
        }
        if (left.dayIndex !== right.dayIndex) {
          return left.dayIndex - right.dayIndex;
        }
        return left.startTime.localeCompare(right.startTime);
      });
  };

  const groupSlotsByDay = (slots = []) => {
    return slots.reduce((groups, slot) => {
      const day =
        slot.dayLabel ||
        slot.day ||
        slot.day_name ||
        slot.dayName ||
        slot.date ||
        "Unknown";

      if (!groups[day]) {
        groups[day] = [];
      }

      groups[day].push(slot);
      return groups;
    }, {});
  };

  const selectedDay = selectedDate ? getWeekday(selectedDate) : "";

// Current source remains GymContext for safety.
// When backend gyms are available, trust the owner-scoped GET /api/gyms/
// response and adapt it for UI rendering instead of filtering by ownerId again.
const contextOwnerGyms = gyms.filter((gym) => gym.ownerId === owner?.id);
const fallbackOwnerGyms = contextOwnerGyms.map((gym) =>
  adaptOwnerGymForDashboard(gym, owner),
);
// Keep all owner gym list data behind the adapter because list/detail shapes differ.
const finalOwnerGyms = ownerGymsLoaded ? serverOwnerGyms : fallbackOwnerGyms;

  const ownerGymIds = finalOwnerGyms.map((g) => g.id);
  const ownerGymIdsKey = ownerGymIds.join("|");
  const visibleOwnerBookings = ownerBookings.filter((booking) => {
    const paymentStatus = String(booking.paymentStatus || "").toLowerCase();
    const bookingStatus = String(booking.bookingStatus || "").toLowerCase();

    return (
      paymentStatus === "success" ||
      paymentStatus === "paid" ||
      bookingStatus === "confirmed" ||
      bookingStatus === "completed"
    );
  });

  const sortedBookings = [...visibleOwnerBookings].sort((a, b) => {
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  const tabs = [
    { key: "gyms", label: t("ownerDashboard.tabs.gyms") },
    {
      key: "bookings",
      label: `${t("ownerDashboard.tabs.bookings")} (${sortedBookings.length})`,
    },
    { key: "tournaments", label: t("ownerDashboard.tabs.tournaments") },
    { key: "finance", label: t("ownerDashboard.tabs.finance") },
  ];

  const getTeamRosterKey = (tournamentId, team, scope, index) =>
    `${tournamentId || "tournament"}-${scope}-${team?.id || team?.teamId || index}`;

  const toggleTeamRoster = (rosterKey) => {
    setExpandedTeamRosters((current) =>
      current[rosterKey] ? {} : { [rosterKey]: true },
    );
  };

  const renderTeamMembers = (team, { compact = false } = {}) => {
    const members = Array.isArray(team?.members)
      ? team.members.filter((member) => member?.name || member?.role)
      : [];

    if (members.length === 0) {
      return null;
    }

    return (
      <View style={compact ? styles.teamMembersCompact : styles.teamMembersList}>
        {members.map((member, memberIndex) => {
          const memberLabel = `${memberIndex + 1}. ${member.name || ""}${
            member.role ? ` - ${member.role}` : ""
          }`;

          return (
            <Text
              key={member.id || member.memberId || `${member.name}-${memberIndex}`}
              style={[
                compact ? styles.teamMemberTextCompact : styles.teamMemberText,
                localizedTextStyle,
              ]}
              numberOfLines={compact ? 1 : 2}
            >
              {memberLabel}
            </Text>
          );
        })}
      </View>
    );
  };

  const getMatchTeams = (match, tournament) => {
    if (!match || !Array.isArray(tournament?.registeredTeams)) {
      return [];
    }

    return tournament.registeredTeams.filter(
      (team) =>
        String(team.id) === String(match.team1Id) ||
        String(team.id) === String(match.team2Id),
    );
  };

  const getMatchPlayers = (match, tournament) =>
    getMatchTeams(match, tournament).flatMap((team) =>
      Array.isArray(team.members)
        ? team.members
            .filter((member) => member?.name)
            .map((member) => ({
              ...member,
              teamId: team.id,
              teamName: team.teamName || team.captainName,
            }))
        : [],
    );

  const setPlayerGoalInput = (playerId, value) => {
    setPlayerGoalInputs((current) => ({
      ...current,
      [playerId]: value,
    }));
    if (String(topPlayerId) === String(playerId)) {
      setTopPlayerGoals(value);
    }
  };

  const selectTopPlayer = (playerId) => {
    setTopPlayerId(playerId);
    setTopPlayerGoals(playerGoalInputs[playerId] || "");
  };

  const extractResults = (payload) => {
    if (Array.isArray(payload?.results)) {
      return payload.results;
    }
    if (Array.isArray(payload)) {
      return payload;
    }
    return [];
  };

  const loadOwnerTournaments = useCallback(async () => {
    try {
      const response = await getTournamentsApi();
      const items = extractResults(response)
        .map((tournament) => adaptTournamentListItem(tournament))
        .filter(Boolean);
      setServerTournaments(items);
      setTournamentsLoaded(true);
      setTournamentsError(null);
      return items;
    } catch (error) {
      console.warn("Tournament owner load failed", error);
      setServerTournaments([]);
      setTournamentsLoaded(false);
      setTournamentsError(mapErrorToMessage(error).message);
      return [];
    }
  }, []);

  const loadOwnerBookings = useCallback(async () => {
    if (!owner) {
      return;
    }

    setOwnerBookingsLoading(true);
    setOwnerBookingsError(null);

    try {
      const response = await getOwnerBookings();
      const rawList = normalizeCollection(response);
      const mapped = Array.isArray(rawList)
        ? rawList.map(adaptOwnerBooking).filter(Boolean)
        : [];

      setOwnerBookings(mapped);
      setOwnerBookingsLoaded(true);
    } catch (error) {
      console.log(
        "Owner bookings load error:",
        error?.response?.data || error?.message,
      );
      setOwnerBookingsError(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          t("ownerDashboard.alerts.unableToLoad"),
      );
      setOwnerBookingsLoaded(false);
    } finally {
      setOwnerBookingsLoading(false);
    }
  }, [owner, t]);

  const loadFinanceSummary = useCallback(async () => {
    setFinanceLoading(true);
    setFinanceError(null);

    try {
      const response = await getOwnerFinanceSummary();
      const mapped = adaptFinanceSummary(response?.data || response);
      setFinanceSummary(mapped);
      setFinanceLoaded(true);
    } catch (error) {
      console.log(
        "Owner finance summary load error:",
        error?.response?.data || error?.data || error?.message,
      );
      setFinanceError(t("ownerDashboard.states.unableToLoadFinance"));
      setFinanceLoaded(true);
    } finally {
      setFinanceLoading(false);
    }
  }, [t]);

  const loadOwnerExpenses = useCallback(async (params = {}) => {
    setExpensesLoading(true);
    setExpensesError(null);

    try {
      const response = await getOwnerExpenses(params);
      const mapped = adaptExpenseList(response?.data || response);
      setExpenses(mapped);
      setExpensesLoaded(true);
    } catch (error) {
      console.log(
        "Owner expenses load error:",
        error?.response?.data || error?.data || error?.message,
      );
      setExpensesError(t("ownerDashboard.states.unableToLoadExpenses"));
      setExpensesLoaded(true);
    } finally {
      setExpensesLoading(false);
    }
  }, [t]);

  const loadOwnerRevenues = useCallback(async (params = {}) => {
    setRevenuesLoading(true);
    setRevenuesError(null);

    try {
      const response = await getOwnerRevenues(params);
      const mapped = adaptRevenueList(response?.data || response);
      setRevenues(mapped);
      setRevenuesLoaded(true);
    } catch (error) {
      console.log(
        "Owner revenues load error:",
        error?.response?.data || error?.data || error?.message,
      );
      setRevenuesError(t("ownerDashboard.states.unableToLoadFinance"));
      setRevenuesLoaded(true);
    } finally {
      setRevenuesLoading(false);
    }
  }, [t]);

  const retryFinanceData = useCallback(async () => {
    await Promise.allSettled([
      loadFinanceSummary(),
      loadOwnerExpenses(),
      loadOwnerRevenues(),
    ]);
  }, [loadFinanceSummary, loadOwnerExpenses, loadOwnerRevenues]);

  const handleCreateExpense = async () => {
    if (savingExpense) return;

    if (!validateExpenseForm()) return;

    setSavingExpense(true);

    try {
      const payload = {
        gym: expenseForm.gym,
        expense_type: expenseForm.expense_type,
        amount: expenseForm.amount.trim(),
        expense_date: expenseForm.expense_date,
        notes: expenseForm.notes.trim(),
      };

      await createExpense(payload);

      resetExpenseForm();
      setShowExpenseForm(false);
      await Promise.allSettled([
        loadFinanceSummary(),
        loadOwnerExpenses(),
      ]);

      Alert.alert(t("common.success"), t("ownerDashboard.alerts.expenseAdded"));
    } catch (error) {
      console.log(
        "Create expense error:",
        error?.response?.data || error?.data || error?.message,
      );

      Alert.alert(
        t("common.error"),
        error?.response?.data?.message ||
          error?.data?.message ||
          error?.response?.data?.detail ||
          error?.data?.detail ||
          t("ownerDashboard.alerts.unableToAddExpense"),
      );
    } finally {
      setSavingExpense(false);
    }
  };

  const loadTournamentBundle = useCallback(async (tournamentId, { force = false } = {}) => {
    if (!tournamentId || (!force && serverTournamentDetails[tournamentId])) {
      return serverTournamentDetails[tournamentId] || null;
    }

    const [detailResponse, teamsResponse, matchesResponse, standingsResponse, rankingResponse] =
      await Promise.all([
        getTournamentDetailApi(tournamentId),
        getTournamentTeamsApi(tournamentId),
        getMatchesApi(tournamentId),
        getStandingsApi(tournamentId),
        getRankingApi(tournamentId),
      ]);

    const detail = adaptTournamentDetail({
      ...detailResponse,
      teams: extractResults(teamsResponse),
      ranking: rankingResponse?.ranking ?? rankingResponse?.results ?? rankingResponse,
    });
    const matches = extractResults(matchesResponse)
      .map((match) => adaptMatch(match))
      .filter(Boolean);
    const standings = adaptStandings(
      standingsResponse?.standings ?? standingsResponse,
    );
    const ranking = normalizeRankingEntries(
      Array.isArray(rankingResponse?.ranking)
        ? rankingResponse.ranking
        : Array.isArray(rankingResponse)
          ? rankingResponse
          : [],
    );

    setServerTournamentDetails((prev) => ({ ...prev, [tournamentId]: detail }));
    setServerTournamentMatches((prev) => ({ ...prev, [tournamentId]: matches }));
    setServerTournamentStandings((prev) => ({ ...prev, [tournamentId]: standings }));
    setServerTournamentRanking((prev) => ({ ...prev, [tournamentId]: ranking }));

    return detail;
  }, [normalizeRankingEntries, serverTournamentDetails]);

  useEffect(() => {
    if (!owner) {
      return;
    }

    loadOwnerTournaments();
  }, [loadOwnerTournaments, owner, ownerGymIdsKey]);

  useEffect(() => {
    if (!isFocused || !owner) {
      return;
    }

    setServerTournamentDetails({});
    setServerTournamentMatches({});
    setServerTournamentStandings({});
    setServerTournamentRanking({});
    loadOwnerTournaments();
  }, [isFocused, loadOwnerTournaments, owner]);

  useEffect(() => {
    const [hourValue = ""] = String(businessHours.open_time || "").split(":");
    if (hourValue.length < 2) {
      return;
    }

    setOpenPeriod(getPeriodFromTimeValue(businessHours.open_time));
  }, [businessHours.open_time]);

  useEffect(() => {
    const [hourValue = ""] = String(businessHours.close_time || "").split(":");
    if (hourValue.length < 2) {
      return;
    }

    setClosePeriod(getPeriodFromTimeValue(businessHours.close_time));
  }, [businessHours.close_time]);

  useEffect(() => {
    if (activeTab === "finance" && !financeLoaded && !financeLoading) {
      loadFinanceSummary();
    }
  }, [activeTab, financeLoaded, financeLoading, loadFinanceSummary]);

  useEffect(() => {
    if (activeTab === "bookings" && isFocused) {
      loadOwnerBookings();
    }
  }, [activeTab, isFocused, loadOwnerBookings]);

  useEffect(() => {
    if (activeTab === "finance" && !expensesLoaded && !expensesLoading) {
      loadOwnerExpenses();
    }
  }, [activeTab, expensesLoaded, expensesLoading, loadOwnerExpenses]);

  useEffect(() => {
    if (activeTab === "finance" && !revenuesLoaded && !revenuesLoading) {
      loadOwnerRevenues();
    }
  }, [activeTab, revenuesLoaded, revenuesLoading, loadOwnerRevenues]);

  const ownerTournaments = serverTournaments;

  const upcomingTournaments = ownerTournaments.filter(
    (t) => t.status === "upcoming",
  );
  const pendingTournaments = ownerTournaments.filter(
    (t) => t.status === "pending",
  );
  const completedTournaments = ownerTournaments.filter(
    (t) => t.status === "finished",
  );
  const canceledTournaments = ownerTournaments.filter(
    (t) => t.status === "cancelled",
  );

  // Get gym counts by status
  const pendingCount = finalOwnerGyms.filter((g) => g.status === "pending").length;
  const approvedCount = finalOwnerGyms.filter((g) => g.status === "approved").length;
  const rejectedCount = finalOwnerGyms.filter((g) => g.status === "rejected").length;

  // Track previous statuses to detect changes
  const [prevGymStatuses, setPrevGymStatuses] = useState({});
  const [prevTournamentStatuses, setPrevTournamentStatuses] = useState({});

  useEffect(() => {
    if (!owner) {
      router.replace("/");
    }
  }, [owner, router]);

  const loadOwnerGyms = useCallback(async ({ throwOnError = false } = {}) => {
    if (!owner) {
      return [];
    }

    setOwnerGymsLoading(true);
    setOwnerGymsError(null);

    try {
      const response = await getOwnerGyms();
      const results = Array.isArray(response?.results)
        ? response.results
        : Array.isArray(response)
          ? response
          : Array.isArray(response?.data?.results)
            ? response.data.results
            : Array.isArray(response?.data)
              ? response.data
              : [];
      const mapped = await Promise.all(
        results.map(async (gym) => {
          const gymId = gym?.gym_id ?? gym?.id;
          const baseGym = adaptOwnerGymForDashboard(gym, owner);

          if (!gymId) {
            return {
              ...baseGym,
              schedulePreview: [],
            };
          }

          try {
            const [fieldsResponse, slotsResponse] = await Promise.all([
              getGymFields(gymId),
              client.get(`/api/gyms/${gymId}/slots/`, { auth: true }),
            ]);
            const fields = normalizeCollection(fieldsResponse);
            const slots = normalizeCollection(slotsResponse);

            return {
              ...baseGym,
              courts: fields.map((field) => ({
                id: field?.field_id ?? field?.id,
                fieldId: field?.field_id ?? field?.id,
                name: field?.field_name || field?.name || "Court",
                pricePerHour: Number(field?.price_per_hour) || 0,
              })),
              fieldsCount: fields.length,
              courts_count: fields.length,
              slots,
              schedulePreview: buildGymSchedulePreview(fields, slots),
            };
          } catch (nestedError) {
            console.warn("Owner gym schedule load failed", gymId, nestedError);
            return {
              ...baseGym,
              schedulePreview: [],
            };
          }
        }),
      );

      setServerOwnerGyms(mapped);
      setOwnerGymsLoaded(true);
      return mapped;
    } catch (error) {
      console.warn("Owner gyms load failed", error);
      setOwnerGymsError(error?.message || t("ownerDashboard.alerts.unableToLoad"));
      setOwnerGymsLoaded(false);
      if (throwOnError) {
        throw error;
      }
      return [];
    } finally {
      setOwnerGymsLoading(false);
    }
  }, [owner, t]);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (!owner || !isMounted) {
        return;
      }

      await loadOwnerGyms();
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [loadOwnerGyms, owner]);

  // Check for status changes and show notifications
  useEffect(() => {
    const newStatuses = {};
    finalOwnerGyms.forEach((gym) => {
      newStatuses[gym.id] = gym.status;

      // Check if status changed from previous
      if (prevGymStatuses[gym.id] && prevGymStatuses[gym.id] !== gym.status) {
        if (gym.status === "approved") {
          Alert.alert(
            t("ownerDashboard.alerts.gymApprovedTitle"),
            t("ownerDashboard.alerts.gymApprovedVisible", { name: gym.name }),
            [{ text: t("ownerDashboard.actions.ok") }],
          );
        } else if (gym.status === "rejected") {
          const rejectedMessage = gym.rejectionReason
            ? `${t("ownerDashboard.alerts.gymRejected", {
                name: gym.name,
              })}\n\n${t("ownerDashboard.gyms.reason")}: ${gym.rejectionReason}`
            : t("ownerDashboard.alerts.gymRejected", { name: gym.name });
          Alert.alert(
            t("ownerDashboard.alerts.gymRejectedTitle"),
            rejectedMessage,
            [{ text: t("ownerDashboard.actions.ok") }],
          );
        }
      }
    });
    setPrevGymStatuses(newStatuses);
  }, [finalOwnerGyms, gyms]);

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
  }, [ownerTournaments]);

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            await logout();
          } finally {
            router.replace("/");
          }
        },
      },
    ]);
  };

  const handleDeleteGym = (gymId, gymName) => {
    Alert.alert(
      t("ownerDashboard.alerts.deleteUnavailable"),
      t("ownerDashboard.alerts.deletingGymNotAllowed", { name: gymName }),
      [{ text: t("ownerDashboard.actions.ok") }],
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

  const openTimeSlotsModal = (gym) => {
    setSelectedGymForSlots(gym);
    setTimeSlotsModalVisible(true);
  };

  const closeTimeSlotsModal = () => {
    setTimeSlotsModalVisible(false);
    setSelectedGymForSlots(null);
  };

  // Court management methods
  const handleCourtButtonPress = (gym) => {
    router.push({
      pathname: "/owner/add-court",
      params: {
        gymId: String(gym.id),
        gymName: gym.name,
      },
    });
  };

  const handleAddCourt = () => {
    if (!courtName.trim()) {
      Alert.alert(t("common.error"), t("ownerDashboard.validation.enterCourtName"));
      return;
    }
    const parsedPrice = Number(pricePerHour);
    if (!pricePerHour.trim() || Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      Alert.alert(t("common.error"), t("ownerDashboard.validation.enterValidPrice"));
      return;
    }
    if (!selectedGymForCourt) {
      Alert.alert(t("common.error"), t("ownerDashboard.validation.selectGym"));
      return;
    }
    if (!businessHours.open_time || !businessHours.close_time) {
      Alert.alert(
        t("common.error"),
        t("ownerDashboard.validation.enterValidOpenCloseTimes"),
      );
      return;
    }
    if (businessHours.open_time >= businessHours.close_time) {
      Alert.alert(t("common.error"), t("ownerDashboard.validation.openBeforeClose"));
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
      price_per_hour: parsedPrice,
      price30min: getBasePrice(price30minData),
      price60min: getBasePrice(price60minData),
      price90min: getBasePrice(price90minData),
      priceIntervals: {
        30: price30minData,
        60: price60minData,
        90: price90minData,
      },
      timing: {
        open: businessHours.open_time,
        close: businessHours.close_time,
      },
    };

    addCourtToGym(selectedGymForCourt.id, newCourt);
    setCourtName("");
    setPricePerHour("");
    setSelectedDate("");
    setBusinessHours({ open_time: "", close_time: "" });
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
    setDiscountCode("");
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
    setDiscountCode(discount.code || "");
    setValidFrom(discount.validFrom || "");
    setValidTo(discount.validTo || "");
    setSelectedCourts(discount.courts || []);
    setShowDiscountModal(true);
  };

  const handleSaveDiscount = async () => {
    if (
      !discountValue.trim() ||
      !discountDescription.trim() ||
      !validFrom ||
      !validTo
    ) {
      Alert.alert(
        t("common.error"),
        tDiscount("requiredFields"),
      );
      return;
    }

    if (!selectedGymForDiscount?.id && !selectedGymForDiscount?.gymId) {
      Alert.alert(t("common.error"), t("ownerDashboard.validation.selectGym"));
      return;
    }

    const parsedDiscountValue = Number(discountValue);
    if (
      Number.isNaN(parsedDiscountValue) ||
      parsedDiscountValue < 1 ||
      parsedDiscountValue > 100
    ) {
      Alert.alert(
        t("common.error"),
        tDiscount("percentageValidation"),
      );
      return;
    }

    if (new Date(validFrom) >= new Date(validTo)) {
      Alert.alert(
        t("common.error"),
        tDiscount("validRangeValidation"),
      );
      return;
    }

    const discountData = {
      type: "percentage",
      value: parsedDiscountValue,
      description: discountDescription.trim(),
      code: discountCode.trim().toUpperCase(),
      validFrom: validFrom,
      validTo: validTo,
      courts: selectedCourts,
    };

    try {
      if (editingDiscount) {
        updateDiscount(
          selectedGymForDiscount.id,
          editingDiscount.id,
          discountData,
        );
        Alert.alert(
          t("common.success"),
          tDiscount("updatedSuccessfully"),
        );
      } else {
        const gymId = selectedGymForDiscount.gymId ?? selectedGymForDiscount.id;
        await createGymDiscount(gymId, {
          gym: gymId,
          title: discountDescription.trim(),
          code: discountCode.trim().toUpperCase(),
          percentage: parsedDiscountValue,
          start_date: validFrom,
          end_date: validTo,
          is_active: true,
        });
        Alert.alert(
          t("common.success"),
          tDiscount("addedSuccessfully"),
        );
      }

      setShowDiscountModal(false);
      resetDiscountForm();
    } catch (error) {
      Alert.alert(t("common.error"), mapErrorToMessage(error).message);
    }
  };

  const handleDeleteDiscount = (gymId, discountId, discountDescription) => {
    Alert.alert(
      tDiscount("deleteDiscount"),
      tDiscount("confirmDeleteMessage", {
        description: discountDescription,
      }),
      [
        { text: t("ownerDashboard.actions.cancel"), style: "cancel" },
        {
          text: t("ownerDashboard.actions.delete"),
          style: "destructive",
          onPress: () => {
            deleteDiscount(gymId, discountId);
            Alert.alert(
              t("common.success"),
              tDiscount("deletedSuccessfully"),
            );
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
    setDiscountCode("");
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
  const loadTournamentGymCourts = async (gym) => {
    const gymId = gym?.gym_id || gym?.id;

    try {
      const response = await getGymFields(gymId);
      const fields = response?.results || response?.data?.results || response?.data || [];
      setAvailableCourts(fields);
    } catch (error) {
      console.log("Failed to load courts:", error);
      setAvailableCourts([]);
    }
  };

  const openTournamentModal = async (gym) => {
    setSelectedTournamentGym(gym);
    await loadTournamentGymCourts(gym);
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
    setFirstPlaceAward("");
    setSecondPlaceAward("");
    setThirdPlaceAward("");
    setTopScorerAward("");
    // setTournamentPrize("Winner: 20000, Runner-up: 10000");
    // setTournamentMaxTeams("8");
    setTournamentFormat("knockout");
    setTournamentRules("Standard rules apply");
    setSelectedTournamentCourts([]);
    setTournamentDuration("60");
    setTournamentTime("");
    setShowTournamentModal(true);
  };

  const handleSaveTournament = async () => {
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
    if (!tournamentDuration) {
      Alert.alert("Error", "Please enter tournament duration");
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
    const tournamentPayload = {
      gym: selectedTournamentGym.id,
      name: tournamentName.trim(),
      sport_type: "futsal",
      start_date: tournamentStartDate,
      end_date: tournamentEndDate,
      registration_fee: parseInt(tournamentEntryFee, 10),
      prize_amount: null,
      first_place_award: firstPlaceAward.trim(),
      second_place_award: secondPlaceAward.trim(),
      third_place_award: thirdPlaceAward.trim(),
      top_scorer_award: topScorerAward.trim(),
      max_teams: 8,
    };

    try {
      if (editingTournament) {
        await updateTournamentApi(editingTournament.id, tournamentPayload);
        Alert.alert("Success", "Tournament updated successfully!");
      } else {
        await createTournamentApi(tournamentPayload);
        Alert.alert("Success", "Tournament created successfully!");
      }
      await loadOwnerTournaments();
      setShowTournamentModal(false);
      resetTournamentForm();
    } catch (error) {
      Alert.alert("Error", mapErrorToMessage(error).message);
    }
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
    setFirstPlaceAward("");
    setSecondPlaceAward("");
    setThirdPlaceAward("");
    setTopScorerAward("");
    // setTournamentPrize("");
    // setTournamentMaxTeams("");
    setTournamentFormat("knockout");
    setTournamentRules("");
    setSelectedTournamentCourts([]);
    setTournamentDuration("60");
    setTournamentTime("");
  };

  const handleAddResult = async () => {
    if (!editingTournament) {
      return;
    }

    try {
      await finishTournamentApi(editingTournament.id);
      await loadTournamentBundle(editingTournament.id, { force: true });
      await loadOwnerTournaments();
      Alert.alert("Success", "Tournament finished successfully!");
      setShowResultModal(false);
      setEditingTournament(null);
      setResultWinner("");
      setResultRunnerUp("");
      setResultThirdPlace("");
    } catch (error) {
      Alert.alert("Error", mapErrorToMessage(error).message);
    }
  };

  // Match management functions
  const openMatchModal = (tournament) => {
    setSelectedMatchTournament(tournament);
    setSelectedTeam1(null);
    setSelectedTeam2(null);
    setMatchRound("1");
    setShowMatchModal(true);
  };

  // Handle automatic match generation after first match selection
  const handleGenerateAllMatches = async () => {
    if (!selectedMatchTournament) {
      return;
    }

    try {
      await loadTournamentBundle(selectedMatchTournament.id, { force: true });
      setShowMatchModal(false);
      setSelectedTeam1(null);
      setSelectedTeam2(null);
      setMatchRound("1");
      Alert.alert("Success", "Matches reloaded from server.");
    } catch (error) {
      Alert.alert("Error", mapErrorToMessage(error).message);
    }
  };

  // Handle knockout stage progression
  const handleStartKnockout = async (tournament) => {
    try {
      await startTournamentApi(tournament.id);
      await loadTournamentBundle(tournament.id, { force: true });
      await loadOwnerTournaments();
      Alert.alert("Success", "Tournament started successfully!");
    } catch (error) {
      Alert.alert("Error", mapErrorToMessage(error).message);
    }
  };

  const handleProgressTournament = async (tournament) => {
    try {
      await loadTournamentBundle(tournament.id, { force: true });
      Alert.alert("Success", "Tournament data refreshed.");
    } catch (error) {
      Alert.alert("Error", mapErrorToMessage(error).message);
    }
  };

  const openMatchResultModal = (match, tournament) => {
    setSelectedMatch({ ...match, tournamentId: tournament.id });
    setSelectedMatchTournament(tournament);
    setResultWinner("");
    setResultRunnerUp("");
    setShowMatchResultModal(true);
  };

  const handleMatchResult = async () => {
    if (!resultWinner.trim()) {
      Alert.alert("Error", "Please select the winner");
      return;
    }

    const winner = selectedMatchTournament.registeredTeams?.find(
      (t) => t.captainName === resultWinner.trim(),
    );

    if (!winner) {
      Alert.alert("Error", "Invalid winner team");
      return;
    }

    try {
      await submitMatchResultApi(selectedMatch.id, {
        status: "played",
        team1_score: selectedMatch.team1Id === winner.id ? 1 : 0,
        team2_score: selectedMatch.team2Id === winner.id ? 1 : 0,
        winner_team_id: winner.id,
      });
      await loadTournamentBundle(
        selectedMatch.tournamentId || selectedMatchTournament.id,
        { force: true },
      );
      await loadOwnerTournaments();
      Alert.alert("Success", "Match result saved!");
      setShowMatchResultModal(false);
      setSelectedMatch(null);
      setResultWinner("");
      setResultRunnerUp("");
    } catch (error) {
      Alert.alert("Error", mapErrorToMessage(error).message);
    }
  };

  const getTeamName = (teamId, tournament) => {
    const team = tournament.registeredTeams?.find((t) => t.id === teamId);
    return team?.captainName || "Unknown";
  };

  const toggleTournamentCourtSelection = (courtId) => {
    setSelectedTournamentCourts((prev) =>
      prev.includes(courtId)
        ? prev.filter((id) => id !== courtId)
        : [...prev, courtId],
    );
  };

  // Tournament group expansion
  const toggleTournamentExpansion = async (tournamentId) => {
    const nextExpanded = !expandedTournaments[tournamentId];
    setExpandedTournaments((prev) => ({
      ...prev,
      [tournamentId]: nextExpanded,
    }));

    if (!nextExpanded) {
      return;
    }

    try {
      await loadTournamentBundle(tournamentId);
    } catch (error) {
      Alert.alert("Error", mapErrorToMessage(error).message);
    }
  };

  // Generate group matches
  const handleGenerateGroupMatches = async (tournament) => {
    try {
      await startTournamentApi(tournament.id);
      await loadTournamentBundle(tournament.id, { force: true });
      await loadOwnerTournaments();
      Alert.alert("Success", "Tournament groups and matches loaded from server.");
    } catch (error) {
      Alert.alert("Error", mapErrorToMessage(error).message);
    }
  };

  const refreshTournamentOwnerState = async (tournamentId) => {
    await loadTournamentBundle(tournamentId, { force: true });
    await loadOwnerTournaments();
  };

  const handleApproveTeam = async (tournament, team) => {
    try {
      await approveTournamentTeamApi(team.id || team.teamId);
      await refreshTournamentOwnerState(tournament.id);
    } catch (error) {
      Alert.alert("Error", mapErrorToMessage(error).message);
    }
  };

  const handleRejectTeam = async (tournament, team) => {
    try {
      await rejectTournamentTeamApi(team.id || team.teamId);
      await refreshTournamentOwnerState(tournament.id);
    } catch (error) {
      Alert.alert("Error", mapErrorToMessage(error).message);
    }
  };

  const handleAssignTeamGroup = async (tournament, team, group) => {
    try {
      await assignTournamentTeamGroupApi(team.id || team.teamId, group);
      await refreshTournamentOwnerState(tournament.id);
    } catch (error) {
      Alert.alert("Error", mapErrorToMessage(error).message);
    }
  };

  const handleCompleteTournament = async (tournament) => {
    try {
      await finishTournamentApi(tournament.id);
      await loadTournamentBundle(tournament.id, { force: true });
      await loadOwnerTournaments();
      const refreshed = serverTournamentDetails[tournament.id];
      Alert.alert(
        t("ownerDashboard.tournaments.tournamentCompleted"),
        `${t("ownerDashboard.tournaments.winnerLabel")}: ${
          refreshed?.champion ||
          t("ownerDashboard.tournaments.updatedFromServer")
        }`,
      );
    } catch (error) {
      Alert.alert("Error", mapErrorToMessage(error).message);
    }
  };

  // Start knockout stage








































































  // Open score modal for entering match results
  const openScoreModal = (match, tournament) => {
    setEditingMatch({ ...match, tournamentId: tournament.id });
    setSelectedMatchTournament(tournament);
    setScore1Input(match.score1?.toString() || "");
    setScore2Input(match.score2?.toString() || "");
    setTopPlayerId(match.topPlayerId || null);
    setTopPlayerGoals(
      match.topPlayerGoals !== null && match.topPlayerGoals !== undefined
        ? String(match.topPlayerGoals)
        : "",
    );
    const nextPlayerGoalInputs = {};
    if (Array.isArray(match.playerGoals)) {
      match.playerGoals.forEach((entry) => {
        const playerId = entry.player_id ?? entry.playerId;
        if (playerId !== null && playerId !== undefined) {
          nextPlayerGoalInputs[playerId] = String(entry.goals ?? "");
        }
      });
    }
    setPlayerGoalInputs(nextPlayerGoalInputs);
    setShowScoreModal(true);
  };

  // Save match score
  const handleSaveScore = async () => {
    if (!editingMatch || !selectedMatchTournament) return;

    const score1 = parseInt(score1Input) || 0;
    const score2 = parseInt(score2Input) || 0;
    const selectedTopPlayerId = topPlayerId ? Number(topPlayerId) : null;
    const parsedTopPlayerGoals =
      topPlayerGoals.trim() === "" ? null : Number.parseInt(topPlayerGoals, 10);

    if (!selectedTopPlayerId) {
      Alert.alert("Error", "Please select the top player from this match");
      return;
    }

    if (!Number.isInteger(parsedTopPlayerGoals) || parsedTopPlayerGoals < 0) {
      Alert.alert("Error", "Please enter valid top player goals");
      return;
    }

    if (parsedTopPlayerGoals > score1 + score2) {
      Alert.alert("Error", "Top player goals cannot exceed total match goals");
      return;
    }
    const matchPlayers = getMatchPlayers(editingMatch, selectedMatchTournament);
    const playerGoalsPayload = [];
    const teamGoalTotals = {
      [editingMatch.team1Id]: 0,
      [editingMatch.team2Id]: 0,
    };

    for (const player of matchPlayers) {
      const playerId = player.id || player.memberId;
      const rawGoals = String(playerGoalInputs[playerId] || "").trim();
      if (!rawGoals) {
        continue;
      }

      const goals = Number.parseInt(rawGoals, 10);
      if (!Number.isInteger(goals) || goals < 0) {
        Alert.alert("Error", "Please enter valid player goals");
        return;
      }
      if (goals === 0) {
        continue;
      }

      playerGoalsPayload.push({ player_id: playerId, goals });
      teamGoalTotals[player.teamId] = (teamGoalTotals[player.teamId] || 0) + goals;
    }

    if (teamGoalTotals[editingMatch.team1Id] !== score1) {
      Alert.alert("Error", "Team 1 player goals must equal team score");
      return;
    }
    if (teamGoalTotals[editingMatch.team2Id] !== score2) {
      Alert.alert("Error", "Team 2 player goals must equal team score");
      return;
    }

    let winnerTeamId = null;
    if (score1 > score2) {
      winnerTeamId = editingMatch.team1Id;
    } else if (score2 > score1) {
      winnerTeamId = editingMatch.team2Id;
    }

    try {
      await submitMatchResultApi(editingMatch.id, {
        status: "played",
        team1_score: score1,
        team2_score: score2,
        winner_team_id: winnerTeamId,
        top_player_id: selectedTopPlayerId,
        top_player_goals: parsedTopPlayerGoals,
        player_goals: playerGoalsPayload,
      });
      await loadTournamentBundle(
        editingMatch.tournamentId || selectedMatchTournament.id,
        { force: true },
      );
      await loadOwnerTournaments();
      Alert.alert("Success", "Match result saved!");
      setShowScoreModal(false);
      setEditingMatch(null);
      setScore1Input("");
      setScore2Input("");
      setTopPlayerId(null);
      setTopPlayerGoals("");
      setPlayerGoalInputs({});
    } catch (error) {
      Alert.alert("Error", mapErrorToMessage(error).message);
    }
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

  const handleSaveGym = async () => {
    if (savingGym) {
      return;
    }

    if (!gymName.trim()) {
      Alert.alert(t("common.error"), t("ownerDashboard.validation.enterGymName"));
      return;
    }

    if (!gymAddress || !gymAddress.trim()) {
      Alert.alert(t("common.error"), t("ownerDashboard.validation.enterGymAddress"));
      return;
    }

    if (!gymCity || !gymCity.trim()) {
      Alert.alert(t("common.error"), t("ownerDashboard.validation.enterGymCity"));
      return;
    }

    if (!gymPhone || !gymPhone.trim()) {
      Alert.alert(t("common.error"), t("ownerDashboard.validation.enterGymPhone"));
      return;
    }

    if (!gymEmail || !gymEmail.trim()) {
      Alert.alert(t("common.error"), t("ownerDashboard.validation.enterGymEmail"));
      return;
    }

    if (editingGym) {
      const payload = buildOwnerGymUpdatePayload({
        name: gymName,
        address: gymAddress,
        city: gymCity,
        description: gymDescription,
        phone: gymPhone,
      });

      setSavingGym(true);

      try {
        await updateOwnerGymApi(editingGym.id, payload);
        await loadOwnerGyms({ throwOnError: true });
        setShowAddModal(false);
        resetForm();
        Alert.alert(t("common.success"), t("ownerDashboard.alerts.gymUpdated"));
      } catch (error) {
        const mappedError = mapErrorToMessage(error);
        Alert.alert(
          t("common.error"),
          mappedError.message || t("ownerDashboard.alerts.unableToUpdateGym"),
        );
        return;
      } finally {
        setSavingGym(false);
      }
    } else {
      const ownerId = owner?.user_id ?? owner?.id ?? null;

      if (!ownerId) {
        Alert.alert(t("common.error"), t("ownerDashboard.validation.ownerMissing"));
        return;
      }

      const payload = buildOwnerGymCreatePayload({
        owner: ownerId,
        name: gymName,
        address: gymAddress,
        city: gymCity,
        description: gymDescription,
        phone: gymPhone,
      });

    setSavingGym(true);

    try {
      const createdGym = await createOwnerGym(payload);
      const createdGymId = createdGym?.gym_id ?? createdGym?.id ?? null;
      let imageUploadWarning = null;

      if (createdGymId && gymImage) {
        try {
          await uploadOwnerGymImage(createdGymId, gymImage);
        } catch (imageError) {
          imageUploadWarning = mapErrorToMessage(imageError).message;
        }
      }

      await loadOwnerGyms({ throwOnError: true });

      setShowAddModal(false);
      resetForm();

      if (imageUploadWarning) {
        Alert.alert(
          t("common.success"),
          t("ownerDashboard.alerts.gymAddedWithImageWarning", {
            message: imageUploadWarning,
          }),
        );
      } else {
        Alert.alert(t("common.success"), t("ownerDashboard.alerts.gymCreated"));
      }
    } catch (error) {
      console.log("Owner gym create error.response.data", error?.response?.data ?? error?.data ?? null);
      const mappedError = mapErrorToMessage(error);
      Alert.alert(
        t("common.error"),
        mappedError.message || t("ownerDashboard.alerts.unableToAddGym"),
      );
      return;
    } finally {
        setSavingGym(false);
      }
    }
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
        <View
          style={[styles.gymCardContent, { flexDirection: getFlexDirection() }]}
        >
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
              <Ionicons name="fitness" size={40} color={PRIMARY_COLOR} />
            )}
          </View>
          <View style={styles.gymInfo}>
            <View
              style={[styles.gymNameRow, { flexDirection: getFlexDirection() }]}
            >
              <Text style={styles.gymName}>{item.name}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    getStatusStyle(),
                    { flexDirection: getFlexDirection() },
                  ]}
                >
                  <Ionicons name={getStatusIcon()} size={12} color="#fff" />
                  <Text style={[styles.statusText, getStartMargin(4), localizedTextStyle]}>
                    {getOwnerGymStatusLabel(item.status)}
                  </Text>
                </View>
              </View>
            <Text
              style={[
                styles.gymDetail,
                {
                  textAlign: getTextAlign(),
                  writingDirection: getWritingDirection(),
                },
              ]}
            >
              <Ionicons name="location" size={14} /> {item.address}, {item.city}
            </Text>
            <Text
              style={[
                styles.gymDetail,
                {
                  textAlign: getTextAlign(),
                  writingDirection: getWritingDirection(),
                },
              ]}
            >
              <Ionicons name="call" size={14} /> {item.phone}
            </Text>
            <Text
              style={[
                styles.gymDetail,
                {
                  textAlign: getTextAlign(),
                  writingDirection: getWritingDirection(),
                },
              ]}
            >
              {item.courts?.length || 0}{" "}
              {(item.courts?.length || 0) === 1
                ? t("ownerDashboard.gyms.court")
                : t("ownerDashboard.gyms.courts")}
            </Text>
            <View style={styles.gymScheduleSection}>
              <Text style={[styles.gymScheduleTitle, localizedTextStyle]}>
                {t("ownerDashboard.gyms.addedTimeSlots")}
              </Text>
              {item.schedulePreview?.length ? (
                <Text style={[styles.slotsCountText, localizedTextStyle]}>
                  {t("ownerDashboard.gyms.slotsAdded", {
                    count: item.schedulePreview.length,
                  })}
                </Text>
              ) : (
                <Text style={[styles.emptySlotsText, localizedTextStyle]}>
                  {t("ownerDashboard.gyms.noTimeSlots")}
                </Text>
              )}
            </View>
            {item.status === "rejected" && item.rejectionReason && (
              <Text
                style={[
                  styles.rejectionText,
                  {
                    textAlign: getTextAlign(),
                    writingDirection: getWritingDirection(),
                  },
                ]}
              >
                {t("ownerDashboard.gyms.reason")}: {item.rejectionReason}
              </Text>
            )}
          </View>
        </View>
        <View style={[styles.gymActions, { flexDirection: getFlexDirection() }]}>
          <TouchableOpacity
            style={styles.courtButton}
            onPress={() => handleCourtButtonPress(item)}
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
            style={[styles.deleteButton, { opacity: 0.4 }]}
            onPress={() => handleDeleteGym(item.id, item.name)}
            disabled
          >
            <Ionicons name="trash" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.courtButton, styles.timeSlotsActionButton]}
            onPress={() => openTimeSlotsModal(item)}
          >
            <Ionicons name="time-outline" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Render booking item
  const renderBookingItem = ({ item }) => {
    const getStatusBadge = () => {
      switch (String(item.bookingStatus || "").toLowerCase()) {
        case "confirmed":
          return { color: "#10B981", bg: "#D1FAE5", icon: "checkmark-circle" };
        case "completed":
          return { color: PRIMARY_COLOR, bg: PRIMARY_TINT, icon: "trophy-outline" };
        case "cancelled":
          return { color: "#EF4444", bg: "#FEE2E2", icon: "close-circle" };
        default:
          return { color: "#6B7280", bg: "#F3F4F6", icon: "help-circle" };
      }
    };

    const statusBadge = getStatusBadge();
    const paymentLabel = item.paymentStatus || "unknown";
    const bookingLabel = item.displayStatus || item.bookingStatus || "unknown";
    const createdAtLabel = item.createdAt
      ? new Date(item.createdAt).toLocaleString()
      : "";
    const timeLabel =
      item.startTime && item.endTime
        ? `${formatTime12Hour(item.startTime)} - ${formatTime12Hour(item.endTime)}`
        : "Time unavailable";
    const bookingKey = String(item.id);
    const isExpanded = Boolean(expandedBookings[bookingKey]);

    return (
      <View style={styles.bookingCard}>
        <View style={[styles.bookingHeader, { flexDirection: getFlexDirection() }]}>
          <View
            style={[styles.bookingGymInfo, { flexDirection: getFlexDirection() }]}
          >
            <Ionicons name="fitness" size={24} color={PRIMARY_COLOR} />
            <View style={[styles.bookingGymDetails, getStartMargin(12)]}>
              <Text style={[styles.bookingGymName, localizedTextStyle]}>
                {item.gymName || "Unknown Gym"}
              </Text>
              <Text style={[styles.bookingCourt, localizedTextStyle]}>
                {item.courtName || "Court"}
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.bookingStatusBadge,
              { backgroundColor: statusBadge.bg, flexDirection: getFlexDirection() },
            ]}
          >
            <Ionicons
              name={statusBadge.icon}
              size={14}
              color={statusBadge.color}
            />
            <Text
              style={[
                styles.bookingStatusText,
                { color: statusBadge.color },
                getStartMargin(4),
                localizedTextStyle,
              ]}
            >
              {String(bookingLabel).toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.bookingDetails}>
          <View style={[styles.bookingDetailRow, { flexDirection: getFlexDirection() }]}>
            <Ionicons name="person-outline" size={16} color="#6B7280" />
            <Text style={[styles.bookingDetailText, getStartMargin(8), localizedTextStyle]}>
              Customer: {item.customerName || "Customer"}
            </Text>
          </View>
          <View style={[styles.bookingDetailRow, { flexDirection: getFlexDirection() }]}>
            <Ionicons name="mail-outline" size={16} color="#6B7280" />
            <Text style={[styles.bookingDetailText, getStartMargin(8), localizedTextStyle]}>
              Email: {item.customerEmail || "Not available"}
            </Text>
          </View>
          <View style={[styles.bookingDetailRow, { flexDirection: getFlexDirection() }]}>
            <Ionicons name="call-outline" size={16} color="#6B7280" />
            <Text style={[styles.bookingDetailText, getStartMargin(8), localizedTextStyle]}>
              Phone: {item.customerPhone || "Not available"}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.bookingExpandButton, { flexDirection: getFlexDirection() }]}
          onPress={() =>
            setExpandedBookings((prev) => ({
              ...prev,
              [bookingKey]: !prev[bookingKey],
            }))
          }
        >
          <Text style={[styles.bookingExpandButtonText, localizedTextStyle]}>
            {isExpanded ? "Less" : " More"}
          </Text>
          <Ionicons
            name={isExpanded ? "chevron-up-outline" : "chevron-down-outline"}
            size={18}
            color={PRIMARY_COLOR}
            style={getStartMargin(6)}
          />
        </TouchableOpacity>

        {isExpanded ? (
          <>
            <View style={styles.bookingExpandedContent}>
              <View style={[styles.bookingDetailRow, { flexDirection: getFlexDirection() }]}>
                <Ionicons name="business-outline" size={16} color="#6B7280" />
                <Text style={[styles.bookingDetailText, getStartMargin(8), localizedTextStyle]}>
                  Gym: {item.gymName || "Gym"}
                </Text>
              </View>
              <View style={[styles.bookingDetailRow, { flexDirection: getFlexDirection() }]}>
                <Ionicons name="layers-outline" size={16} color="#6B7280" />
                <Text style={[styles.bookingDetailText, getStartMargin(8), localizedTextStyle]}>
                  Court: {item.courtName || "Court"}
                </Text>
              </View>
              <View style={[styles.bookingDetailRow, { flexDirection: getFlexDirection() }]}>
                <Ionicons name="calendar-outline" size={16} color="#6B7280" />
                <Text style={[styles.bookingDetailText, getStartMargin(8), localizedTextStyle]}>
                  Date: {item.bookingDate || "Not set"}
                </Text>
              </View>
              <View style={[styles.bookingDetailRow, { flexDirection: getFlexDirection() }]}>
                <Ionicons name="time-outline" size={16} color="#6B7280" />
                <Text style={[styles.bookingDetailText, getStartMargin(8), localizedLtrValueStyle]}>
                  Time: {timeLabel}
                </Text>
              </View>
              <View style={[styles.bookingDetailRow, { flexDirection: getFlexDirection() }]}>
                <Ionicons name="timer-outline" size={16} color="#6B7280" />
                <Text style={[styles.bookingDetailText, getStartMargin(8), localizedTextStyle]}>
                  Duration: {item.duration || "Not available"} Minutes
                </Text>
              </View>
              <View style={[styles.bookingDetailRow, { flexDirection: getFlexDirection() }]}>
                <Ionicons name="card-outline" size={16} color="#6B7280" />
                <Text style={[styles.bookingDetailText, getStartMargin(8), localizedTextStyle]}>
                  Payment: {paymentLabel}
                </Text>
              </View>
              <View style={[styles.bookingDetailRow, { flexDirection: getFlexDirection() }]}>
                <Ionicons name="checkmark-done-outline" size={16} color="#9ea1a9" />
                <Text style={[styles.bookingDetailText, getStartMargin(8), localizedTextStyle]}>
                  Booking: {bookingLabel}
                </Text>
              </View>
            </View>

            <View style={styles.bookingDivider} />

            <View style={[styles.bookingFooter, { flexDirection: getFlexDirection() }]}>
              <View style={[styles.priceContainer, { flexDirection: getFlexDirection() }]}>
                <Text style={[styles.priceLabel, localizedTextStyle]}>Total:</Text>
                <Text style={[styles.priceValue, localizedLtrValueStyle]}>
                  {item.totalAmount} AFG
                </Text>
              </View>
            </View>

            {createdAtLabel ? (
              <Text style={[styles.bookedAtText, localizedTextStyle]}>
                Created: {createdAtLabel}
              </Text>
            ) : null}
          </>
        ) : null}
      </View>
    );
  };

  const financeOverviewDonutItems = financeSummary
    ? [
        { label: t("ownerDashboard.finance.totalRevenue"), value: financeSummary.totalRevenue },
        { label: t("ownerDashboard.finance.bookingRevenue"), value: financeSummary.bookingRevenue },
        {
          label: t("ownerDashboard.finance.tournamentRevenue"),
          value: financeSummary.tournamentRevenue,
        },
      ]
    : [];

  const expenseBreakdownPieItems = financeSummary
    ? [
        { label: t("ownerDashboard.finance.rent"), value: financeSummary.rentTotal },
        { label: t("ownerDashboard.finance.electricity"), value: financeSummary.electricityTotal },
        { label: t("ownerDashboard.finance.staffSalary"), value: financeSummary.staffSalaryTotal },
      ]
    : [];

  const revenueExpenseComparisonItems = financeSummary
    ? [
        { label: t("ownerDashboard.finance.totalRevenue"), value: financeSummary.totalRevenue },
        { label: t("ownerDashboard.finance.totalExpenses"), value: financeSummary.totalExpenses },
        { label: t("ownerDashboard.finance.finalProfit"), value: financeSummary.finalProfit },
      ]
    : [];

  const groupedRevenueExpenseItems = financeSummary
    ? [
        { label: t("ownerDashboard.finance.totalRevenue"), value: financeSummary.totalRevenue },
        { label: t("ownerDashboard.finance.totalExpenses"), value: financeSummary.totalExpenses },
      ]
    : [];

  const financeDonutColors = [PRIMARY_COLOR, "#0f64b9", "#ab2bc5"];
  const expensePieColors = [PRIMARY_COLOR, "red", "#67aee0"];
  const financeBarColors = [PRIMARY_COLOR, "red", "#86EFAC"];

  const getChartNumber = (value) => {
    const numericValue = Number(value || 0);
    return Number.isFinite(numericValue) ? Math.max(numericValue, 0) : 0;
  };

  const getMetricValue = (value) => {
    const numericValue = Number(value || 0);
    return Number.isFinite(numericValue) ? numericValue : 0;
  };

  const getChartTotal = (items) =>
    items.reduce((sum, item) => sum + getChartNumber(item.value), 0);

  const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians),
    };
  };

  const describePieSlice = (centerX, centerY, radius, startAngle, endAngle) => {
    const start = polarToCartesian(centerX, centerY, radius, endAngle);
    const end = polarToCartesian(centerX, centerY, radius, startAngle);
    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

    return [
      `M ${centerX} ${centerY}`,
      `L ${start.x} ${start.y}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
      "Z",
    ].join(" ");
  };

  const describeDonutSlice = (
    centerX,
    centerY,
    outerRadius,
    innerRadius,
    startAngle,
    endAngle,
  ) => {
    const outerStart = polarToCartesian(centerX, centerY, outerRadius, endAngle);
    const outerEnd = polarToCartesian(centerX, centerY, outerRadius, startAngle);
    const innerStart = polarToCartesian(centerX, centerY, innerRadius, startAngle);
    const innerEnd = polarToCartesian(centerX, centerY, innerRadius, endAngle);
    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

    return [
      `M ${outerStart.x} ${outerStart.y}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${outerEnd.x} ${outerEnd.y}`,
      `L ${innerStart.x} ${innerStart.y}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${innerEnd.x} ${innerEnd.y}`,
      "Z",
    ].join(" ");
  };

  const buildCircularSegments = (items) => {
    const total = getChartTotal(items);
    let currentAngle = 0;

    return {
      total,
      segments: items.map((item, index) => {
        const numericValue = getChartNumber(item.value);
        const sweepAngle = total > 0 ? (numericValue / total) * 360 : 0;
        const startAngle = currentAngle;
        const endAngle = currentAngle + sweepAngle;
        currentAngle = endAngle;

        return {
          ...item,
          originalIndex: index,
          numericValue,
          startAngle,
          endAngle,
        };
      }),
    };
  };

  const renderChartLegend = (items, colors) => (
    <View style={styles.financeLegendList}>
      {items.map((item, index) => (
        <View
          key={`${item.label}-${index}`}
          style={[styles.financeLegendRow, { flexDirection: getFlexDirection() }]}
        >
          <View style={[styles.financeLegendLabelWrap, { flexDirection: getFlexDirection() }]}>
            <View
              style={[
                styles.financeLegendSwatch,
                { backgroundColor: colors[index % colors.length] },
              ]}
            />
            <Text style={[styles.financeLegendLabel, localizedTextStyle]}>
              {item.label}
            </Text>
          </View>
          <Text style={[styles.financeLegendValue, localizedLtrValueStyle]}>
            {formatMoney(item.value)}
          </Text>
        </View>
      ))}
    </View>
  );

  const renderCircularChart = (items, colors, variant = "pie") => {
    const chartSize = 220;
    const center = chartSize / 2;
    const outerRadius = 78;
    const innerRadius = variant === "donut" ? 46 : 0;
    const { total, segments } = buildCircularSegments(items);
    const nonZeroSegments = segments.filter((item) => item.numericValue > 0);
    const singleSegmentColor =
      nonZeroSegments.length > 0
        ? colors[nonZeroSegments[0].originalIndex % colors.length]
        : colors[0];

    return (
      <View style={styles.financeChartCard}>
        <View style={styles.financeCircularChartWrap}>
          <Svg width={chartSize} height={chartSize} viewBox={`0 0 ${chartSize} ${chartSize}`}>
            {total > 0 ? (
              nonZeroSegments.length === 1 ? (
                variant === "donut" ? (
                  <Circle
                    cx={center}
                    cy={center}
                    r={(outerRadius + innerRadius) / 2}
                    stroke={singleSegmentColor}
                    strokeWidth={outerRadius - innerRadius}
                    fill="none"
                  />
                ) : (
                  <Circle
                    cx={center}
                    cy={center}
                    r={outerRadius}
                    fill={singleSegmentColor}
                  />
                )
              ) : (
                nonZeroSegments.map((item, index) => (
                  <Path
                    key={`${item.label}-${index}`}
                    d={
                      variant === "donut"
                        ? describeDonutSlice(
                            center,
                            center,
                            outerRadius,
                            innerRadius,
                            item.startAngle,
                            item.endAngle,
                          )
                        : describePieSlice(
                            center,
                            center,
                            outerRadius,
                            item.startAngle,
                            item.endAngle,
                          )
                    }
                    fill={colors[item.originalIndex % colors.length]}
                  />
                ))
              )
            ) : variant === "donut" ? (
              <Circle
                cx={center}
                cy={center}
                r={(outerRadius + innerRadius) / 2}
                stroke="#E5E7EB"
                strokeWidth={outerRadius - innerRadius}
                fill="none"
              />
            ) : (
              <Circle
                cx={center}
                cy={center}
                r={outerRadius}
                fill="#E5E7EB"
              />
            )}
          </Svg>
          {variant === "donut" ? (
            <View style={styles.financeDonutCenter}>
              <Text style={[styles.financeDonutCenterValue, localizedLtrValueStyle]}>
                {formatMoney(total)}
              </Text>
            </View>
          ) : null}
        </View>
        {renderChartLegend(items, colors)}
      </View>
    );
  };

  const renderBarChart = (items, colors) => {
    const maxValue = items.reduce(
      (highestValue, item) => Math.max(highestValue, getChartNumber(item.value)),
      0,
    );

    return (
      <View style={styles.financeChartCard}>
        <View style={styles.financeBarChartArea}>
          {items.map((item, index) => {
            const numericValue = getChartNumber(item.value);
            const heightPercent = maxValue > 0 ? (numericValue / maxValue) * 100 : 0;

            return (
              <View key={`${item.label}-${index}`} style={styles.financeBarItem}>
                <Text style={[styles.financeBarAmount, localizedLtrValueStyle]}>
                  {formatMoney(item.value)}
                </Text>
                <View style={styles.financeBarTrack}>
                  <View
                    style={[
                      styles.financeBarFill,
                      {
                        height: `${Math.max(heightPercent, numericValue > 0 ? 8 : 0)}%`,
                        backgroundColor: colors[index % colors.length],
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.financeBarLabel, localizedTextStyle]}>
                  {item.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderGroupedBarChart = (items, colors) => {
    const maxValue = items.reduce(
      (highestValue, item) => Math.max(highestValue, getChartNumber(item.value)),
      0,
    );

    return (
      <View style={styles.financeChartCard}>
        <View style={styles.financeGroupedChartArea}>
          <View style={styles.financeGroupedBarCluster}>
            {items.map((item, index) => {
              const numericValue = getChartNumber(item.value);
              const heightPercent = maxValue > 0 ? (numericValue / maxValue) * 100 : 0;

              return (
                <View
                  key={`${item.label}-${index}`}
                  style={styles.financeGroupedBarItem}
                >
                  <Text style={[styles.financeGroupedBarAmount, localizedLtrValueStyle]}>
                    {formatMoney(item.value)}
                  </Text>
                  <View style={styles.financeGroupedBarTrack}>
                    <View
                      style={[
                        styles.financeGroupedBarFill,
                        {
                          height: `${Math.max(heightPercent, numericValue > 0 ? 8 : 0)}%`,
                          backgroundColor: colors[index % colors.length],
                        },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
        {renderChartLegend(items, colors)}
      </View>
    );
  };

  const getMonthKey = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

  const parseDateValue = (value) => {
    if (!value) {
      return null;
    }

    const parsedDate = new Date(value);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  };

  const buildMonthlyFinanceTrend = () => {
    const formatter = new Intl.DateTimeFormat(i18n.language || "en", {
      month: "short",
    });
    const monthBuckets = [];
    const now = new Date();

    for (let index = 5; index >= 0; index -= 1) {
      const bucketDate = new Date(now.getFullYear(), now.getMonth() - index, 1);
      monthBuckets.push({
        key: getMonthKey(bucketDate),
        label: formatter.format(bucketDate),
      });
    }

    const revenueByMonth = revenues.reduce((accumulator, item) => {
      const sourceDate = parseDateValue(
        item.createdAt || item.bookingDetails?.booking_date || item.tournamentDetails?.created_at,
      );
      if (!sourceDate) {
        return accumulator;
      }

      const monthKey = getMonthKey(sourceDate);
      accumulator[monthKey] = (accumulator[monthKey] || 0) + getMetricValue(item.amount);
      return accumulator;
    }, {});

    const expensesByMonth = expenses.reduce((accumulator, item) => {
      const sourceDate = parseDateValue(item.expenseDate || item.createdAt);
      if (!sourceDate) {
        return accumulator;
      }

      const monthKey = getMonthKey(sourceDate);
      accumulator[monthKey] = (accumulator[monthKey] || 0) + getMetricValue(item.amount);
      return accumulator;
    }, {});

    return monthBuckets.map((bucket) => {
      const revenue = revenueByMonth[bucket.key] || 0;
      const monthlyExpenses = expensesByMonth[bucket.key] || 0;

      return {
        label: bucket.label,
        revenue,
        expenses: monthlyExpenses,
        profit: revenue - monthlyExpenses,
      };
    });
  };

  const monthlyFinanceTrend = buildMonthlyFinanceTrend();

  const renderLineChart = (items) => {
    const chartWidth = 320;
    const chartHeight = 220;
    const paddingLeft = 30;
    const paddingRight = 12;
    const paddingTop = 16;
    const paddingBottom = 30;
    const plotWidth = chartWidth - paddingLeft - paddingRight;
    const plotHeight = chartHeight - paddingTop - paddingBottom;
    const allValues = items.flatMap((item) => [
      getMetricValue(item.revenue),
      getMetricValue(item.expenses),
      getMetricValue(item.profit),
    ]);
    const minValue = Math.min(0, ...allValues);
    const maxValue = Math.max(0, ...allValues);
    const valueRange = Math.max(maxValue - minValue, 1);

    const buildPoints = (valueKey) =>
      items.map((item, index) => {
        const x =
          paddingLeft +
          (items.length === 1 ? plotWidth / 2 : (plotWidth / (items.length - 1)) * index);
        const y =
          paddingTop +
          ((maxValue - getMetricValue(item[valueKey])) / valueRange) * plotHeight;
        return { x, y };
      });

    const buildPath = (points) =>
      points
        .map((point, index) =>
          `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
        )
        .join(" ");

    const revenuePoints = buildPoints("revenue");
    const expensePoints = buildPoints("expenses");
    const profitPoints = buildPoints("profit");
    const guideSteps = 4;
    const trendLegend = [
      { label: "Monthly Revenue", color: PRIMARY_COLOR, valueKey: "revenue" },
      { label: "Monthly Expenses", color: "#EF4444", valueKey: "expenses" },
      { label: "Monthly Profit", color: PRIMARY_DARK, valueKey: "profit" },
    ];

    return (
      <View style={styles.financeChartCard}>
        <View style={styles.financeTrendChartWrap}>
          <Svg width={chartWidth} height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
            {Array.from({ length: guideSteps + 1 }, (_, index) => {
              const y = paddingTop + (plotHeight / guideSteps) * index;
              return (
                <Path
                  key={`guide-${index}`}
                  d={`M ${paddingLeft} ${y} L ${chartWidth - paddingRight} ${y}`}
                  stroke="#E5E7EB"
                  strokeWidth="1"
                  fill="none"
                />
              );
            })}

            <Path
              d={`M ${paddingLeft} ${
                paddingTop + ((maxValue - 0) / valueRange) * plotHeight
              } L ${chartWidth - paddingRight} ${
                paddingTop + ((maxValue - 0) / valueRange) * plotHeight
              }`}
              stroke="#D1D5DB"
              strokeWidth="1.5"
              fill="none"
            />

            <Path d={buildPath(revenuePoints)} stroke={PRIMARY_COLOR} strokeWidth="3" fill="none" />
            <Path d={buildPath(expensePoints)} stroke="#EF4444" strokeWidth="3" fill="none" />
            <Path d={buildPath(profitPoints)} stroke={PRIMARY_DARK} strokeWidth="3" fill="none" />

            {[revenuePoints, expensePoints, profitPoints].map((seriesPoints, seriesIndex) =>
              seriesPoints.map((point, pointIndex) => (
                <Circle
                  key={`point-${seriesIndex}-${pointIndex}`}
                  cx={point.x}
                  cy={point.y}
                  r="3.5"
                  fill={trendLegend[seriesIndex].color}
                />
              )),
            )}
          </Svg>
          <View style={styles.financeTrendLabelsRow}>
            {items.map((item, index) => (
              <Text
                key={`${item.label}-${index}`}
                style={[styles.financeTrendLabel, localizedTextStyle]}
              >
                {item.label}
              </Text>
            ))}
          </View>
        </View>

        <View style={styles.financeLegendList}>
          {trendLegend.map((item) => (
            <View
              key={item.label}
              style={[styles.financeLegendRow, { flexDirection: getFlexDirection() }]}
            >
              <View
                style={[styles.financeLegendLabelWrap, { flexDirection: getFlexDirection() }]}
              >
                <View
                  style={[styles.financeLegendSwatch, { backgroundColor: item.color }]}
                />
                <Text style={[styles.financeLegendLabel, localizedTextStyle]}>
                  {item.label}
                </Text>
              </View>
              <Text style={[styles.financeLegendValue, localizedLtrValueStyle]}>
                {formatMoney(items[items.length - 1]?.[item.valueKey] || 0)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const getTournamentStatusLabel = (statusValue) => {
    const normalized = String(statusValue || "").trim().toLowerCase();

    if (normalized === "pending") {
      return t("ownerDashboard.gyms.pending");
    }

    if (normalized === "registration_open") {
      return t("tournaments.status.registrationOpen");
    }

    return t(`tournaments.status.${normalized}`, {
      defaultValue: normalized.replace(/_/g, " "),
    });
  };

  const getTournamentMatchStatusLabel = (statusValue) => {
    const normalized = String(statusValue || "").trim().toLowerCase();

    return t(`tournaments.status.${normalized}`, {
      defaultValue: normalized.replace(/_/g, " "),
    });
  };

  const getTournamentGroupLabel = (groupValue) => {
    const normalized = String(groupValue || "").trim().toLowerCase();

    if (normalized === "group a") return t("tournaments.groupA");
    if (normalized === "group b") return t("tournaments.groupB");

    return groupValue || "";
  };

  const getTournamentRoundLabel = (roundValue) => {
    const normalized = String(roundValue || "").trim().toLowerCase();

    if (normalized === "match 1") {
      return t("ownerDashboard.tournaments.match1");
    }

    if (normalized === "match 2") {
      return t("ownerDashboard.tournaments.match2");
    }

    if (normalized === "challenge match") {
      return t("ownerDashboard.tournaments.challengeMatch");
    }

    return roundValue || "";
  };

  return (
    <View style={styles.container}>
      {/* Header */}
        <View style={[styles.header, { flexDirection: getFlexDirection() }]}>
          <View>
            <Text style={[styles.welcomeText, localizedTextStyle]}>
            {t("ownerDashboard.header.welcomeBack")}: {owner?.name}
            </Text>
          </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {/* Tab Buttons */}
        <View
          style={[
            styles.tabContainer,
            { flexDirection: getFlexDirection() },
          ]}
        >
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tabButton,
              activeTab === tab.key && styles.tabButtonActive,
            ]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text
              style={[
                styles.tabText,
                localizedTextStyle,
                activeTab === tab.key && styles.tabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content based on active tab */}
      {activeTab === "gyms" ? (
        <>
          {/* Stats */}
          <View style={[styles.statsContainer, { flexDirection: getFlexDirection() }]}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{finalOwnerGyms.length}</Text>
              <Text style={[styles.statLabel, localizedTextStyle]}>
                {t("ownerDashboard.gyms.myGyms")}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{sortedBookings.length}</Text>
              <Text style={[styles.statLabel, localizedTextStyle]}>Total Bookings</Text>
            </View>
          </View>

          {/* My Gyms Section */}
          <View style={[styles.sectionHeader, { flexDirection: getFlexDirection() }]}>
            <Text style={[styles.sectionTitle, localizedTextStyle]}>
              {t("ownerDashboard.gyms.myGyms")}
            </Text>
            <TouchableOpacity
              style={[styles.addButton, { flexDirection: getFlexDirection() }]}
              onPress={openAddModal}
            >
              <Ionicons name="add" size={24} color="#black" fontWeight="bold" />
              <Text style={[styles.addButtonText, getStartMargin(4), localizedTextStyle]}>
                {t("ownerDashboard.gyms.addGym")}
              </Text>
            </TouchableOpacity>
          </View>

          {ownerGymsLoading ? (
            <View style={styles.ownerGymsStatusRow}>
              <ActivityIndicator size="small" color="#48bd31" />
              <Text style={styles.ownerGymsStatusText}>
                {t("ownerDashboard.states.loading")}
              </Text>
            </View>
          ) : null}

          {ownerGymsError ? (
            <>
              <Text style={styles.ownerGymsErrorText}>
                {ownerGymsError} {t("ownerDashboard.gyms.showingSavedGymsInstead")}
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={loadOwnerGyms}
              >
                <Text style={styles.emptyButtonText}>
                  {t("ownerDashboard.states.retry")}
                </Text>
              </TouchableOpacity>
            </>
          ) : null}

          {/* Gyms List */}
          {finalOwnerGyms.length > 0 ? (
            <FlatList
              data={finalOwnerGyms}
              renderItem={renderGymItem}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="business-outline" size={60} color="#ccc" />
              <Text style={styles.emptyText}>{t("ownerDashboard.states.noGyms")}</Text>
              <Text style={styles.emptySubtext}>{t("ownerDashboard.gyms.addFirstGym")}</Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={openAddModal}
              >
                <Text style={styles.emptyButtonText}>
                  {t("ownerDashboard.gyms.addGym")}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : activeTab === "bookings" ? (
        <>
          {/* Bookings Section */}
          <View style={[styles.sectionHeader, { flexDirection: getFlexDirection() }]}>
            <Text style={[styles.sectionTitle, localizedTextStyle]}>Recent Bookings</Text>
            <TouchableOpacity
              style={[styles.addButton, { flexDirection: getFlexDirection() }]}
              onPress={loadOwnerBookings}
            >
              <Ionicons name="refresh" size={18} color="black" />
              <Text style={[styles.addButtonText, getStartMargin(4), localizedTextStyle]}>
                Refresh
              </Text>
            </TouchableOpacity>
          </View>

          {ownerBookingsLoading && !ownerBookingsLoaded ? (
            <View style={styles.ownerGymsStatusRow}>
              <ActivityIndicator size="small" color={PRIMARY_COLOR} />
              <Text style={styles.ownerGymsStatusText}>
                {t("ownerDashboard.states.loading")}
              </Text>
            </View>
          ) : null}

          {ownerBookingsError ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="alert-circle-outline" size={60} color="#ccc" />
              <Text style={styles.emptyText}>{ownerBookingsError}</Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={loadOwnerBookings}
              >
                <Text style={styles.emptyButtonText}>
                  {t("ownerDashboard.states.retry")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : sortedBookings.length > 0 ? (
            <FlatList
              data={sortedBookings}
              renderItem={renderBookingItem}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={60} color="#ccc" />
              <Text style={styles.emptyText}>{t("ownerDashboard.states.noBookings")}</Text>
              <Text style={styles.emptySubtext}>
                {t("ownerDashboard.states.bookingsWillAppearHere")}
              </Text>
            </View>
          )}
        </>
      ) : activeTab === "finance" ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.financeContent}
        >
          <View style={[styles.sectionHeader, { flexDirection: getFlexDirection() }]}>
            <Text style={styles.sectionTitle}>{t("ownerDashboard.finance.title")}</Text>
            <TouchableOpacity
              style={styles.addExpenseButton}
              onPress={() => setShowExpenseForm(true)}
            >
              <Text style={styles.addExpenseButtonText}>
                {t("ownerDashboard.finance.addExpense")}
              </Text>
            </TouchableOpacity>
          </View>

          {(financeLoading || expensesLoading || revenuesLoading) &&
          !financeLoaded &&
          !expensesLoaded &&
          !revenuesLoaded ? (
                <View style={styles.emptyContainer}>
                  <ActivityIndicator size="large" color={PRIMARY_COLOR} />
                  <Text style={styles.emptyText}>
                    {t("ownerDashboard.states.loadingFinance")}
                  </Text>
                </View>
          ) : (
            <>
              {financeError || expensesError || revenuesError ? (
                <View style={styles.financeErrorCard}>
                  <Text style={styles.financeErrorTitle}>
                    {t("ownerDashboard.states.unableToLoadFinance")}
                  </Text>
                  <Text style={styles.financeErrorDetail}>
                    {financeError || expensesError || revenuesError}
                  </Text>
                  <TouchableOpacity
                    style={styles.emptyButton}
                    onPress={retryFinanceData}
                  >
                    <Text style={styles.emptyButtonText}>
                      {t("ownerDashboard.states.retry")}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {financeLoading && !financeSummary ? (
                <View style={styles.financeInlineState}>
                  <ActivityIndicator size="small" color={PRIMARY_COLOR} />
                  <Text style={styles.ownerGymsStatusText}>
                    {t("ownerDashboard.states.loadingFinance")}
                  </Text>
                </View>
              ) : financeError ? (
                <View style={styles.financeInlineState}>
                  <Text style={styles.emptyText}>{financeError}</Text>
                </View>
              ) : !financeSummary ? (
                <View style={styles.financeInlineState}>
                  <Text style={styles.emptyText}>
                    {t("ownerDashboard.states.noFinanceData")}
                  </Text>
                </View>
              ) : (
                <>
                  {/* Official finance totals are backend-calculated.
                      Frontend must only display returned values. */}
                  {renderLineChart(monthlyFinanceTrend)}

                  {renderCircularChart(
                    financeOverviewDonutItems,
                    financeDonutColors,
                    "donut",
                  )}

                  {renderBarChart(
                    revenueExpenseComparisonItems,
                    financeBarColors,
                  )}

                  {renderGroupedBarChart(
                    groupedRevenueExpenseItems,
                    financeBarColors,
                  )}

                  <View style={[styles.sectionHeader, { flexDirection: getFlexDirection() }]}>
                    <Text style={styles.sectionTitle}>
                      {t("ownerDashboard.finance.expenseBreakdown")}
                    </Text>
                  </View>

                  {renderCircularChart(
                    expenseBreakdownPieItems,
                    expensePieColors,
                    "pie",
                  )}
                </>
              )}

              <View style={[styles.sectionHeader, { flexDirection: getFlexDirection() }]}>
                <Text style={styles.sectionTitle}>
                  {t("ownerDashboard.finance.expenseHistory")}
                </Text>
              </View>

              {expensesLoading ? (
                <View style={styles.financeInlineState}>
                  <ActivityIndicator size="small" color={PRIMARY_COLOR} />
                  <Text style={styles.ownerGymsStatusText}>
                    {t("ownerDashboard.states.loadingFinance")}
                  </Text>
                </View>
              ) : expensesError ? (
                <View style={styles.financeInlineState}>
                  <Text style={styles.emptyText}>{expensesError}</Text>
                </View>
              ) : expenses.length === 0 ? (
                <View style={styles.financeInlineState}>
                  <Text style={styles.emptyText}>
                    {t("ownerDashboard.finance.noExpenses")}
                  </Text>
                </View>
              ) : (
                expenses.map((expense, index) => (
                  <View
                    key={expense.id ?? `expense-${expense.expenseType ?? "type"}-${expense.expenseDate ?? "date"}-${index}`}
                    style={styles.gymCard}
                  >
                    <Text style={styles.gymName}>
                      {expense.gymName || "Gym"}
                    </Text>
                    <Text style={styles.gymDetail}>
                      {getExpenseTypeLabel(
                        expense.expenseTypeDisplay || expense.expenseType,
                      )}
                    </Text>
                      <Text style={[styles.financeHistoryAmount, localizedLtrValueStyle]}>
                        {formatMoney(expense.amount)}
                      </Text>
                    <Text style={styles.gymDetail}>{expense.expenseDate}</Text>
                    {expense.notes ? (
                      <Text style={styles.gymDetail}>{expense.notes}</Text>
                    ) : null}
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>
      ) : activeTab === "tournaments" ? (
        <>
          {/* Tournaments Section */}
          <View style={[styles.statsContainer, { flexDirection: getFlexDirection() }]}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{pendingTournaments.length}</Text>
              <Text style={[styles.statLabel, localizedTextStyle]}>
                {t("ownerDashboard.gyms.pending")}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>
                {upcomingTournaments.length}
              </Text>
              <Text style={[styles.statLabel, localizedTextStyle]}>
                {t("tournaments.status.upcoming")}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>
                {completedTournaments.length}
              </Text>
              <Text style={[styles.statLabel, localizedTextStyle]}>
                {t("tournaments.status.completed")}
              </Text>
            </View>
          </View>

          <View style={[styles.sectionHeader, { flexDirection: getFlexDirection() }]}>
            <Text style={[styles.sectionTitle, localizedTextStyle]}>
              {t("ownerDashboard.tournaments.myTournaments")}
            </Text>
            <TouchableOpacity
              style={[styles.addButton, { flexDirection: getFlexDirection() }]}
              onPress={() => {
                if (finalOwnerGyms.length > 0) {
                  openTournamentModal(finalOwnerGyms[0]);
                } else {
                  Alert.alert(
                    t("ownerDashboard.states.noGyms"),
                    t("ownerDashboard.tournaments.addGymBeforeTournament"),
                  );
                }
              }}
            >
              <Ionicons name="add" size={24} color="#fff" fontWeight="bold" />
              <Text style={[styles.addButtonText, getStartMargin(4), localizedTextStyle]}>
                {t("ownerDashboard.tournaments.addTournament")}
              </Text>
            </TouchableOpacity>
          </View>

          {!tournamentsLoaded ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={PRIMARY_COLOR} />
              <Text style={styles.emptyText}>{t("tournaments.loading")}</Text>
            </View>
          ) : tournamentsError ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{tournamentsError}</Text>
            </View>
          ) : ownerTournaments.length > 0 ? (
            <FlatList
              data={ownerTournaments}
              renderItem={({ item }) => {
                const detail = serverTournamentDetails[item.id] || item;
                const groups = detail.groups || { groupA: [], groupB: [] };
                const allMatches = serverTournamentMatches[item.id] || [];
                const groupMatches = allMatches.filter((match) =>
                  String(match.round || "").toLowerCase().includes("group"),
                );
                const knockoutMatches = allMatches.filter(
                  (match) =>
                    !String(match.round || "").toLowerCase().includes("group"),
                );
                const standings = serverTournamentStandings[item.id] || {
                  groupA: [],
                  groupB: [],
                };
                const groupAStandings = standings.groupA || [];
                const groupBStandings = standings.groupB || [];
                const ranking = normalizeRankingEntries(
                  serverTournamentRanking[item.id] || detail.finalRanking || [],
                );
                const status = detail.status || item.status;
                const championName =
                  detail.champion || ranking[0]?.teamName || null;
                const ungroupedTeams = (detail.registeredTeams || []).filter(
                  (team) => !team.group && !team.groupName,
                );
                const pendingApprovalTeams = ungroupedTeams.filter(
                  (team) => team.status === "pending_owner_approval",
                );
                const approvedUngroupedTeams = ungroupedTeams.filter((team) =>
                  ["approved", "confirmed"].includes(team.status),
                );
                const isExpanded = expandedTournaments[item.id];
                const awardItems = [
                  {
                    label: t("ownerDashboard.tournaments.firstPlaceAward", { defaultValue: "1st Place Award" }),
                    value: detail.firstPlaceAward,
                    position: 1,
                  },
                  {
                    label: t("ownerDashboard.tournaments.secondPlaceAward", { defaultValue: "2nd Place Award" }),
                    value: detail.secondPlaceAward,
                    position: 2,
                  },
                  {
                    label: t("ownerDashboard.tournaments.thirdPlaceAward", { defaultValue: "3rd Place Award" }),
                    value: detail.thirdPlaceAward,
                    position: 3,
                  },
                  {
                    label: t("ownerDashboard.tournaments.topScorerAward", { defaultValue: "Top Scorer Award" }),
                    value: detail.topScorerAward,
                    position: "top_scorer",
                  },
                ]
                  .map((award) => ({
                    ...award,
                    label: String(award.label).replace(/\s*\(AFN\)\s*/g, "").trim(),
                    value: String(award.value || "").trim(),
                  }))
                  .filter((award) => award.value);
                const getAwardForPosition = (position) =>
                  awardItems.find((award) => award.position === position)?.value || "";
                const getAwardLabelForPosition = (position) =>
                  awardItems.find((award) => award.position === position)?.label || "";
                const topScorerAwardValue = getAwardForPosition("top_scorer");
                const topScorerAwardLabel = getAwardLabelForPosition("top_scorer");

                return (
                  <View style={styles.tournamentCard}>
                    <View style={styles.tournamentHeader}>
                      <View style={styles.tournamentTitleRow}>
                        <Ionicons name="trophy" size={24} color={PRIMARY_COLOR} />
                        <Text style={styles.tournamentName}>{detail.name}</Text>
                      </View>
                      <View
                        style={[
                          styles.statusBadge,
                          status === "pending"
                            ? styles.statusPending
                            : status === "upcoming"
                              ? styles.statusApproved
                              : status === "finished"
                                ? styles.statusApproved
                                : styles.statusRejected,
                        ]}
                      >
                        <Text style={styles.statusText}>
                          {getTournamentStatusLabel(status)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.tournamentDetail}>
                      {detail.gymName} | {detail.startDate} - {detail.endDate}
                    </Text>
                    {detail.time && (
                      <Text style={styles.tournamentDetail}>
                        <Ionicons name="time" size={14} /> Time duration:{" "}
                        {detail.time}
                      </Text>
                    )}
                    <Text style={styles.tournamentDetail}>
                      {t("ownerDashboard.tournaments.registrationPayForTeam", {
                        amount: detail.entryFee,
                        currency: "AFG",
                      })}
                    </Text>
                    {awardItems.length > 0 && (
                      <View style={styles.awardsSummaryCard}>
                        <View style={[styles.awardsSummaryHeader, { flexDirection: getFlexDirection() }]}>
                          <Ionicons name="ribbon-outline" size={16} color={PRIMARY_DARK} />
                          <Text style={[styles.awardsSummaryTitle, getStartMargin(6), localizedTextStyle]}>
                            {t("ownerDashboard.tournaments.awards", { defaultValue: "Awards" })}
                          </Text>
                        </View>
                        {awardItems.map((award) => (
                          <View
                            key={award.label}
                            style={[styles.awardsSummaryRow, { flexDirection: getFlexDirection() }]}
                          >
                            <Text style={[styles.awardsSummaryLabel, localizedTextStyle]}>
                              {award.label}
                            </Text>
                            <Text style={[styles.awardsSummaryValue, localizedTextStyle]}>
                              {award.value}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Progress Status */}
                    {(() => {
                      const totalTeams = (groups.groupA?.length || 0) + (groups.groupB?.length || 0);
                      const completedGroupMatches = groupMatches.filter(m => m.status === "completed").length;
                      const totalGroupMatches = groupMatches.length;
                      const hasKnockout = knockoutMatches.length > 0;
                      const completedKnockout = knockoutMatches.filter(m => m.status === "completed").length;
                      const isChampion = !!championName;
                      
                      let progress;
                      if (isChampion) progress = { label: t("tournaments.championCrowned"), color: PRIMARY_COLOR, icon: "trophy" };
                      else if (completedKnockout > 0 && hasKnockout) progress = { label: t("tournaments.knockoutStage"), color: PRIMARY_DARK, icon: "flash" };
                      else if (totalGroupMatches > 0 && completedGroupMatches === totalGroupMatches && totalTeams >= 4) progress = { label: t("tournaments.groupStageComplete"), color: PRIMARY_COLOR, icon: "checkmark-circle" };
                      else if (completedGroupMatches > 0) progress = { label: t("tournaments.groupStageProgress", { completed: completedGroupMatches, total: totalGroupMatches }), color: PRIMARY_DARK, icon: "football" };
                      else if (totalTeams > 0) progress = { label: t("tournaments.teamsRegistered", { count: totalTeams }), color: PRIMARY_COLOR, icon: "people" };
                      else progress = { label: t("tournaments.registrationOpen"), color: "#6B7280", icon: "time-outline" };
                      
                      return (
                        <View style={[styles.progressStatusOwner, { backgroundColor: progress.color + "20" }]}>
                          <Ionicons name={progress.icon} size={14} color={progress.color} />
                          <Text style={[styles.progressStatusTextOwner, { color: progress.color }]}>{progress.label}</Text>
                        </View>
                      );
                    })()}

                    {/* Groups Section - Always Visible */}
                    <View style={styles.groupsSection}>
                      <Text style={styles.groupsSectionTitle}>
                        {t("tournaments.tournamentGroups")}
                      </Text>
                      <View style={styles.groupRow}>
                        <View style={styles.groupCardSmall}>
                          <View style={styles.groupHeaderSmall}>
                            <View
                              style={[styles.groupBadge, styles.groupABadge]}
                            >
                              <Text style={styles.groupBadgeText}>A</Text>
                            </View>
                            <Text style={styles.groupNameSmall}>{t("tournaments.groupA")}</Text>
                            <Text style={styles.groupCountSmall}>
                              ({groups.groupA?.length || 0})
                            </Text>
                          </View>
                          {groups.groupA?.length > 0 ? (
                            <View style={styles.groupTeamsListSmall}>
                              {groups.groupA.map((team, idx) => {
                                const rosterKey = getTeamRosterKey(detail.id, team, "group-a", idx);
                                const isRosterExpanded = Boolean(expandedTeamRosters[rosterKey]);

                                return (
                                  <View
                                    key={team.id || idx}
                                    style={styles.groupTeamItemSmall}
                                  >
                                    <Text style={styles.groupTeamRankSmall}>
                                      {idx + 1}.
                                    </Text>
                                    <View style={styles.groupTeamDetailsSmall}>
                                      <TouchableOpacity
                                        activeOpacity={0.75}
                                        style={styles.teamRosterToggle}
                                        onPress={() => toggleTeamRoster(rosterKey)}
                                      >
                                        <Text
                                          style={styles.groupTeamNameSmall}
                                          numberOfLines={1}
                                        >
                                          {team.teamName || team.captainName}
                                        </Text>
                                        <Ionicons
                                          name={isRosterExpanded ? "chevron-up" : "chevron-down"}
                                          size={12}
                                          color="#6B7280"
                                        />
                                      </TouchableOpacity>
                                      {isRosterExpanded && renderTeamMembers(team, { compact: true })}
                                    </View>
                                  </View>
                                );
                              })}
                            </View>
                          ) : (
                            <Text style={styles.noTeamsTextSmall}>
                              {t("tournaments.noTeamsYet")}
                            </Text>
                          )}
                        </View>
                        <View style={styles.groupCardSmall}>
                          <View style={styles.groupHeaderSmall}>
                            <View
                              style={[styles.groupBadge, styles.groupBBadge]}
                            >
                              <Text style={styles.groupBadgeText}>B</Text>
                            </View>
                            <Text style={styles.groupNameSmall}>{t("tournaments.groupB")}</Text>
                            <Text style={styles.groupCountSmall}>
                              ({groups.groupB?.length || 0})
                            </Text>
                          </View>
                          {groups.groupB?.length > 0 ? (
                            <View style={styles.groupTeamsListSmall}>
                              {groups.groupB.map((team, idx) => {
                                const rosterKey = getTeamRosterKey(detail.id, team, "group-b", idx);
                                const isRosterExpanded = Boolean(expandedTeamRosters[rosterKey]);

                                return (
                                  <View
                                    key={team.id || idx}
                                    style={styles.groupTeamItemSmall}
                                  >
                                    <Text style={styles.groupTeamRankSmall}>
                                      {idx + 1}.
                                    </Text>
                                    <View style={styles.groupTeamDetailsSmall}>
                                      <TouchableOpacity
                                        activeOpacity={0.75}
                                        style={styles.teamRosterToggle}
                                        onPress={() => toggleTeamRoster(rosterKey)}
                                      >
                                        <Text
                                          style={styles.groupTeamNameSmall}
                                          numberOfLines={1}
                                        >
                                          {team.teamName || team.captainName}
                                        </Text>
                                        <Ionicons
                                          name={isRosterExpanded ? "chevron-up" : "chevron-down"}
                                          size={12}
                                          color="#6B7280"
                                        />
                                      </TouchableOpacity>
                                      {isRosterExpanded && renderTeamMembers(team, { compact: true })}
                                    </View>
                                  </View>
                                );
                              })}
                            </View>
                          ) : (
                            <Text style={styles.noTeamsTextSmall}>
                              {t("tournaments.noTeamsYet")}
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>

                    {pendingApprovalTeams.length > 0 && (
                      <View style={styles.registeredTeamsSection}>
                        <Text style={styles.registeredTeamsTitle}>
                          {t("ownerDashboard.tournaments.pendingTeams")}
                        </Text>
                        {pendingApprovalTeams.map((team, idx) => {
                          const rosterKey = getTeamRosterKey(detail.id, team, "pending", idx);
                          const isRosterExpanded = Boolean(expandedTeamRosters[rosterKey]);

                          return (
                            <View
                              key={team.id || team.teamId || idx}
                              style={styles.registeredTeamItem}
                            >
                              <View style={styles.registeredTeamInfo}>
                                <TouchableOpacity
                                  activeOpacity={0.75}
                                  style={styles.teamRosterToggle}
                                  onPress={() => toggleTeamRoster(rosterKey)}
                                >
                                  <Text style={styles.teamCaptainName}>
                                    {team.teamName || team.captainName}
                                  </Text>
                                  <Ionicons
                                    name={isRosterExpanded ? "chevron-up" : "chevron-down"}
                                    size={14}
                                    color="#6B7280"
                                  />
                                </TouchableOpacity>
                                <Text style={styles.teamPhoneNum}>
                                  {t("ownerDashboard.tournaments.pendingApproval")}
                                </Text>
                                {isRosterExpanded && renderTeamMembers(team)}
                              </View>
                              <View style={styles.teamActionRow}>
                              <TouchableOpacity
                                style={styles.teamApproveButton}
                                onPress={() => handleApproveTeam(detail, team)}
                              >
                                <Text style={styles.teamActionButtonText}>
                                  {t("ownerDashboard.tournaments.approve")}
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.teamRejectButton}
                                onPress={() => handleRejectTeam(detail, team)}
                              >
                                <Text style={styles.teamActionButtonText}>
                                  {t("ownerDashboard.tournaments.reject")}
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.teamGroupButtonA, styles.teamActionButtonDisabled]}
                                disabled
                              >
                                  <Text style={styles.teamActionButtonText}>
                                    {t("tournaments.groupA")}
                                  </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.teamGroupButtonB, styles.teamActionButtonDisabled]}
                                disabled
                              >
                                  <Text style={styles.teamActionButtonText}>
                                    {t("tournaments.groupB")}
                                  </Text>
                              </TouchableOpacity>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {approvedUngroupedTeams.length > 0 && (
                      <View style={styles.registeredTeamsSection}>
                        <Text style={styles.registeredTeamsTitle}>
                          {t("ownerDashboard.tournaments.approvedTeams")}
                        </Text>
                        {approvedUngroupedTeams.map((team, idx) => {
                          const rosterKey = getTeamRosterKey(detail.id, team, "approved", idx);
                          const isRosterExpanded = Boolean(expandedTeamRosters[rosterKey]);

                          return (
                            <View
                              key={team.id || team.teamId || idx}
                              style={styles.registeredTeamItem}
                            >
                              <View style={styles.registeredTeamInfo}>
                                <TouchableOpacity
                                  activeOpacity={0.75}
                                  style={styles.teamRosterToggle}
                                  onPress={() => toggleTeamRoster(rosterKey)}
                                >
                                  <Text style={styles.teamCaptainName}>
                                    {team.teamName || team.captainName}
                                  </Text>
                                  <Ionicons
                                    name={isRosterExpanded ? "chevron-up" : "chevron-down"}
                                    size={14}
                                    color="#6B7280"
                                  />
                                </TouchableOpacity>
                                <Text style={styles.teamPhoneNum}>
                                  {t("ownerDashboard.gyms.approved")}
                                </Text>
                                {isRosterExpanded && renderTeamMembers(team)}
                              </View>
                              <View style={styles.teamActionRow}>
                              <TouchableOpacity
                                style={styles.teamGroupButtonA}
                                onPress={() => handleAssignTeamGroup(detail, team, "A")}
                              >
                                <Text style={styles.teamActionButtonText}>
                                  {t("tournaments.groupA")}
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.teamGroupButtonB}
                                onPress={() => handleAssignTeamGroup(detail, team, "B")}
                              >
                                <Text style={styles.teamActionButtonText}>
                                  {t("tournaments.groupB")}
                                </Text>
                              </TouchableOpacity>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {/* Action Buttons */}
                    {status === "upcoming" && approvedUngroupedTeams.length === 0 && pendingApprovalTeams.length === 0 && (
                      <View style={styles.groupActionButtons}>
                        <TouchableOpacity
                          style={styles.generateMatchButtonA}
                          onPress={() =>
                            handleGenerateGroupMatches(detail, "Group A")
                          }
                          disabled={!groups.groupA || groups.groupA.length < 2}
                        >
                          <Ionicons name="football" size={16} color="#fff" />
                          <Text style={styles.generateMatchButtonText}>
                            {t("tournaments.groupA")}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.generateMatchButtonB}
                          onPress={() =>
                            handleGenerateGroupMatches(detail, "Group B")
                          }
                          disabled={!groups.groupB || groups.groupB.length < 2}
                        >
                          <Ionicons name="football" size={16} color="#fff" />
                          <Text style={styles.generateMatchButtonText}>
                            {t("tournaments.groupB")}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {status === "ongoing" && (
                      <TouchableOpacity
                        style={styles.startKnockoutButton}
                        onPress={() =>
                          handleProgressTournament(
                            detail,
                            groupAStandings,
                            groupBStandings,
                          )
                        }
                      >
                        <Ionicons
                          name="trophy"
                          size={20}
                          color="#fff"
                        />
                        <Text style={styles.startKnockoutButtonText}>
                          {t("ownerDashboard.tournaments.startKnockout")}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {status !== "ongoing" && status !== "upcoming" && (
                      <TouchableOpacity
                        style={styles.startKnockoutButton}
                        onPress={() =>
                          handleStartKnockout(
                            detail,
                            groupAStandings,
                            groupBStandings,
                          )
                        }
                      >
                        <Ionicons
                          name="trophy"
                          size={20}
                          color="#fff"
                        />
                        <Text style={styles.startKnockoutButtonText}>
                          {t("ownerDashboard.tournaments.generateResults")}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {/* Expand/Collapse Button */}
                    <TouchableOpacity
                      style={styles.expandButton}
                      onPress={() => toggleTournamentExpansion(detail.id)}
                    >
                      <Ionicons
                        name={isExpanded ? "chevron-up" : "chevron-down"}
                        size={20}
                        color="#fff"
                      />
                      <Text style={styles.expandButtonText}>
                        {isExpanded ? t("tournaments.less") : t("tournaments.more")}
                      </Text>
                    </TouchableOpacity>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <View style={styles.expandedContent}>
                        {/* Group A Standings */}
                        {groupAStandings.length > 0 && (
                          <View style={styles.standingsSection}>
                            <Text style={styles.standingsTitle}>
                              {t("tournaments.groupAStandings")}
                            </Text>
                            <View style={styles.standingsTable}>
                              <View style={styles.standingsHeader}>
                                <Text
                                  style={[
                                    styles.standingsHeaderText,
                                    styles.colTeam,
                                  ]}
                                >
                                  Team
                                </Text>
                                <Text
                                  style={[
                                    styles.standingsHeaderText,
                                    styles.colP,
                                  ]}
                                >
                                  P
                                </Text>
                                <Text
                                  style={[
                                    styles.standingsHeaderText,
                                    styles.colW,
                                  ]}
                                >
                                  W
                                </Text>
                                <Text
                                  style={[
                                    styles.standingsHeaderText,
                                    styles.colD,
                                  ]}
                                >
                                  D
                                </Text>
                                <Text
                                  style={[
                                    styles.standingsHeaderText,
                                    styles.colL,
                                  ]}
                                >
                                  L
                                </Text>
                                <Text
                                  style={[
                                    styles.standingsHeaderText,
                                    styles.colGD,
                                  ]}
                                >
                                  GD
                                </Text>
                                <Text
                                  style={[
                                    styles.standingsHeaderText,
                                    styles.colPts,
                                  ]}
                                >
                                  Pts
                                </Text>
                              </View>
                              {groupAStandings.map((stat, idx) => (
                                <View
                                  key={stat.teamId || idx}
                                  style={[
                                    styles.standingsRow,
                                    idx < 2 && styles.qualifierRow,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.standingsCell,
                                      styles.colTeam,
                                    ]}
                                  >
                                    {idx + 1}. {stat.teamName}
                                  </Text>
                                  <Text
                                    style={[styles.standingsCell, styles.colP]}
                                  >
                                    {stat.played}
                                  </Text>
                                  <Text
                                    style={[styles.standingsCell, styles.colW]}
                                  >
                                    {stat.wins}
                                  </Text>
                                  <Text
                                    style={[styles.standingsCell, styles.colD]}
                                  >
                                    {stat.draws}
                                  </Text>
                                  <Text
                                    style={[styles.standingsCell, styles.colL]}
                                  >
                                    {stat.losses}
                                  </Text>
                                  <Text
                                    style={[styles.standingsCell, styles.colGD]}
                                  >
                                    {stat.goalDifference}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.standingsCellPts,
                                      styles.colPts,
                                    ]}
                                  >
                                    {stat.points}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        )}

                        {/* Group B Standings */}
                        {groupBStandings.length > 0 && (
                          <View style={styles.standingsSection}>
                            <Text style={styles.standingsTitle}>
                              {t("tournaments.groupBStandings")}
                            </Text>
                            <View style={styles.standingsTable}>
                              <View style={styles.standingsHeader}>
                                <Text
                                  style={[
                                    styles.standingsHeaderText,
                                    styles.colTeam,
                                  ]}
                                >
                                  Team
                                </Text>
                                <Text
                                  style={[
                                    styles.standingsHeaderText,
                                    styles.colP,
                                  ]}
                                >
                                  P
                                </Text>
                                <Text
                                  style={[
                                    styles.standingsHeaderText,
                                    styles.colW,
                                  ]}
                                >
                                  W
                                </Text>
                                <Text
                                  style={[
                                    styles.standingsHeaderText,
                                    styles.colD,
                                  ]}
                                >
                                  D
                                </Text>
                                <Text
                                  style={[
                                    styles.standingsHeaderText,
                                    styles.colL,
                                  ]}
                                >
                                  L
                                </Text>
                                <Text
                                  style={[
                                    styles.standingsHeaderText,
                                    styles.colGD,
                                  ]}
                                >
                                  GD
                                </Text>
                                <Text
                                  style={[
                                    styles.standingsHeaderText,
                                    styles.colPts,
                                  ]}
                                >
                                  Pts
                                </Text>
                              </View>
                              {groupBStandings.map((stat, idx) => (
                                <View
                                  key={stat.teamId || idx}
                                  style={[
                                    styles.standingsRow,
                                    idx < 2 && styles.qualifierRow,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.standingsCell,
                                      styles.colTeam,
                                    ]}
                                  >
                                    {idx + 1}. {stat.teamName}
                                  </Text>
                                  <Text
                                    style={[styles.standingsCell, styles.colP]}
                                  >
                                    {stat.played}
                                  </Text>
                                  <Text
                                    style={[styles.standingsCell, styles.colW]}
                                  >
                                    {stat.wins}
                                  </Text>
                                  <Text
                                    style={[styles.standingsCell, styles.colD]}
                                  >
                                    {stat.draws}
                                  </Text>
                                  <Text
                                    style={[styles.standingsCell, styles.colL]}
                                  >
                                    {stat.losses}
                                  </Text>
                                  <Text
                                    style={[styles.standingsCell, styles.colGD]}
                                  >
                                    {stat.goalDifference}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.standingsCellPts,
                                      styles.colPts,
                                    ]}
                                  >
                                    {stat.points}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        )}

                        {/* Group Matches */}
                        {groupMatches.length > 0 && (
                          <View style={styles.matchesSection}>
                            <Text style={styles.matchesSectionTitle}>
                              Group Stage Matches ({groupMatches.length})
                            </Text>
                            {groupMatches.map((match, idx) => (
                              <View
                                key={match.id || idx}
                                style={styles.matchItem}
                              >
                                <View
                                  style={[
                                    styles.matchGroupBadge,
                                    match.group === "Group A"
                                      ? styles.groupABadgeMatch
                                      : styles.groupBBadgeMatch,
                                  ]}
                                >
                                  <Text style={styles.matchGroupText}>
                                    {getTournamentGroupLabel(match.group)}
                                  </Text>
                                </View>
                                <View style={styles.matchTeams}>
                                  <Text style={styles.matchTeamName}>
                                    {match.team1Name || t("tournaments.tbd")}
                                  </Text>
                                  <Text style={styles.matchVS}>
                                    {t("tournaments.vs")}
                                  </Text>
                                  <Text style={styles.matchTeamName}>
                                    {match.team2Name || t("tournaments.tbd")}
                                  </Text>
                                </View>
                                <View style={styles.matchScoreRow}>
                                  <Text style={styles.matchStatusText}>
                                    {["completed", "played"].includes(match.status)
                                      ? `${match.score1} - ${match.score2}`
                                      : getTournamentMatchStatusLabel(
                                          match.status,
                                        )}
                                  </Text>
                                  {match.status === "scheduled" && (
                                    <TouchableOpacity
                                      style={styles.enterResultButton}
                                      onPress={() =>
                                        openScoreModal(match, detail)
                                      }
                                    >
                                      <Text style={styles.enterResultText}>
                                        {t("ownerDashboard.tournaments.addScore")}
                                      </Text>
                                    </TouchableOpacity>
                                  )}
                                </View>
                                {match.topPlayerName ? (
                                  <Text style={[styles.matchTopPlayerText, localizedTextStyle]}>
                                    {t("ownerDashboard.tournaments.topPlayer", {
                                      defaultValue: "Top Player",
                                    })}: {match.topPlayerName}
                                    {match.topPlayerGoals !== null && match.topPlayerGoals !== undefined
                                      ? ` (${match.topPlayerGoals})`
                                      : ""}
                                  </Text>
                                ) : null}
                              </View>
                            ))}
                          </View>
                        )}

                        {/* Knockout Section */}
                        {(status === "ongoing" ||
                          knockoutMatches.length > 0 ||
                          detail.knockoutMatches?.length > 0) &&
                          groupAStandings.length >= 2 &&
                          groupBStandings.length >= 2 && (
                            <View style={styles.knockoutSection}>
                              <Text style={styles.knockoutTitle}>
                                {t("tournaments.knockoutStage")}
                              </Text>
                              
                              {/* Match 1: Group A First vs Group B First */}
                              {(() => {
                                const match =
                                  detail.knockoutMatches?.find(
                                    (m) =>
                                      m.round === "Match 1" ||
                                      m.round === "Final",
                                  ) ||
                                  knockoutMatches.find(
                                    (m) =>
                                      m.round === "Match 1" ||
                                      m.round === "Final",
                                  );
                                return (
                                  <View style={styles.knockoutMatchItem}>
                                    <View style={styles.knockoutMatchHeader}>
                                      <Text style={styles.knockoutRound}>
                                        {getTournamentRoundLabel(
                                          match?.round || "Match 1",
                                        )}
                                      </Text>
                                      {match?.status === "completed" && (
                                        <View style={styles.championBadge}>
                                          <Text
                                            style={styles.championBadgeText}
                                          >
                                            {t("ownerDashboard.tournaments.done")}
                                          </Text>
                                        </View>
                                      )}
                                    </View>
                                    <View style={styles.matchTeams}>
                                      <Text style={styles.matchTeamName}>
                                        {match?.team1Name ||
                                          groupAStandings[0]?.teamName ||
                                          t("tournaments.tbd")}
                                      </Text>
                                      <Text style={styles.matchVS}>
                                        {t("tournaments.vs")}
                                      </Text>
                                      <Text style={styles.matchTeamName}>
                                        {match?.team2Name ||
                                          groupBStandings[0]?.teamName ||
                                          t("tournaments.tbd")}
                                      </Text>
                                    </View>
                                    {match?.status === "completed" && (
                                      <Text style={styles.winnerText}>
                                        {t("ownerDashboard.tournaments.winnerLabel")}: {match.winner === match.team1Id ? match.team1Name : match.team2Name}
                                      </Text>
                                    )}
                                    {match?.status === "scheduled" && (
                                      <TouchableOpacity
                                        style={styles.enterResultButton}
                                        onPress={() => openScoreModal(match, detail)}
                                      >
                                        <Text style={styles.enterResultText}>
                                          {t("ownerDashboard.tournaments.addScore")}
                                        </Text>
                                      </TouchableOpacity>
                                    )}
                                    {!match && status === "upcoming" && (
                                      <Text style={styles.matchTeamName}>
                                        {t("tournaments.status.upcoming")}
                                      </Text>
                                    )}
                                  </View>
                                );
                              })()}

                              {/* Match 2: Group A Second vs Group B Second */}
                              {(() => {
                                const match =
                                  detail.knockoutMatches?.find(
                                    (m) =>
                                      m.round === "Match 2" ||
                                      m.round === "Semi-Final" ||
                                      m.round === "Semi-Final 1" ||
                                      m.round === "Semi-Final 2",
                                  ) ||
                                  knockoutMatches.find(
                                    (m) =>
                                      m.round === "Match 2" ||
                                      m.round === "Semi-Final" ||
                                      m.round === "Semi-Final 1" ||
                                      m.round === "Semi-Final 2",
                                  );
                                return (
                                  <View style={styles.knockoutMatchItem}>
                                    <View style={styles.knockoutMatchHeader}>
                                      <Text style={styles.knockoutRound}>
                                        {getTournamentRoundLabel(
                                          match?.round || "Match 2",
                                        )}
                                      </Text>
                                      {match?.status === "completed" && (
                                        <View style={styles.championBadge}>
                                          <Text
                                            style={styles.championBadgeText}
                                          >
                                            {t("ownerDashboard.tournaments.done")}
                                          </Text>
                                        </View>
                                      )}
                                    </View>
                                    <View style={styles.matchTeams}>
                                      <Text style={styles.matchTeamName}>
                                        {match?.team1Name ||
                                          groupAStandings[1]?.teamName ||
                                          t("tournaments.tbd")}
                                      </Text>
                                      <Text style={styles.matchVS}>
                                        {t("tournaments.vs")}
                                      </Text>
                                      <Text style={styles.matchTeamName}>
                                        {match?.team2Name ||
                                          groupBStandings[1]?.teamName ||
                                          t("tournaments.tbd")}
                                      </Text>
                                    </View>
                                    {match?.status === "completed" && (
                                      <Text style={styles.winnerText}>
                                        {t("ownerDashboard.tournaments.winnerLabel")}: {match.winner === match.team1Id ? match.team1Name : match.team2Name}
                                      </Text>
                                    )}
                                    {match?.status === "scheduled" && (
                                      <TouchableOpacity
                                        style={styles.enterResultButton}
                                        onPress={() => openScoreModal(match, detail)}
                                      >
                                        <Text style={styles.enterResultText}>
                                          {t("ownerDashboard.tournaments.addScore")}
                                        </Text>
                                      </TouchableOpacity>
                                    )}
                                    {!match && status === "upcoming" && (
                                      <Text style={styles.matchTeamName}>
                                        {t("tournaments.status.upcoming")}
                                      </Text>
                                    )}
                                  </View>
                                );
                              })()}

                              {/* Challenge Match: Loser Match 1 vs Winner Match 2 */}
                              {(() => {
                                const match =
                                  detail.knockoutMatches?.find(
                                    (m) =>
                                      m.round === "Challenge Match" ||
                                      m.round === "Third Place",
                                  ) ||
                                  knockoutMatches.find(
                                    (m) =>
                                      m.round === "Challenge Match" ||
                                      m.round === "Third Place",
                                  );

                                if (!match) return null;

                                return (
                                  <View style={styles.knockoutMatchItem}>
                                    <View style={styles.knockoutMatchHeader}>
                                      <Text style={styles.knockoutRound}>
                                        {t("ownerDashboard.tournaments.challengeMatch")}
                                      </Text>
                                      {match.status === "completed" && (
                                        <View style={styles.championBadge}>
                                          <Text
                                            style={styles.championBadgeText}
                                          >
                                            {t("ownerDashboard.tournaments.done")}
                                          </Text>
                                        </View>
                                      )}
                                    </View>
                                    <View style={styles.matchTeams}>
                                      <Text style={styles.matchTeamName}>
                                        {match.team1Name || t("tournaments.tbd")}
                                      </Text>
                                      <Text style={styles.matchVS}>
                                        {t("tournaments.vs")}
                                      </Text>
                                      <Text style={styles.matchTeamName}>
                                        {match.team2Name || t("tournaments.tbd")}
                                      </Text>
                                    </View>
                                    {match.status === "completed" && (
                                      <Text style={styles.winnerText}>
                                        {t("ownerDashboard.tournaments.winnerLabel")}:{" "}
                                        {match.winner === match.team1Id
                                          ? match.team1Name
                                          : match.team2Name}
                                      </Text>
                                    )}
                                    {match.status === "scheduled" &&
                                      match.team1Id &&
                                      match.team2Id && (
                                        <TouchableOpacity
                                          style={styles.enterResultButton}
                                          onPress={() =>
                                            openScoreModal(match, detail)
                                          }
                                        >
                                          <Text style={styles.enterResultText}>
                                            {t("ownerDashboard.tournaments.addScore")}
                                          </Text>
                                        </TouchableOpacity>
                                      )}
                                  </View>
                                );
                              })()}

                              {/* Final Ranking */}
                              {(() => {
                                const allStandings = [
                                  ...groupAStandings,
                                  ...groupBStandings,
                                ];
                                const finalMatch = knockoutMatches.find(
                                  (m) =>
                                    m.round === "Final" ||
                                    m.round === "Match 1",
                                );
                                const challengeMatch = knockoutMatches.find(
                                    (m) =>
                                      m.round === "Challenge Match" ||
                                      m.round === "Third Place",
                                  );

                                const champion = finalMatch?.winner;
                                if (!champion) return null;

                                const runnerUp =
                                  challengeMatch?.status === "completed"
                                    ? challengeMatch.winner
                                    : finalMatch?.loser;
                                const thirdPlace =
                                  challengeMatch?.status === "completed"
                                    ? challengeMatch.loser
                                    : null;

                                const getTeamDisplay = (teamId) =>
                                  allStandings.find((s) => s.teamId === teamId)
                                    ?.teamName || String(teamId);
                                const finalRankingRows = [
                                  { position: 1, teamId: champion },
                                  runnerUp ? { position: 2, teamId: runnerUp } : null,
                                  thirdPlace ? { position: 3, teamId: thirdPlace } : null,
                                ].filter(Boolean);

                                return (
                                  <View style={styles.rankingSection}>
                                    <Text style={styles.rankingTitle}>
                                      Final Ranking
                                    </Text>
                                    {finalRankingRows.map((row) => {
                                      const awardValue = getAwardForPosition(row.position);
                                      const awardLabel = getAwardLabelForPosition(row.position);

                                      return (
                                        <View
                                          key={row.position}
                                          style={[
                                            styles.rankingItem,
                                            row.position <= 3 && styles.topThreeRanking,
                                          ]}
                                        >
                                          <Text style={styles.rankingPosition}>#{row.position}</Text>
                                          <View style={styles.rankingTeamContent}>
                                            <Text style={styles.rankingTeamName}>
                                              {getTeamDisplay(row.teamId)}
                                            </Text>
                                            {!!awardValue && (
                                              <Text style={styles.rankingAwardText}>
                                                {awardLabel}: {awardValue}
                                              </Text>
                                            )}
                                          </View>
                                        </View>
                                      );
                                    })}
                                    {detail.topScorer && topScorerAwardValue && (
                                      <View style={styles.finalRankingTopScorer}>
                                        <Ionicons name="football" size={16} color={PRIMARY_DARK} />
                                        <View style={styles.rankingTeamContent}>
                                          <Text style={styles.rankingTeamName}>
                                            {t("ownerDashboard.tournaments.topScorer", {
                                              defaultValue: "Top Scorer",
                                            })}: {detail.topScorer.player_name || detail.topScorer.playerName}
                                          </Text>
                                          <Text style={styles.rankingAwardText}>
                                            {topScorerAwardLabel}: {topScorerAwardValue}
                                          </Text>
                                        </View>
                                      </View>
                                    )}
                                  </View>
                                );
                              })()}
                            </View>
                          )}

                        {/* Champion Section */}
                        {championName && (
                          <View style={styles.championSection}>
                            <Ionicons name="trophy" size={40} color={PRIMARY_COLOR} />
                            <Text style={styles.championLabel}>Champion</Text>
                            <Text style={styles.championName}>
                              {championName}
                            </Text>
                            {detail.topScorer && (
                              <View style={styles.topScorerResult}>
                                <Ionicons name="football" size={18} color={PRIMARY_DARK} />
                                <View style={styles.topScorerResultContent}>
                                  <Text style={[styles.topScorerResultText, localizedTextStyle]}>
                                    {t("ownerDashboard.tournaments.topScorer", {
                                      defaultValue: "Top Scorer",
                                    })}: {detail.topScorer.player_name || detail.topScorer.playerName} ({detail.topScorer.total_goals ?? detail.topScorer.totalGoals})
                                  </Text>
                                  {!!topScorerAwardValue && (
                                    <Text style={[styles.topScorerAwardText, localizedTextStyle]}>
                                      {topScorerAwardLabel}: {topScorerAwardValue}
                                    </Text>
                                  )}
                                </View>
                              </View>
                            )}
                          </View>
                        )}

                        {/* Final Ranking */}
                        {ranking.length > 0 && (
                          <View style={styles.rankingSection}>
                            <Text style={styles.rankingTitle}>
                              Final Ranking
                            </Text>
                            {ranking.map((rank, idx) => (
                              <View
                                key={rank.teamId || idx}
                                style={[
                                  styles.rankingItem,
                                  idx < 3 && styles.topThreeRanking,
                                ]}
                              >
                                <Text style={styles.rankingPosition}>
                                  {idx === 0
                                    ? "🥇"
                                    : idx === 1
                                      ? "🥈"
                                      : idx === 2
                                        ? "🥉"
                                        : `#${rank.position}`}
                                </Text>
                                <View style={styles.rankingTeamContent}>
                                  <Text style={styles.rankingTeamName}>
                                    {rank.teamName}
                                  </Text>
                                  {!!getAwardForPosition(Number(rank.position || idx + 1)) && (
                                    <Text style={styles.rankingAwardText}>
                                      {getAwardLabelForPosition(Number(rank.position || idx + 1))}: {getAwardForPosition(Number(rank.position || idx + 1))}
                                    </Text>
                                  )}
                                </View>
                              </View>
                            ))}
                            {detail.topScorer && topScorerAwardValue && (
                              <View style={styles.finalRankingTopScorer}>
                                <Ionicons name="football" size={16} color={PRIMARY_DARK} />
                                <View style={styles.rankingTeamContent}>
                                  <Text style={styles.rankingTeamName}>
                                    {t("ownerDashboard.tournaments.topScorer", {
                                      defaultValue: "Top Scorer",
                                    })}: {detail.topScorer.player_name || detail.topScorer.playerName}
                                  </Text>
                                  <Text style={styles.rankingAwardText}>
                                    {topScorerAwardLabel}: {topScorerAwardValue}
                                  </Text>
                                </View>
                              </View>
                            )}
                          </View>
                        )}

                        {/* Tournament Status Actions */}
                        {status === "pending" && (
                          <Text style={styles.pendingApprovalText}>
                            Awaiting admin approval
                          </Text>
                        )}

                        <View style={styles.tournamentActions}>
                    {status === "upcoming" &&
                      detail.registeredTeams &&
                      detail.registeredTeams.length >= 2 &&
                      approvedUngroupedTeams.length === 0 &&
                      pendingApprovalTeams.length === 0 && (
                        <View style={styles.groupActionButtons}>
                          <TouchableOpacity
                            style={styles.generateMatchButtonA}
                            onPress={() =>
                              handleGenerateGroupMatches(detail, "Group A")
                            }
                            disabled={!groups.groupA || groups.groupA.length < 2}
                          >
                            <Ionicons name="football" size={16} color="#fff" />
                            <Text style={styles.generateMatchButtonText}>
                              Group A
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.generateMatchButtonB}
                            onPress={() =>
                              handleGenerateGroupMatches(detail, "Group B")
                            }
                            disabled={!groups.groupB || groups.groupB.length < 2}
                          >
                            <Ionicons name="football" size={16} color="#fff" />
                            <Text style={styles.generateMatchButtonText}>
                              Group B
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}

                    {status === "ongoing" && (
                      <TouchableOpacity
                        style={styles.startKnockoutButton}
                        onPress={() =>
                          handleProgressTournament(
                            detail,
                            groupAStandings,
                            groupBStandings,
                          )
                        }
                      >
                        <Ionicons
                          name="trophy"
                          size={20}
                          color="#fff"
                        />
                        <Text style={styles.startKnockoutButtonText}>
                          Progress Tournament
                        </Text>
                      </TouchableOpacity>
                    )}

                    {status !== "ongoing" && (
                      <TouchableOpacity
                        style={styles.startKnockoutButton}
                        onPress={() =>
                          handleStartKnockout(
                            detail,
                            groupAStandings,
                            groupBStandings,
                          )
                        }
                      >
                        <Ionicons
                          name="trophy"
                          size={20}
                          color="#fff"
                        />
                        <Text style={styles.startKnockoutButtonText}>
                          {t("ownerDashboard.tournaments.startKnockout")}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {/* Expand/Collapse Button */}
                    <TouchableOpacity
                      style={styles.expandButton}
                      onPress={() => toggleTournamentExpansion(detail.id)}
                    >
                      <Ionicons
                        name={isExpanded ? "chevron-up" : "chevron-down"}
                        size={20}
                        color="#fff"
                      />
                      <Text style={styles.expandButtonText}>
                        {isExpanded ? t("tournaments.less") : t("tournaments.more")}
                      </Text>
                    </TouchableOpacity>
                    {status === "ongoing" && (
                            <TouchableOpacity
                              style={styles.completeButton}
                              onPress={() =>
                                handleCompleteTournament(
                                  detail,
                                  groupAStandings,
                                  groupBStandings,
                                  knockoutMatches,
                                )
                              }
                            >
                              <Ionicons
                                name="checkmark-circle"
                                size={18}
                                color="#fff"
                              />
                            </TouchableOpacity>
                          )}
                          {status === "finished" && detail.result && (
                            <View style={styles.resultDisplay}>
                              <Text style={styles.resultText}>
                                {t("ownerDashboard.tournaments.winnerLabel")}: {detail.result.winner}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    )}
                  </View>
                );
              }}
              keyExtractor={(item, index) =>
                String(item.id ?? item.tournamentId ?? item.name ?? `tournament-${index}`)
              }
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="trophy-outline" size={60} color="#ccc" />
              <Text style={styles.emptyText}>
                {t("ownerDashboard.tournaments.noTournamentsYet")}
              </Text>
              <Text style={styles.emptySubtext}>
                {t("ownerDashboard.tournaments.addFirstTournament")}
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => setShowTournamentModal(true)}
              >
                <Text style={styles.emptyButtonText}>
                  {t("ownerDashboard.tournaments.addTournament")}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : null}

      {/* View All Gyms Button */}
      <TouchableOpacity
        style={styles.viewAllButton}
        onPress={() => router.push("/")}
      >
        <Ionicons name="eye-outline" size={20} color={PRIMARY_COLOR} />
        <Text style={styles.viewAllText}>
          {t("ownerDashboard.gyms.viewAllGymsUserView")}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={showExpenseForm}
        transparent
        animationType="slide"
        onRequestClose={() => setShowExpenseForm(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.expenseModalContainer}>
              <ScrollView
                ref={financeScrollRef}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.expenseModalContent}
              >
                <View
                  style={[
                    styles.expenseModalHeader,
                    { flexDirection: getFlexDirection() },
                  ]}
                >
                  <Text style={styles.expenseModalTitle}>
                    {t("ownerDashboard.finance.addExpense")}
                  </Text>

                  <TouchableOpacity onPress={() => setShowExpenseForm(false)}>
                    <Text style={styles.expenseModalClose}>
                      {t("ownerDashboard.finance.cancel")}
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text   style={[
    styles.inputLabel,
    {
      textAlign: getTextAlign(),
      writingDirection: getWritingDirection(),
      alignSelf: getTextAlign() === "right" ? "flex-end" : "flex-start",
    },
  ]}>
                  {t("ownerDashboard.finance.selectGym")} *
                </Text>
                <View style={styles.financeSelectorGroup}>
                  {finalOwnerGyms.map((gym, index) => (
                    <TouchableOpacity
                      key={gym.id ?? `expense-gym-${gym.name ?? "gym"}-${index}`}
                      style={[
                        styles.gymSelectorButton,
                        { flexDirection: getFlexDirection(false) },
                        expenseForm.gym === gym.id && styles.gymSelectorButtonActive,
                      ]}
                      onPress={() => updateExpenseForm("gym", gym.id)}
                    >
                      <Ionicons
                        name={expenseForm.gym === gym.id ? "checkbox" : "square-outline"}
                        size={20}
                        color={expenseForm.gym === gym.id ? PRIMARY_COLOR : "#666"}
                      />
                      <Text
                        style={[
                          styles.gymSelectorText,
                          {
                            textAlign: getTextAlign(),
                            writingDirection: getWritingDirection(),
                          },
                          getStartMargin(8),
                        ]}
                      >
                        {gym.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text   style={[
    styles.inputLabel,
    {
      textAlign: getTextAlign(),
      writingDirection: getWritingDirection(),
      alignSelf: getTextAlign() === "right" ? "flex-end" : "flex-start",
    },
  ]}>
                  {t("ownerDashboard.finance.selectExpenseType")} *
                </Text>
                <View style={styles.financeSelectorGroup}>
                  {EXPENSE_TYPE_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.gymSelectorButton,
                        { flexDirection: getFlexDirection() },
                        expenseForm.expense_type === option.value &&
                          styles.gymSelectorButtonActive,
                      ]}
                      onPress={() => updateExpenseForm("expense_type", option.value)}
                    >
                      <Ionicons
                        name={
                          expenseForm.expense_type === option.value
                            ? "checkbox"
                            : "square-outline"
                        }
                        size={20}
                        color={
                          expenseForm.expense_type === option.value ? PRIMARY_COLOR : "#666"
                        }
                      />
                      <Text
                        style={[
                          styles.gymSelectorText,
                          {
                            textAlign: getTextAlign(),
                            writingDirection: getWritingDirection(),
                          },
                          getStartMargin(8),
                        ]}
                      >
                        {getExpenseTypeLabel(option.value)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* <Text style={styles.inputLabel}>
                  {t("ownerDashboard.finance.amount")} *
                </Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        // textAlign: getTextAlign(),
                        writingDirection: getWritingDirection(),
                      },
                    ]}
                    placeholder={t("ownerDashboard.finance.amount")}
                    placeholderTextColor="#999"
                    value={expenseForm.amount}
                    onChangeText={(text) => updateExpenseForm("amount", text)}
                    keyboardType="numeric"
                  />
                </View> */}


                {/* hhhhh */}
<Text
  style={[
    styles.inputLabel,
    {
      textAlign: getTextAlign(),
      writingDirection: getWritingDirection(),
      alignSelf: getTextAlign() === "right" ? "flex-end" : "flex-start",
    },
  ]}
>
  {t("ownerDashboard.finance.amount")} *
</Text>

<View style={styles.inputContainer}>
  <TextInput
    style={[
      styles.input,
      {
        textAlign: getTextAlign(),
        writingDirection: getWritingDirection(),
      },
    ]}
    textAlign={getTextAlign()}
    placeholder={t("ownerDashboard.finance.amount")}
    placeholderTextColor="#999"
    value={expenseForm.amount}
    onChangeText={(text) => updateExpenseForm("amount", text)}
    keyboardType="numeric"
  />
</View>

                {/* hhhhh */}

                <Text  style={[
    styles.inputLabel,
    {
      textAlign: getTextAlign(),
      writingDirection: getWritingDirection(),
      alignSelf: getTextAlign() === "right" ? "flex-end" : "flex-start",
    },
  ]}>
                  {t("ownerDashboard.finance.expenseDate")} *
                </Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        textAlign: getTextAlign(),
                        writingDirection: getWritingDirection(true),
                      },
                    ]}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#999"
                    value={expenseForm.expense_date}
                    onChangeText={(text) => updateExpenseForm("expense_date", text)}
                    autoCapitalize="none"
                    onFocus={() => {
                      setTimeout(() => {
                        financeScrollRef.current?.scrollToEnd({ animated: true });
                      }, 250);
                    }}
                  />
                </View>

                <Text   style={[
    styles.inputLabel,
    {
      textAlign: getTextAlign(),
      writingDirection: getWritingDirection(),
      alignSelf: getTextAlign() === "right" ? "flex-end" : "flex-start",
    },
  ]}>
                  {t("ownerDashboard.finance.notes")}
                </Text>
                <View
                  style={[
                    styles.inputContainer,
                    styles.textAreaContainer,
                    { alignItems: rtl ? "flex-end" : "flex-start" },
                  ]}
                >
                  <TextInput
                    style={[
                      styles.textArea,
                      {
                        textAlign: getTextAlign(),
                        writingDirection: getWritingDirection(),
                      },
                    ]}
                    placeholder={t("ownerDashboard.finance.notes")}
                    placeholderTextColor="#999"
                    value={expenseForm.notes}
                    onChangeText={(text) => updateExpenseForm("notes", text)}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    blurOnSubmit={false}
                    returnKeyType="done"
                    onFocus={() => {
                      setTimeout(() => {
                        financeScrollRef.current?.scrollToEnd({ animated: true });
                      }, 250);
                    }}
                  />
                </View>

                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    savingExpense && styles.primaryButtonDisabled,
                  ]}
                  onPress={handleCreateExpense}
                  disabled={savingExpense}
                >
                  {savingExpense ? (
                    <Text style={styles.primaryButtonText}>
                      {t("ownerDashboard.finance.saving")}
                    </Text>
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {t("ownerDashboard.finance.saveExpense")}
                    </Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* <Modal
        visible={timeSlotsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeTimeSlotsModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.timeSlotsModal}>
            <View style={styles.timeSlotsModalHeader}>
              

              <TouchableOpacity onPress={closeTimeSlotsModal}>
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
              <Text style={styles.timeSlotsModalTitle}>
                {t("ownerDashboard.slots.bookingTimeSlots")}
              </Text>
            </View>

            <Text    style={styles.modalSubtitle}>
              {selectedGymForSlots?.name} 
            </Text>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 24 }}
            >
              {(() => {
                const slots =
                  selectedGymForSlots?.schedulePreview ||
                  selectedGymForSlots?.timeSlots ||
                  selectedGymForSlots?.slots ||
                  selectedGymForSlots?.addedTimeSlots ||
                  [];

                const groupedSlots = groupSlotsByDay(slots);
                const entries = Object.entries(groupedSlots);

                if (!entries.length) {
                  return (
                    <Text style={styles.emptySlotsText}>
                      {t("ownerDashboard.slots.noSlots")}
                    </Text>
                  );
                }

                return entries.map(([day, daySlots]) => (
                  <View key={day} style={styles.daySlotsCard}>
                    <Text style={styles.dayTitle}>{formatWeekday(day)}</Text>

                    {daySlots.map((slot, index) => {
                      const slotStatus = getSlotBookingStatus(slot);
                      const isBooked = slotStatus === "booked";

                      return (
                        <View
                          key={slot.id || `${day}-${index}`}
                          style={[
                            styles.slotStatusRow,
                            isBooked && styles.slotStatusRowBooked,
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.slotPillText}>
                              {slot.courtName || slot.field_name || slot.fieldName || "Court"}:{" "}
                              {slot.timeLabel ||
                                `${formatTime12Hour(slot.start_time || slot.startTime)} - ${formatTime12Hour(slot.end_time || slot.endTime)}`}
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.slotStatusBadge,
                              isBooked
                                ? styles.slotStatusBadgeBooked
                                : styles.slotStatusBadgeAvailable,
                            ]}
                          >
                            <Text
                              style={[
                                styles.slotStatusBadgeText,
                                isBooked
                                  ? styles.slotStatusBadgeTextBooked
                                  : styles.slotStatusBadgeTextAvailable,
                              ]}
                            >
                              {isBooked
                                ? t("ownerDashboard.slots.booked")
                                : t("ownerDashboard.slots.available")}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ));
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal> */}

      {/* nooooo */}
<Modal
  visible={timeSlotsModalVisible}
  transparent
  animationType="slide"
  onRequestClose={closeTimeSlotsModal}
>
  {(() => {
    const currentLanguage = i18n.language;
    const isRTL = ["ps", "fa"].includes(currentLanguage);

    const rtlTextStyle = {
      textAlign: isRTL ? "right" : "left",
      writingDirection: isRTL ? "rtl" : "ltr",
    };

    const centerTextStyle = {
      textAlign: "center",
      writingDirection: isRTL ? "rtl" : "ltr",
    };

    const slots =
      selectedGymForSlots?.schedulePreview ||
      selectedGymForSlots?.timeSlots ||
      selectedGymForSlots?.slots ||
      selectedGymForSlots?.addedTimeSlots ||
      [];

    const groupedSlots = groupSlotsByDay(slots);
    const entries = Object.entries(groupedSlots);

    return (
      <View style={styles.modalOverlay}>
        <View style={styles.timeSlotsModal}>
          <View
            style={[
              styles.timeSlotsModalHeader,
              {
                flexDirection: isRTL ? "row-reverse" : "row",
              },
            ]}
          >



            
            <Text style={[styles.timeSlotsModalTitle, rtlTextStyle]}>
              {t("ownerDashboard.slots.bookingTimeSlots")}
            </Text>


            <TouchableOpacity onPress={closeTimeSlotsModal}>
              <Text style={[styles.modalCloseText, centerTextStyle]}>
                {t("common.close")}
              </Text>
            </TouchableOpacity>

            
        

              <Text style={[styles.modalSubtitle, rtlTextStyle]}>
            {selectedGymForSlots?.name}
          </Text>

          </View>


          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            {!entries.length ? (
              <Text style={[styles.emptySlotsText, centerTextStyle]}>
                {t("ownerDashboard.slots.noSlots")}
              </Text>
            ) : (
              entries.map(([day, daySlots]) => (
                <View key={day} style={styles.daySlotsCard}>
                  <Text style={[styles.dayTitle, rtlTextStyle]}>
                    {formatWeekday(day)}
                  </Text>

                  {daySlots.map((slot, index) => {
                    const slotStatus = getSlotBookingStatus(slot);
                    const isBooked = slotStatus === "booked";

                    return (
                      <View
                        key={slot.id || `${day}-${index}`}
                        style={[
                          styles.slotStatusRow,
                          {
                            flexDirection: isRTL ? "row-reverse" : "row",
                          },
                          isBooked && styles.slotStatusRowBooked,
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.slotPillText, rtlTextStyle]}>
                            {slot.courtName ||
                              slot.field_name ||
                              slot.fieldName ||
                              t("ownerDashboard.slots.court")}
                            :{" "}
                            {slot.timeLabel ||
                              `${formatTime12Hour(
                                slot.start_time || slot.startTime
                              )} - ${formatTime12Hour(
                                slot.end_time || slot.endTime
                              )}`}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.slotStatusBadge,
                            isBooked
                              ? styles.slotStatusBadgeBooked
                              : styles.slotStatusBadgeAvailable,
                          ]}
                        >
                          <Text
                            style={[
                              styles.slotStatusBadgeText,
                              centerTextStyle,
                              isBooked
                                ? styles.slotStatusBadgeTextBooked
                                : styles.slotStatusBadgeTextAvailable,
                            ]}
                          >
                            {isBooked
                              ? t("ownerDashboard.slots.booked")
                              : t("ownerDashboard.slots.available")}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    );
  })()}
</Modal>

      {/* nooo */}

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
            <View
              style={[
                styles.modalHeader,
                styles.addEditGymModalHeader,
                { flexDirection: getFlexDirection() },
              ]}
            >
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={28} color={PRIMARY_COLOR} />
              </TouchableOpacity>
              <Text
                style={[
                  styles.modalTitle,
                  styles.addEditGymModalTitle,
                  { writingDirection: getWritingDirection() },
                ]}
              >
                {editingGym
                  ? t("ownerDashboard.forms.editGymTitle")
                  : t("ownerDashboard.forms.addGymTitle")}
              </Text>
              <TouchableOpacity onPress={handleSaveGym} disabled={savingGym}>
                <Text style={styles.saveButton}>{t("ownerDashboard.actions.save")}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent}>
              <Text style={[styles.inputLabel, localizedBlockTextStyle]}>
                {t("ownerDashboard.gyms.gymName")} *
              </Text>
              <View
                style={[
                  styles.inputContainer,
                  styles.addEditGymInputContainer,
                  { flexDirection: getFlexDirection() },
                ]}
              >
                <Ionicons
                  name="business-outline"
                  size={20}
                  color={PRIMARY_COLOR}
                  style={rtl ? styles.inputIconRtl : styles.inputIconLtr}
                />
                <TextInput
                  style={[styles.input, localizedTextStyle]}
                  placeholder={t("ownerDashboard.forms.enterGymName")}
                  placeholderTextColor="#999"
                  value={gymName}
                  onChangeText={setGymName}
                />
              </View>

              <Text style={[styles.inputLabel, localizedBlockTextStyle]}>
                {t("ownerDashboard.gyms.address")} *
              </Text>
              <View
                style={[
                  styles.inputContainer,
                  styles.addEditGymInputContainer,
                  { flexDirection: getFlexDirection() },
                ]}
              >
                <Ionicons
                  name="location-outline"
                  size={20}
                  color={PRIMARY_COLOR}
                  style={rtl ? styles.inputIconRtl : styles.inputIconLtr}
                />
                <TextInput
                  style={[styles.input, localizedTextStyle]}
                  placeholder={t("ownerDashboard.forms.enterAddress")}
                  placeholderTextColor="#999"
                  value={gymAddress}
                  onChangeText={setGymAddress}
                />
              </View>

              <Text style={[styles.inputLabel, localizedBlockTextStyle]}>
                {t("ownerDashboard.gyms.city")} *
              </Text>
              <View
                style={[
                  styles.inputContainer,
                  styles.addEditGymInputContainer,
                  { flexDirection: getFlexDirection() },
                ]}
              >
                <Ionicons
                  name="business-outline"
                  size={20}
                  color={PRIMARY_COLOR}
                  style={rtl ? styles.inputIconRtl : styles.inputIconLtr}
                />
                <TextInput
                  style={[styles.input, localizedTextStyle]}
                  placeholder={t("ownerDashboard.forms.enterCity")}
                  placeholderTextColor="#999"
                  value={gymCity}
                  onChangeText={setGymCity}
                />
              </View>

              <Text style={[styles.inputLabel, localizedBlockTextStyle]}>
                {t("ownerDashboard.forms.gymImage")}
              </Text>
              <TouchableOpacity
                style={[styles.imagePickerContainer, styles.addEditGymImagePickerContainer]}
                onPress={pickImage}
              >
                {gymImage ? (
                  <Image
                    source={{ uri: gymImage }}
                    style={styles.selectedImage}
                  />
                ) : (
                  <View
                    style={[
                      styles.imagePickerPlaceholder,
                      styles.addEditGymImagePickerPlaceholder,
                    ]}
                  >
                    <Ionicons name="camera-outline" size={40} color={PRIMARY_COLOR} />
                    <Text
                      style={[
                        styles.imagePickerText,
                        { writingDirection: getWritingDirection(), textAlign: "center" },
                      ]}
                    >
                      {t("ownerDashboard.forms.tapToSelectImage")}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              <Text style={[styles.inputLabel, localizedBlockTextStyle]}>
                {t("ownerDashboard.forms.phone")} *
              </Text>
              <View
                style={[
                  styles.inputContainer,
                  styles.addEditGymInputContainer,
                  { flexDirection: getFlexDirection() },
                ]}
              >
                <Ionicons
                  name="call-outline"
                  size={20}
                  color={PRIMARY_COLOR}
                  style={rtl ? styles.inputIconRtl : styles.inputIconLtr}
                />
                <TextInput
                  style={[styles.input, localizedLtrInputStyle]}
                  placeholder={t("ownerDashboard.forms.enterPhone")}
                  placeholderTextColor="#999"
                  value={gymPhone}
                  onChangeText={setGymPhone}
                  keyboardType="phone-pad"
                />
              </View>

              <Text style={[styles.inputLabel, localizedBlockTextStyle]}>
                {t("ownerDashboard.forms.email")} *
              </Text>
              <View
                style={[
                  styles.inputContainer,
                  styles.addEditGymInputContainer,
                  { flexDirection: getFlexDirection() },
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color={PRIMARY_COLOR}
                  style={rtl ? styles.inputIconRtl : styles.inputIconLtr}
                />
                <TextInput
                  style={[styles.input, localizedLtrInputStyle]}
                  placeholder={t("ownerDashboard.forms.enterEmail")}
                  placeholderTextColor="#999"
                  value={gymEmail}
                  onChangeText={setGymEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <Text style={[styles.inputLabel, localizedBlockTextStyle]}>
                {t("ownerDashboard.gyms.description")}
              </Text>
              <View
                style={[
                  styles.inputContainer,
                  styles.addEditGymInputContainer,
                  styles.textAreaContainer,
                  { alignItems: rtl ? "flex-end" : "flex-start" },
                ]}
              >
                <TextInput
                  style={[styles.textArea, localizedTextStyle]}
                  placeholder={t("ownerDashboard.forms.enterDescription")}
                  placeholderTextColor="#999"
                  value={gymDescription}
                  onChangeText={setGymDescription}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
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
            <KeyboardAvoidingView
              style={styles.courtModalKeyboardContainer}
              behavior={Platform.OS === "ios" ? "padding" : "height"}
            >
              <View style={styles.courtModalContent}>
                <View
                  style={[styles.courtModalHeader, { flexDirection: getFlexDirection() }]}
                >
                  <Text style={[styles.courtModalTitle, localizedTextStyle]}>
                    {t("ownerDashboard.courts.addCourt")}
                  </Text>
                  <TouchableOpacity onPress={() => setShowCourtModal(false)}>
                    <Ionicons name="close" size={50} color="#fff" />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  ref={courtScrollViewRef}
                  style={styles.courtModalBody}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                  contentContainerStyle={styles.courtModalBodyContent}
                >
                  <Text
                    style={[
                      styles.selectedGymLabel,
                      styles.addCourtSelectedGymLabel,
                      localizedTextStyle,
                    ]}
                  >
                    {t("ownerDashboard.courts.addingCourtTo", {
                      name: selectedGymForCourt?.name,
                    })}
                  </Text>

                  <Text style={[styles.inputLabel, localizedTextStyle]}>
                    {t("ownerDashboard.courts.courtName")} *
                  </Text>
                  <View
                    style={[
                      styles.inputContainer,
                      styles.addCourtInputContainer,
                      { flexDirection: getFlexDirection() },
                    ]}
                  >
                    <Ionicons
                      name="layers-outline"
                      size={20}
                      color={PRIMARY_COLOR}
                      style={rtl ? styles.inputIconRtl : styles.inputIconLtr}
                    />
                    <TextInput
                      style={[styles.input, localizedTextStyle]}
                      placeholder={t("ownerDashboard.courts.enterCourtNameExample")}
                      placeholderTextColor="#999"
                      value={courtName}
                      onChangeText={setCourtName}
                      onFocus={() => courtScrollViewRef.current?.scrollToEnd({ animated: true })}
                    />
                  </View>

                    <Text
                      style={[
                        styles.sectionTitle,
                        styles.addCourtSectionTitle,
                        localizedTextStyle,
                      ]}
                    >
                    {t("ownerDashboard.courts.priceSectionTitle", {
                      defaultValue: "Price",
                    })}
                  </Text>
                  <View style={[styles.courtSectionCard, styles.addCourtSectionCard]}>
                    <Text style={[styles.inputLabel, localizedTextStyle]}>
                      {t("ownerDashboard.slots.pricePerHour")}
                    </Text>
                    <View
                      style={[
                        styles.inputContainer,
                        styles.addCourtInputContainer,
                        { flexDirection: getFlexDirection() },
                      ]}
                    >
                      <Ionicons
                        name="pricetag-outline"
                        size={20}
                        color={PRIMARY_COLOR}
                        style={rtl ? styles.inputIconRtl : styles.inputIconLtr}
                      />
                      <TextInput
                        style={[styles.input, localizedLtrInputStyle]}
                        placeholder={t("ownerDashboard.courts.enterPricePerHour", {
                          defaultValue: "Enter price per hour",
                        })}
                        placeholderTextColor="#999"
                        keyboardType="numeric"
                        value={pricePerHour}
                        onChangeText={setPricePerHour}
                        onFocus={() => courtScrollViewRef.current?.scrollToEnd({ animated: true })}
                      />
                    </View>
                  </View>

                  <Text style={[styles.inputLabel, localizedTextStyle]}>
                    {t("ownerDashboard.slots.selectedDate")}
                  </Text>
                  <View
                    style={[
                      styles.inputContainer,
                      styles.addCourtInputContainer,
                      { flexDirection: getFlexDirection() },
                    ]}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={20}
                      color={PRIMARY_COLOR}
                      style={rtl ? styles.inputIconRtl : styles.inputIconLtr}
                    />
                    <TextInput
                      style={[styles.input, localizedLtrInputStyle]}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#999"
                      value={selectedDate}
                      onChangeText={setSelectedDate}
                      autoCapitalize="none"
                      autoCorrect={false}
                      onFocus={() => courtScrollViewRef.current?.scrollToEnd({ animated: true })}
                    />
                  </View>
                  <Text
                    style={[
                      styles.helperText,
                      styles.addCourtHelperText,
                      localizedTextStyle,
                    ]}
                  >
                    {selectedDay && selectedDate
                      ? `${selectedDay} - ${selectedDate}`
                      : t("ownerDashboard.courts.chooseDateToDeriveWeekday")}
                  </Text>
                  <View style={styles.workingHoursCardModern}>
                    <View
                      style={[
                        styles.workingHoursHeaderRow,
                        { flexDirection: getFlexDirection() },
                      ]}
                    >
                      <View style={styles.workingHoursIconBox}>
                        <Text style={styles.workingHoursIcon}>🕒</Text>
                      </View>

                      <View style={styles.workingHoursHeaderText}>
                        <Text
                          style={[
                            styles.workingHoursEyebrowModern,
                            {
                              textAlign: getTextAlign(),
                              writingDirection: getWritingDirection(),
                            },
                          ]}
                        >
                          {t("ownerDashboard.workingHours.eyebrow")}
                        </Text>
                        <Text
                          style={[
                            styles.workingHoursTitleModern,
                            {
                              textAlign: getTextAlign(),
                              writingDirection: getWritingDirection(),
                            },
                          ]}
                        >
                          {t("ownerDashboard.workingHours.title")}
                        </Text>
                        <Text
                          style={[
                            styles.workingHoursDescriptionModern,
                            {
                              textAlign: getTextAlign(),
                              writingDirection: getWritingDirection(),
                            },
                          ]}
                        >
                          {t("ownerDashboard.workingHours.description")}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.workingHoursDivider} />

                    <View style={styles.workingHoursTimesGrid}>
                      <View style={styles.workingTimePanel}>
                        <View
                          style={[
                            styles.workingTimeLabelRow,
                            { flexDirection: getFlexDirection() },
                          ]}
                        >
                          <Text style={styles.openTimeIcon}>↪</Text>
                          <Text style={[styles.workingTimeLabel, localizedTextStyle]}>
                            {t("ownerDashboard.workingHours.opensAt")}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.workingTimeControlRow,
                            { flexDirection: getFlexDirection() },
                          ]}
                        >
                          <View
                            style={[
                              styles.timeInputShell,
                              { flexDirection: getFlexDirection() },
                            ]}
                          >
                            <Text style={styles.timeInputIcon}>🕘</Text>
                            <TextInput
                              style={[styles.workingTimeInput, localizedLtrInputStyle]}
                              placeholder="08:00"
                              placeholderTextColor="#9CA3AF"
                              keyboardType="number-pad"
                              maxLength={5}
                              value={businessHours.open_time}
                              onChangeText={(text) =>
                                setBusinessHours((prev) => ({
                                  ...prev,
                                  open_time: formatTimeInput(text),
                                }))
                              }
                            />
                          </View>

                          <View
                            style={[
                              styles.periodSegmentModern,
                              { flexDirection: getFlexDirection() },
                            ]}
                          >
                            {["AM", "PM"].map((period) => (
                              <TouchableOpacity
                                key={period}
                                style={[
                                  styles.periodSegmentButton,
                                  openPeriod === period &&
                                    styles.periodSegmentButtonActive,
                                ]}
                                onPress={() => setOpenPeriod(period)}
                              >
                                <Text
                                  style={[
                                    styles.periodSegmentText,
                                    openPeriod === period &&
                                      styles.periodSegmentTextActive,
                                  ]}
                                >
                                  {period === "AM"
                                    ? t("ownerDashboard.workingHours.am")
                                    : t("ownerDashboard.workingHours.pm")}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                      </View>

                      <View style={styles.workingTimePanel}>
                        <View
                          style={[
                            styles.workingTimeLabelRow,
                            { flexDirection: getFlexDirection() },
                          ]}
                        >
                          <Text style={styles.closeTimeIcon}>↩</Text>
                          <Text style={[styles.workingTimeLabel, localizedTextStyle]}>
                            {t("ownerDashboard.workingHours.closesAt")}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.workingTimeControlRow,
                            { flexDirection: getFlexDirection() },
                          ]}
                        >
                          <View
                            style={[
                              styles.timeInputShell,
                              { flexDirection: getFlexDirection() },
                            ]}
                          >
                            <Text style={styles.timeInputIcon}>🕘</Text>
                            <TextInput
                              style={[styles.workingTimeInput, localizedLtrInputStyle]}
                              placeholder="10:00"
                              placeholderTextColor="#9CA3AF"
                              keyboardType="number-pad"
                              maxLength={5}
                              value={businessHours.close_time}
                              onChangeText={(text) =>
                                setBusinessHours((prev) => ({
                                  ...prev,
                                  close_time: formatTimeInput(text),
                                }))
                              }
                            />
                          </View>

                          <View
                            style={[
                              styles.periodSegmentModern,
                              { flexDirection: getFlexDirection() },
                            ]}
                          >
                            {["AM", "PM"].map((period) => (
                              <TouchableOpacity
                                key={period}
                                style={[
                                  styles.periodSegmentButton,
                                  closePeriod === period &&
                                    styles.periodSegmentButtonActive,
                                  closePeriod === period &&
                                    period === "PM" &&
                                    styles.periodSegmentButtonDanger,
                                ]}
                                onPress={() => setClosePeriod(period)}
                              >
                                <Text
                                  style={[
                                    styles.periodSegmentText,
                                    closePeriod === period &&
                                      styles.periodSegmentTextActive,
                                  ]}
                                >
                                  {period === "AM"
                                    ? t("ownerDashboard.workingHours.am")
                                    : t("ownerDashboard.workingHours.pm")}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                      </View>
                    </View>

                    <View style={styles.workingHoursNoteBox}>
                      <View style={styles.noteIconCircle}>
                        <Text style={styles.noteIconText}>i</Text>
                      </View>

                      <Text style={styles.noteText}>
                        <Text style={styles.noteTextBold}>
                          {t("ownerDashboard.workingHours.noteTitle")}{" "}
                        </Text>
                        {t("ownerDashboard.workingHours.noteText")}
                      </Text>

                      <Text style={styles.noteCalendarIcon}>📅</Text>
                    </View>
                  </View>

                  {/* 30 Min Prices */}
                  <Text style={[styles.inputLabel, localizedTextStyle, { marginTop: 16 }]}>
                    {t("ownerDashboard.courts.durationPrices", {
                      duration: 30,
                      currency: t("common.currency.afg", { defaultValue: "AFG" }),
                    })}
                  </Text>
                  <View style={styles.priceRow}>
                    <View style={styles.priceColumn}>
                      <Text style={[styles.intervalLabelText, localizedTextStyle]}>
                        {t("ownerDashboard.courts.morning")}
                      </Text>
                      <TextInput
                        style={[
                          styles.priceInput,
                          styles.addCourtPriceInput,
                          localizedLtrInputStyle,
                        ]}
                        placeholder="0"
                        placeholderTextColor="#999"
                        value={priceData[30][0].price}
                        onChangeText={(value) => updatePrice(30, 1, value)}
                        keyboardType="numeric"
                        onFocus={() => courtScrollViewRef.current?.scrollToEnd({ animated: true })}
                      />
                    </View>
                    <View style={styles.priceColumn}>
                      <Text style={[styles.intervalLabelText, localizedTextStyle]}>
                        {t("ownerDashboard.courts.afternoon")}
                      </Text>
                      <TextInput
                        style={[
                          styles.priceInput,
                          styles.addCourtPriceInput,
                          localizedLtrInputStyle,
                        ]}
                        placeholder="0"
                        placeholderTextColor="#999"
                        value={priceData[30][1].price}
                        onChangeText={(value) => updatePrice(30, 2, value)}
                        keyboardType="numeric"
                        onFocus={() => courtScrollViewRef.current?.scrollToEnd({ animated: true })}
                      />
                    </View>
                    <View style={styles.priceColumn}>
                      <Text style={[styles.intervalLabelText, localizedTextStyle]}>
                        {t("ownerDashboard.courts.evening")}
                      </Text>
                      <TextInput
                        style={[
                          styles.priceInput,
                          styles.addCourtPriceInput,
                          localizedLtrInputStyle,
                        ]}
                        placeholder="0"
                        placeholderTextColor="#999"
                        value={priceData[30][2].price}
                        onChangeText={(value) => updatePrice(30, 3, value)}
                        keyboardType="numeric"
                        onFocus={() => courtScrollViewRef.current?.scrollToEnd({ animated: true })}
                      />
                    </View>
                  </View>

                  {/* 60 Min Prices */}
                  <Text style={[styles.inputLabel, localizedTextStyle, { marginTop: 16 }]}>
                    {t("ownerDashboard.courts.durationPrices", {
                      duration: 60,
                      currency: t("common.currency.afg", { defaultValue: "AFG" }),
                    })}
                  </Text>
                  <View style={styles.priceRow}>
                    <View style={styles.priceColumn}>
                      <Text style={[styles.intervalLabelText, localizedTextStyle]}>
                        {t("ownerDashboard.courts.morning")}
                      </Text>
                      <TextInput
                        style={[
                          styles.priceInput,
                          styles.addCourtPriceInput,
                          localizedLtrInputStyle,
                        ]}
                        placeholder="0"
                        placeholderTextColor="#999"
                        value={priceData[60][0].price}
                        onChangeText={(value) => updatePrice(60, 1, value)}
                        keyboardType="numeric"
                        onFocus={() => courtScrollViewRef.current?.scrollToEnd({ animated: true })}
                      />
                    </View>
                    <View style={styles.priceColumn}>
                      <Text style={[styles.intervalLabelText, localizedTextStyle]}>
                        {t("ownerDashboard.courts.afternoon")}
                      </Text>
                      <TextInput
                        style={[
                          styles.priceInput,
                          styles.addCourtPriceInput,
                          localizedLtrInputStyle,
                        ]}
                        placeholder="0"
                        placeholderTextColor="#999"
                        value={priceData[60][1].price}
                        onChangeText={(value) => updatePrice(60, 2, value)}
                        keyboardType="numeric"
                        onFocus={() => courtScrollViewRef.current?.scrollToEnd({ animated: true })}
                      />
                    </View>
                    <View style={styles.priceColumn}>
                      <Text style={[styles.intervalLabelText, localizedTextStyle]}>
                        {t("ownerDashboard.courts.evening")}
                      </Text>
                      <TextInput
                        style={[
                          styles.priceInput,
                          styles.addCourtPriceInput,
                          localizedLtrInputStyle,
                        ]}
                        placeholder="0"
                        placeholderTextColor="#999"
                        value={priceData[60][2].price}
                        onChangeText={(value) => updatePrice(60, 3, value)}
                        keyboardType="numeric"
                        onFocus={() => courtScrollViewRef.current?.scrollToEnd({ animated: true })}
                      />
                    </View>
                  </View>

                  {/* 90 Min Prices */}
                  <Text style={[styles.inputLabel, localizedTextStyle, { marginTop: 16 }]}>
                    {t("ownerDashboard.courts.durationPrices", {
                      duration: 90,
                      currency: t("common.currency.afg", { defaultValue: "AFG" }),
                    })}
                  </Text>
                  <View style={styles.priceRow}>
                    <View style={styles.priceColumn}>
                      <Text style={[styles.intervalLabelText, localizedTextStyle]}>
                        {t("ownerDashboard.courts.morning")}
                      </Text>
                      <TextInput
                        style={[
                          styles.priceInput,
                          styles.addCourtPriceInput,
                          localizedLtrInputStyle,
                        ]}
                        placeholder="0"
                        placeholderTextColor="#999"
                        value={priceData[90][0].price}
                        onChangeText={(value) => updatePrice(90, 1, value)}
                        keyboardType="numeric"
                        onFocus={() => courtScrollViewRef.current?.scrollToEnd({ animated: true })}
                      />
                    </View>
                    <View style={styles.priceColumn}>
                      <Text style={[styles.intervalLabelText, localizedTextStyle]}>
                        {t("ownerDashboard.courts.afternoon")}
                      </Text>
                      <TextInput
                        style={[
                          styles.priceInput,
                          styles.addCourtPriceInput,
                          localizedLtrInputStyle,
                        ]}
                        placeholder="0"
                        placeholderTextColor="#999"
                        value={priceData[90][1].price}
                        onChangeText={(value) => updatePrice(90, 2, value)}
                        keyboardType="numeric"
                        onFocus={() => courtScrollViewRef.current?.scrollToEnd({ animated: true })}
                      />
                    </View>
                    <View style={styles.priceColumn}>
                      <Text style={[styles.intervalLabelText, localizedTextStyle]}>
                        {t("ownerDashboard.courts.evening")}
                      </Text>
                      <TextInput
                        style={[
                          styles.priceInput,
                          styles.addCourtPriceInput,
                          localizedLtrInputStyle,
                        ]}
                        placeholder="0"
                        placeholderTextColor="#999"
                        value={priceData[90][2].price}
                        onChangeText={(value) => updatePrice(90, 3, value)}
                        keyboardType="numeric"
                        onFocus={() => courtScrollViewRef.current?.scrollToEnd({ animated: true })}
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
                    <Text style={[styles.addCourtButtonText, localizedTextStyle]}>
                      {t("ownerDashboard.courts.addCourt")}
                    </Text>
                  </TouchableOpacity>

                </ScrollView>
              </View>
            </KeyboardAvoidingView>
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
              <View
                style={[
                  styles.discountModalHeader,
                  { flexDirection: getFlexDirection() },
                ]}
              >
                <Text
                  style={[
                    styles.discountModalTitle,
                    { writingDirection: getWritingDirection() },
                  ]}
                >
                  {editingDiscount
                    ? tDiscount("editDiscountTitle")
                    : tDiscount("addDiscount")}
                </Text>
                <TouchableOpacity onPress={() => setShowDiscountModal(false)}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              {/* this is discount part */}
              <ScrollView
                style={styles.discountModalBody}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={true}
              >
                <Text style={[styles.selectedGymLabel, localizedBlockTextStyle]}>
                  {tDiscount("managingFor", {
                    name: selectedGymForDiscount?.name || "",
                  })}
                </Text>

                <Text style={[styles.inputLabel, localizedBlockTextStyle]}>
                  {tDiscount("percentage")} *
                </Text>
                <View
                  style={[styles.inputContainer, { flexDirection: getFlexDirection() }]}
                >
                  
                  <TextInput
                    style={[styles.input, localizedLtrInputStyle]}
                    placeholder={tDiscount("percentagePlaceholder")}
                    placeholderTextColor="#999"
                    value={discountValue}
                    onChangeText={setDiscountValue}
                    keyboardType="numeric"
                  />

           <Ionicons
                      name="pricetag-outline"
                      size={20}
                      color={PRIMARY_COLOR}
                      style={rtl ? styles.inputIconRtl : styles.inputIconLtr}
                    />

                </View>

                <Text style={[styles.inputLabel, localizedBlockTextStyle]}>
                  {tDiscount("description")} *
                </Text>
                <View
                  style={[
                    styles.inputContainer,
                    styles.textAreaContainer,
                    { alignItems: rtl ? "flex-end" : "flex-start" },
                  ]}
                >
                  <TextInput
                    style={[styles.textArea, localizedTextStyle]}
                    placeholder={tDiscount("descriptionPlaceholder")}
                    placeholderTextColor="#999"
                    value={discountDescription}
                    onChangeText={setDiscountDescription}
                    multiline
                    numberOfLines={2}
                    textAlignVertical="top"
                  />
                </View>

                <Text style={[styles.inputLabel, localizedBlockTextStyle]}>
                  {tDiscount("code")}
                </Text>
                <View
                  style={[styles.inputContainer, { flexDirection: getFlexDirection() }]}
                >
                 
                  <TextInput
                    style={[styles.input, localizedLtrInputStyle]}
                    placeholder={tDiscount("codePlaceholder")}
                    placeholderTextColor="#999"
                    value={discountCode}
                    onChangeText={setDiscountCode}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />

                     <Ionicons
                      name="barcode-outline"
                      size={20}
                      color={PRIMARY_COLOR}
                      style={rtl ? styles.inputIconRtl : styles.inputIconLtr}
                    />
                </View>

                <Text style={[styles.inputLabel, localizedBlockTextStyle]}>
                  {tDiscount("validFrom")} *
                </Text>
                <View
                  style={[styles.inputContainer, { flexDirection: getFlexDirection() }]}
                >
                 
                  <TextInput
                    style={[styles.input, localizedLtrInputStyle]}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#999"
                    value={validFrom}
                    onChangeText={setValidFrom}
                  />

                     <Ionicons
                      name="calendar-outline"
                      size={20}
                      color={PRIMARY_COLOR}
                      style={rtl ? styles.inputIconRtl : styles.inputIconLtr}
                    />
                </View>

                <Text style={[styles.inputLabel, localizedBlockTextStyle]}>
                  {tDiscount("validTo")} *
                </Text>
                <View
                  style={[styles.inputContainer, { flexDirection: getFlexDirection() }]}
                >
                   
                  <TextInput
                    style={[styles.input, localizedLtrInputStyle]}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#999"
                    value={validTo}
                    onChangeText={setValidTo}
                  />

                   <Ionicons
                      name="calendar-outline"
                      size={20}
                      color={PRIMARY_COLOR}
                      style={rtl ? styles.inputIconRtl : styles.inputIconLtr}
                    />
                </View>

                <Text style={[styles.inputLabel, localizedBlockTextStyle]}>
                  {tDiscount("applicableCourts")}
                </Text>
                <Text style={[styles.courtSelectionHint, localizedBlockTextStyle]}>
                  {tDiscount("applicableCourtsHint")}
                </Text>
                {selectedGymForDiscount?.courts?.map((court, index) => (
                  <TouchableOpacity
                    key={court.id ?? `discount-court-${court.name ?? "court"}-${index}`}
                    style={[
                      styles.courtSelectionItem,
                      { flexDirection: getFlexDirection() },
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
                        selectedCourts.includes(court.id) ? PRIMARY_COLOR : "#666"
                      }
                    />
                    <Text
                      style={[
                        styles.courtSelectionText,
                        localizedTextStyle,
                        getStartMargin(8),
                      ]}
                    >
                      {court.name}
                    </Text>
                  </TouchableOpacity>
                ))}

                <TouchableOpacity
                  style={[
                    styles.saveDiscountButton,
                    { flexDirection: getFlexDirection() },
                  ]}
                  onPress={handleSaveDiscount}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text
                    style={[
                      styles.saveDiscountButtonText,
                      { writingDirection: getWritingDirection() },
                      getStartMargin(8),
                    ]}
                  >
                    {editingDiscount
                      ? tDiscount("updateDiscount")
                      : tDiscount("saveDiscount")}
                  </Text>
                </TouchableOpacity>

                {editingDiscount && (
                  <TouchableOpacity
                    style={[
                      styles.deleteDiscountButton,
                      { flexDirection: getFlexDirection() },
                    ]}
                    onPress={() =>
                      handleDeleteDiscount(
                        selectedGymForDiscount.id,
                        editingDiscount.id,
                        editingDiscount.description,
                      )
                    }
                  >
                    <Ionicons name="trash" size={20} color="#fff" />
                    <Text
                      style={[
                        styles.deleteDiscountButtonText,
                        { writingDirection: getWritingDirection() },
                        getStartMargin(8),
                      ]}
                    >
                      {tDiscount("deleteDiscount")}
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


              <TouchableOpacity onPress={() => setShowTournamentModal(false)}>
              <Ionicons name="close" size={28} color= "#24a731" />
            </TouchableOpacity>
            <Text style={styles.tournamentModalTitle}>
              {editingTournament
                ? t("ownerDashboard.tournaments.editTournament")
                : t("ownerDashboard.tournaments.addTournament")}
            </Text>
          
          </View>

          <ScrollView
            style={styles.tournamentModalScroll}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.inputLabel,localizedTextStyle]}>
              {t("ownerDashboard.tournaments.selectGym")} *
            </Text>
            {finalOwnerGyms.length > 0 ? (
              finalOwnerGyms.map((gym, index) => (
                <TouchableOpacity
                key={gym.id ?? `tournament-gym-${gym.name ?? "gym"}-${index}`}
      style={[
        styles.gymSelectorButton,
        {
          flexDirection: rtl ? "row-reverse" : "row",
          alignItems: "center",
        },
        selectedTournamentGym?.id === gym.id &&
          styles.gymSelectorButtonActive,
      ]}
      onPress={async () => {
        setSelectedTournamentGym(gym);
        await loadTournamentGymCourts(gym);
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
          selectedTournamentGym?.id === gym.id ? PRIMARY_COLOR : "#666"
        }
      />

      <Text
        style={[
          styles.gymSelectorText,
          localizedTextStyle,
          {
            flex: 1,
            textAlign: rtl ? "right" : "left",
            writingDirection: rtl ? "rtl" : "ltr",
          },
        ]}
      >
        {gym.name}
      </Text>
                </TouchableOpacity>
              ))
            ) : (
              <Text style={styles.noGymsText}>
                {t("ownerDashboard.tournaments.noGymsAvailable")}
              </Text>
            )}

            <Text style={[styles.inputLabel,localizedTextStyle, { marginTop: 20 }]}>
              {t("ownerDashboard.tournaments.selectCourts")} *
            </Text>
            {selectedTournamentGym && availableCourts.length > 0 ? (
              availableCourts.map((court, index) => (
                <TouchableOpacity
                  key={court.id ?? `tournament-court-${court.name ?? "court"}-${index}`}
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
                        ? PRIMARY_COLOR
                        : "#666"
                    }
                  
                  />
                  <Text style={styles.gymSelectorText}>{court.name}</Text>
                </TouchableOpacity>
              ))
            ) : selectedTournamentGym ? (
              <Text style={styles.noGymsText}>
                {t("ownerDashboard.tournaments.noCourtsAvailable")}
              </Text>
            ) : null}

            <Text style={[styles.inputLabel,localizedTextStyle, { marginTop: 20 }]}>
              {t("ownerDashboard.tournaments.tournamentName")} *
            </Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={[styles.input, localizedTextStyle]}
                placeholder={t("ownerDashboard.tournaments.enterTournamentName")}
                placeholderTextColor="#999"
                value={tournamentName}
                onChangeText={setTournamentName}
              />
            </View>

            <Text style={[styles.inputLabel, localizedTextStyle,{ marginTop: 15 }]}>
              {t("ownerDashboard.tournaments.registrationPay")}
            </Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={[styles.input, localizedTextStyle]}
                placeholder={t("ownerDashboard.tournaments.enterEntryFee")}
                placeholderTextColor="#999"
                value={tournamentEntryFee}
                onChangeText={setTournamentEntryFee}
                keyboardType="numeric"
              />
            </View>

            <Text style={[styles.inputLabel, localizedTextStyle, { marginTop: 15 }]}>
              {t("ownerDashboard.tournaments.awards", { defaultValue: "Awards" })}
            </Text>
            <View style={styles.awardsGrid}>
              {[
                {
                  label: t("ownerDashboard.tournaments.firstPlaceAward", {
                    defaultValue: "1st Place Award (AFN)",
                  }),
                  value: firstPlaceAward,
                  setter: setFirstPlaceAward,
                },
                {
                  label: t("ownerDashboard.tournaments.secondPlaceAward", {
                    defaultValue: "2nd Place Award (AFN)",
                  }),
                  value: secondPlaceAward,
                  setter: setSecondPlaceAward,
                },
                {
                  label: t("ownerDashboard.tournaments.thirdPlaceAward", {
                    defaultValue: "3rd Place Award (AFN)",
                  }),
                  value: thirdPlaceAward,
                  setter: setThirdPlaceAward,
                },
                {
                  label: t("ownerDashboard.tournaments.topScorerAward", {
                    defaultValue: "Top Scorer Award (AFN)",
                  }),
                  value: topScorerAward,
                  setter: setTopScorerAward,
                },
              ].map((award) => (
                <View key={award.label} style={styles.awardInputGroup}>
                  <Text style={[styles.awardInputLabel, localizedTextStyle]}>
                    {award.label}
                  </Text>
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={[styles.input, localizedTextStyle]}
                      placeholder={t("ownerDashboard.tournaments.enterAward", {
                        defaultValue: "Enter award",
                      })}
                      placeholderTextColor="#999"
                      value={award.value}
                      onChangeText={award.setter}
                    />
                  </View>
                </View>
              ))}
            </View>

            <Text style={[styles.inputLabel, localizedTextStyle,{ marginTop: 15 }]}>
              {t("ownerDashboard.tournaments.startDate")} *
            </Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={[styles.input, localizedTextStyle]}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#999"
                value={tournamentStartDate}
                onChangeText={setTournamentStartDate}
              />
            </View>

            <Text style={[styles.inputLabel,localizedTextStyle, { marginTop: 15 }]}>
              {t("ownerDashboard.tournaments.endDate")} *
            </Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={[styles.input, localizedTextStyle]}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#999"
                value={tournamentEndDate}
                onChangeText={setTournamentEndDate}
              />
            </View>

              <Text style={[styles.inputLabel, localizedTextStyle, { marginTop: 15 }]}>
                {t("ownerDashboard.tournaments.tournamentDurationTime")} *
              </Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={[styles.input, localizedTextStyle]}
                  placeholder={t("ownerDashboard.tournaments.enterDurationExample")}
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
                {editingTournament
                  ? t("ownerDashboard.tournaments.updateTournament")
                  : t("ownerDashboard.tournaments.createTournament")}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Create Match Modal */}
      <Modal
        visible={showMatchModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowMatchModal(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.matchModalOverlay}>
            <View style={styles.matchModalContent}>
              <View style={styles.matchModalHeader}>
                <Text style={[styles.matchModalTitle, localizedTextStyle]}>
                  {t("ownerDashboard.tournaments.generateAllMatches", {
                    defaultValue: "Generate All Matches",
                  })}
                </Text>
                <TouchableOpacity onPress={() => setShowMatchModal(false)}>
                  <Ionicons name="close" size={24} color="#333" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.matchModalBody}>
                <Text style={[styles.selectedTournamentLabel, localizedTextStyle]}>
                  {t("tournaments.tournamentLabel", { defaultValue: "Tournament" })}:{" "}
                  {selectedMatchTournament?.name}
                </Text>

                {selectedMatchTournament?.registeredTeams && (
                  <View style={styles.matchCountInfo}>
                    <Text style={[styles.matchCountText, localizedTextStyle]}>
                      {t("ownerDashboard.tournaments.teamCountSummary", {
                        teams: selectedMatchTournament.registeredTeams.length,
                        matches:
                          (selectedMatchTournament.registeredTeams.length *
                            (selectedMatchTournament.registeredTeams.length - 1)) /
                          2,
                        defaultValue:
                          "Teams: {{teams}} | Total Matches: {{matches}}",
                      })}
                    </Text>
                  </View>
                )}

                <Text style={[styles.inputLabel, localizedTextStyle]}>
                  {t("ownerDashboard.tournaments.selectFirstMatchTeam1", {
                    defaultValue: "Select First Match (Team 1)",
                  })}{" "}
                  *
                </Text>
                <View style={styles.teamSelectorContainer}>
                  {selectedMatchTournament?.registeredTeams?.map((team, index) => (
                    <TouchableOpacity
                      key={team.id ?? team.teamId ?? `match-team1-${team.captainName ?? team.teamName ?? "team"}-${index}`}
                      style={[
                        styles.teamSelectButton,
                        selectedTeam1?.id === team.id &&
                          styles.teamSelectButtonActive,
                      ]}
                      onPress={() => setSelectedTeam1(team)}
                    >
                      <Ionicons
                        name={
                          selectedTeam1?.id === team.id
                            ? "checkbox"
                            : "square-outline"
                        }
                        size={20}
                        color={
                          selectedTeam1?.id === team.id ? PRIMARY_COLOR : "#666"
                        }
                      />
                      <Text style={styles.teamSelectText}>
                        {team.captainName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.inputLabel, localizedTextStyle]}>
                  {t("ownerDashboard.tournaments.selectTeam2", {
                    defaultValue: "Select Team 2",
                  })}{" "}
                  *
                </Text>
                <View style={styles.teamSelectorContainer}>
                  {selectedMatchTournament?.registeredTeams?.map((team, index) => (
                    <TouchableOpacity
                      key={team.id ?? team.teamId ?? `match-team2-${team.captainName ?? team.teamName ?? "team"}-${index}`}
                      style={[
                        styles.teamSelectButton,
                        selectedTeam2?.id === team.id &&
                          styles.teamSelectButtonActive,
                        selectedTeam1?.id === team.id &&
                          styles.teamSelectDisabled,
                      ]}
                      onPress={() => {
                        if (selectedTeam1?.id !== team.id) {
                          setSelectedTeam2(team);
                        }
                      }}
                      disabled={selectedTeam1?.id === team.id}
                    >
                      <Ionicons
                        name={
                          selectedTeam2?.id === team.id
                            ? "checkbox"
                            : "square-outline"
                        }
                        size={20}
                        color={
                          selectedTeam2?.id === team.id ? PRIMARY_COLOR : "#666"
                        }
                      />
                      <Text style={styles.teamSelectText}>
                        {team.captainName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.inputLabel, localizedTextStyle]}>
                  {t("ownerDashboard.tournaments.roundLabel", {
                    defaultValue: "Round",
                  })}
                </Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={[styles.input, localizedLtrInputStyle]}
                    placeholder={t("ownerDashboard.tournaments.enterRoundNumber", {
                      defaultValue: "Enter round number (e.g., 1, 2, 3)",
                    })}
                    placeholderTextColor="#999"
                    value={matchRound}
                    onChangeText={setMatchRound}
                    keyboardType="numeric"
                  />
                </View>

                <TouchableOpacity
                  style={styles.createMatchButton}
                  onPress={handleGenerateAllMatches}
                >
                  <Ionicons name="flash" size={20} color="#fff" />
                  <Text style={styles.createMatchButtonText}>
                    {t("ownerDashboard.tournaments.generateAllMatches", {
                      defaultValue: "Generate All Matches",
                    })}
                  </Text>
                </TouchableOpacity>

                <Text style={[styles.autoGenerateInfo, localizedTextStyle]}>
                  {t("ownerDashboard.tournaments.autoGenerateInfo", {
                    defaultValue:
                      "Select the first match below. The system will automatically generate all remaining match combinations.",
                  })}
                </Text>
              </ScrollView>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Match Result Modal */}
      <Modal
        visible={showMatchResultModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowMatchResultModal(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.matchModalOverlay}>
            <View style={styles.matchModalContent}>
              <View style={styles.matchModalHeader}>
                <Text style={[styles.matchModalTitle, localizedTextStyle]}>
                  {t("ownerDashboard.tournaments.enterMatchScore")}
                </Text>
                <TouchableOpacity
                  onPress={() => setShowMatchResultModal(false)}
                >
                  <Ionicons name="close" size={24} color="#333" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.matchModalBody}>
                {selectedMatch && selectedMatchTournament && (
                  <>
                    <View style={styles.matchDisplay}>
                      <Text style={styles.matchDisplayTeam1}>
                        {getTeamName(
                          selectedMatch.team1Id,
                          selectedMatchTournament,
                        )}
                      </Text>
                      <Text style={styles.matchDisplayVS}>
                        {t("tournaments.vs")}
                      </Text>
                      <Text style={styles.matchDisplayTeam2}>
                        {getTeamName(
                          selectedMatch.team2Id,
                          selectedMatchTournament,
                        )}
                      </Text>
                    </View>

                    <Text style={styles.inputLabel}>
                      {t("ownerDashboard.tournaments.selectWinner")} *
                    </Text>
                    <View style={styles.teamSelectorContainer}>
                      {selectedMatchTournament.registeredTeams
                        ?.filter(
                          (t) =>
                            t.id === selectedMatch.team1Id ||
                            t.id === selectedMatch.team2Id,
                        )
                        .map((team, index) => (
                          <TouchableOpacity
                            key={team.id ?? team.teamId ?? `match-winner-${team.captainName ?? team.teamName ?? "team"}-${index}`}
                            style={[
                              styles.teamSelectButton,
                              resultWinner === team.captainName &&
                                styles.winnerSelectButton,
                            ]}
                            onPress={() => setResultWinner(team.captainName)}
                          >
                            <Ionicons
                              name={
                                resultWinner === team.captainName
                                  ? "radio-button-on"
                                  : "radio-button-off"
                              }
                              size={20}
                              color={
                                resultWinner === team.captainName
                                  ? PRIMARY_COLOR
                                  : "#666"
                              }
                            />
                            <Text style={styles.teamSelectText}>
                              {team.captainName}
                            </Text>
                          </TouchableOpacity>
                        ))}
                    </View>

                    <TouchableOpacity
                      style={styles.saveResultButton}
                      onPress={handleMatchResult}
                    >
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="#fff"
                      />
                      <Text style={styles.saveResultButtonText}>
                        {t("ownerDashboard.tournaments.saveResult")}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Score Entry Modal */}
      <Modal
        visible={showScoreModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowScoreModal(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.matchModalOverlay}>
            <View style={styles.matchModalContent}>
              <View
                style={[styles.matchModalHeader, { flexDirection: getFlexDirection() }]}
              >
                <Text style={styles.matchModalTitle}>
                  {t("ownerDashboard.tournaments.enterMatchScore")}
                </Text>
                <TouchableOpacity onPress={() => setShowScoreModal(false)}>
                  <Ionicons name="close" size={24} color="#333" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.matchModalBody}>
                {editingMatch && (
                  <>
                    <View style={styles.matchDisplay}>
                      <Text style={styles.matchDisplayTeam1}>
                        {editingMatch.team1Name || t("tournaments.tbd")}
                      </Text>
                      <Text style={styles.matchDisplayVS}>
                        {t("tournaments.vs")}
                      </Text>
                      <Text style={styles.matchDisplayTeam2}>
                        {editingMatch.team2Name || t("tournaments.tbd")}
                      </Text>
                    </View>

                    <View style={styles.scoreInputRow}>
                      <View style={styles.scoreInputContainer}>
                        <Text style={styles.scoreLabel}>
                          {editingMatch.team1Name}
                        </Text>
                        <TextInput
                          style={styles.scoreInput}
                          placeholder="0"
                          placeholderTextColor="#999"
                          value={score1Input}
                          onChangeText={setScore1Input}
                          keyboardType="numeric"
                        />
                      </View>
                      <Text style={styles.scoreSeparator}>-</Text>
                      <View style={styles.scoreInputContainer}>
                        <Text style={styles.scoreLabel}>
                          {editingMatch.team2Name}
                        </Text>
                        <TextInput
                          style={styles.scoreInput}
                          placeholder="0"
                          placeholderTextColor="#999"
                          value={score2Input}
                          onChangeText={setScore2Input}
                          keyboardType="numeric"
                        />
                      </View>
                    </View>

                    <Text style={[styles.inputLabel, localizedTextStyle]}>
                      {t("ownerDashboard.tournaments.playerGoals", {
                        defaultValue: "Player Goals",
                      })}{" "}
                      *
                    </Text>
                    <View style={styles.playerGoalsSection}>
                      {getMatchTeams(editingMatch, selectedMatchTournament).map((team) => (
                        <View key={team.id} style={styles.playerGoalsTeamBlock}>
                          <Text style={[styles.playerGoalsTeamTitle, localizedTextStyle]}>
                            {team.teamName || team.captainName}
                          </Text>
                          {(team.members || []).map((player) => {
                            const playerId = player.id || player.memberId;
                            return (
                              <View key={playerId} style={styles.playerGoalRow}>
                                <View style={styles.playerGoalInfo}>
                                  <Text style={[styles.playerGoalName, localizedTextStyle]}>
                                    {player.name}
                                  </Text>
                                  <Text style={[styles.playerGoalRole, localizedTextStyle]}>
                                    {player.role}
                                  </Text>
                                </View>
                                <TextInput
                                  style={styles.playerGoalInput}
                                  placeholder="0"
                                  placeholderTextColor="#999"
                                  value={playerGoalInputs[playerId] || ""}
                                  onChangeText={(value) => setPlayerGoalInput(playerId, value)}
                                  keyboardType="numeric"
                                />
                              </View>
                            );
                          })}
                        </View>
                      ))}
                    </View>

                    <Text style={[styles.inputLabel, localizedTextStyle]}>
                      {t("ownerDashboard.tournaments.topPlayer", {
                        defaultValue: "Top Player",
                      })}{" "}
                      *
                    </Text>
                    <View style={styles.topPlayerSelector}>
                      {getMatchPlayers(editingMatch, selectedMatchTournament).map((player, index) => {
                        const playerId = player.id || player.memberId;
                        const isSelected = String(topPlayerId) === String(playerId);

                        return (
                          <TouchableOpacity
                            key={playerId || `${player.name}-${index}`}
                            style={[
                              styles.topPlayerOption,
                              isSelected && styles.topPlayerOptionActive,
                            ]}
                            onPress={() => selectTopPlayer(playerId)}
                          >
                            <Ionicons
                              name={isSelected ? "radio-button-on" : "radio-button-off"}
                              size={18}
                              color={isSelected ? PRIMARY_COLOR : "#6B7280"}
                            />
                            <View style={styles.topPlayerTextGroup}>
                              <Text style={[styles.topPlayerName, localizedTextStyle]}>
                                {player.name}
                              </Text>
                              <Text style={[styles.topPlayerMeta, localizedTextStyle]}>
                                {player.teamName}
                                {player.role ? ` - ${player.role}` : ""}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <Text style={[styles.inputLabel, localizedTextStyle]}>
                      {t("ownerDashboard.tournaments.topPlayerGoals", {
                        defaultValue: "Top Player Goals",
                      })}{" "}
                      *
                    </Text>
                    <View style={styles.inputContainer}>
                      <TextInput
                        style={[styles.input, localizedLtrInputStyle]}
                        placeholder="0"
                        placeholderTextColor="#999"
                        value={topPlayerGoals}
                        onChangeText={setTopPlayerGoals}
                        keyboardType="numeric"
                      />
                    </View>

                    <TouchableOpacity
                      style={styles.saveResultButton}
                      onPress={handleSaveScore}
                    >
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="#fff"
                      />
                      <Text style={styles.saveResultButtonText}>
                        {t("ownerDashboard.tournaments.saveScore")}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </ScrollView>
            </View>
          </View>
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
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#fff",
    marginTop:7,
    marginBottom:8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
    marginHorizontal: 4,
  },
  tabButtonActive: {
    backgroundColor: PRIMARY_COLOR,
  },
  tabText: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
    textAlign:"center"
  },
  tabTextActive: {
    color: "#fff",
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
    backgroundColor: PRIMARY_COLOR,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: "center",
  },
  addButtonText: {
    color: "#fff",
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
  ownerGymsStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  ownerGymsStatusText: {
    fontSize: 14,
    color: "#6B7280",
  },
  ownerGymsErrorText: {
    fontSize: 13,
    color: "#B45309",
    marginBottom: 12,
  },
  emptyButton: {
    backgroundColor: PRIMARY_COLOR,
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
    borderColor: PRIMARY_COLOR,
  },
  viewAllText: {
    color: PRIMARY_COLOR,
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
  bookingExpandButton: {
    alignSelf: "flex-start",
    alignItems: "center",
    paddingVertical: 6,
  },
  bookingExpandButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: PRIMARY_COLOR,
  },
  bookingExpandedContent: {
    marginTop: 4,
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
    color: PRIMARY_COLOR,
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
  addEditGymModalHeader: {
    borderBottomColor: PRIMARY_BORDER,
  },
  modalTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "bold",
    color: "#1F2937",
    textAlign: "center",
  },
  addEditGymModalTitle: {
    color: PRIMARY_DARK,
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
  addEditGymInputContainer: {
    backgroundColor: PRIMARY_TINT,
    borderColor: PRIMARY_BORDER,
  },
  inputIconLtr: {
    marginRight: 8,
  },
  inputIconRtl: {
    marginLeft: 8,
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
  awardsGrid: {
    gap: 10,
    marginBottom: 8,
  },
  awardInputGroup: {
    gap: 6,
  },
  awardInputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4B5563",
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
    color: PRIMARY_COLOR,
  },
  imagePickerContainer: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 8,
  },
  addEditGymImagePickerContainer: {
    borderColor: PRIMARY_BORDER,
  },
  imagePickerPlaceholder: {
    height: 150,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
  },
  addEditGymImagePickerPlaceholder: {
    backgroundColor: PRIMARY_TINT,
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
    backgroundColor: PRIMARY_COLOR,
    // padding: 20,
    padding: 40,
    marginTop:40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  welcomeText: {
    fontSize: 20,
    color: "#fff",
    fontWeight: "bold",
  },
  logoutButton: {
    // padding: 8,
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
    marginTop:15,
    alignItems: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  statNumber: {
    fontSize: 32,
    fontWeight: "bold",
    color: PRIMARY_COLOR,
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
    color: "#33a01a",
  },
  addButton: {
    flexDirection: "row",
    backgroundColor: PRIMARY_COLOR,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: "center",
  },
  addButtonText: {
    color: "#fff",
    fontWeight: "600",
    marginLeft: 4,
  },
  addExpenseButton: {
    backgroundColor: PRIMARY_COLOR,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 120,
  },
  addExpenseButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  primaryButton: {
    backgroundColor: PRIMARY_COLOR,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 120,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  financeContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  financeSelectorGroup: {
    gap: 10,
    marginBottom: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  expenseModalContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
  },
  expenseModalContent: {
    padding: 20,
    paddingBottom: 40,
  },
  expenseModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  expenseModalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1F2937",
  },
  expenseModalClose: {
    fontSize: 16,
    fontWeight: "600",
    color: "",
  },
  financeInlineState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  financeErrorCard: {
    backgroundColor: "#FEF2F2",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    alignItems: "center",
  },
  financeErrorTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#991B1B",
    marginBottom: 6,
  },
  financeErrorDetail: {
    fontSize: 14,
    color: "#B91C1C",
    textAlign: "center",
  },
  timeSlotsModal: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 4,
    borderTopColor: PRIMARY_COLOR,
    padding: 20,
    maxHeight: "85%",
  },
  timeSlotsModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  timeSlotsModalTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: PRIMARY_DARK,
  },
  modalCloseText: {
    color: PRIMARY_COLOR,
    fontWeight: "700",
  },
  modalSubtitle: {
    color: "#6B7280",
    marginBottom: 16,
  },
  daySlotsCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: PRIMARY_BORDER,
  },
  dayTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 10,
  },
  slotPill: {
    backgroundColor: PRIMARY_TINT,
    borderWidth: 1,
    borderColor: PRIMARY_BORDER,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  slotPillText: {
    color: PRIMARY_DARK,
    fontWeight: "700",
  },
  slotStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PRIMARY_TINT,
    borderWidth: 1,
    borderColor: PRIMARY_BORDER,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    gap: 8,
  },
  slotStatusRowBooked: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  slotStatusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  slotStatusBadgeAvailable: {
    backgroundColor: "#DCFCE7",
  },
  slotStatusBadgeBooked: {
    backgroundColor: "#FEE2E2",
  },
  slotStatusBadgeText: {
    fontSize: 12,
    fontWeight: "800",
  },
  slotStatusBadgeTextAvailable: {
    color: "#166534",
  },
  slotStatusBadgeTextBooked: {
    color: "#991B1B",
  },
  financeChartCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  financeTrendChartWrap: {
    alignItems: "center",
    marginBottom: 16,
  },
  financeTrendLabelsRow: {
    width: 320,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    marginTop: -8,
  },
  financeTrendLabel: {
    flex: 1,
    fontSize: 11,
    color: "#6B7280",
    textAlign: "center",
  },
  financeCircularChartWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  financeDonutCenter: {
    position: "absolute",
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  financeDonutCenterValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1F2937",
  },
  financeLegendList: {
    gap: 10,
  },
  financeLegendRow: {
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  financeLegendLabelWrap: {
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  financeLegendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  financeLegendLabel: {
    fontSize: 14,
    color: "#4B5563",
    flex: 1,
  },
  financeLegendValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: PRIMARY_DARK,
  },
  financeBarChartArea: {
    minHeight: 250,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },
  financeBarItem: {
    flex: 1,
    alignItems: "center",
  },
  financeBarAmount: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 10,
    textAlign: "center",
  },
  financeBarTrack: {
    width: "100%",
    maxWidth: 72,
    height: 160,
    borderRadius: 14,
    backgroundColor: "#E5E7EB",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  financeBarFill: {
    width: "100%",
    minHeight: 0,
    borderRadius: 14,
  },
  financeBarLabel: {
    fontSize: 12,
    color: "#4B5563",
    textAlign: "center",
    marginTop: 10,
  },
  financeGroupedChartArea: {
    minHeight: 250,
    alignItems: "center",
    justifyContent: "flex-end",
    marginBottom: 16,
  },
  financeGroupedBarCluster: {
    width: "70%",
    minHeight: 210,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 18,
  },
  financeGroupedBarItem: {
    flex: 1,
    maxWidth: 88,
    alignItems: "center",
  },
  financeGroupedBarAmount: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 10,
    textAlign: "center",
  },
  financeGroupedBarTrack: {
    width: "100%",
    height: 170,
    borderRadius: 14,
    backgroundColor: "#E5E7EB",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  financeGroupedBarFill: {
    width: "100%",
    borderRadius: 14,
  },
  financeHistoryAmount: {
    fontSize: 16,
    fontWeight: "bold",
    color: PRIMARY_COLOR,
    marginBottom: 4,
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
  gymScheduleSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  gymScheduleTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 8,
  },
  slotsCountText: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
  },
  emptySlotsText: {
    color: "#6B7280",
    fontStyle: "italic",
    marginTop: 8,
  },
  gymScheduleList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  gymSlotChip: {
    backgroundColor: PRIMARY_TINT,
    borderWidth: 1,
    borderColor: PRIMARY_BORDER,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  gymSlotChipText: {
    fontSize: 12,
    color: PRIMARY_COLOR,
    fontWeight: "500",
  },
  gymScheduleEmpty: {
    fontSize: 12,
    color: "#6B7280",
    fontStyle: "italic",
  },
  gymActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 8,
  },
  courtButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: PRIMARY_COLOR,
    justifyContent: "center",
    alignItems: "center",
  },
  discountButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: PRIMARY_COLOR,
    justifyContent: "center",
    alignItems: "center",
  },
  editButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: PRIMARY_COLOR,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: PRIMARY_COLOR,
    justifyContent: "center",
    alignItems: "center",
  },
  timeSlotsActionButton: {
    backgroundColor: PRIMARY_COLOR,
  },
  disabledActionButton: {
    opacity: 0.45,
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
    backgroundColor: PRIMARY_COLOR,
  },
  statusApproved: {
    backgroundColor: PRIMARY_COLOR,
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
    color: PRIMARY_COLOR,
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
  awardsSummaryCard: {
    backgroundColor: PRIMARY_TINT,
    borderColor: PRIMARY_BORDER,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    marginBottom: 10,
    padding: 12,
  },
  awardsSummaryHeader: {
    alignItems: "center",
    marginBottom: 8,
  },
  awardsSummaryTitle: {
    color: PRIMARY_DARK,
    fontSize: 14,
    fontWeight: "700",
  },
  awardsSummaryRow: {
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: PRIMARY_BORDER,
    gap: 10,
  },
  awardsSummaryLabel: {
    color: "#4B5563",
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  awardsSummaryValue: {
    color: "#1F2937",
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
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
    alignItems: "flex-start",
    backgroundColor: "#F3F4F6",
    padding: 8,
    borderRadius: 6,
    marginBottom: 4,
  },
  registeredTeamInfo: {
    flex: 1,
    paddingRight: 8,
  },
  teamRosterToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 24,
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
  teamMembersList: {
    marginTop: 6,
    gap: 3,
  },
  teamMembersCompact: {
    marginTop: 3,
    gap: 2,
    maxHeight: 112,
    overflow: "hidden",
  },
  teamMemberText: {
    fontSize: 11,
    color: "#4B5563",
    lineHeight: 16,
  },
  teamMemberTextCompact: {
    fontSize: 9,
    color: "#6B7280",
    lineHeight: 12,
  },
  teamActionRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 6,
    maxWidth: "58%",
  },
  teamApproveButton: {
    backgroundColor: PRIMARY_COLOR,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  teamRejectButton: {
    backgroundColor: "#EF4444",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  teamGroupButtonA: {
    backgroundColor: PRIMARY_COLOR,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  teamGroupButtonB: {
    backgroundColor: PRIMARY_DARK,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  teamActionButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  teamActionButtonDisabled: {
    opacity: 0.45,
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
    backgroundColor: PRIMARY_COLOR,
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
    backgroundColor: PRIMARY_COLOR,
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
  helperText: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: -4,
    marginBottom: 12,
  },
  courtSectionCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    marginBottom: 16,
  },
  workingHoursCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    marginBottom: 18,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  workingHoursEyebrow: {
    fontSize: 13,
    fontWeight: "800",
    color: PRIMARY_COLOR,
    letterSpacing: 1,
    marginBottom: 8,
  },
  workingHoursTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
  },
  workingHoursDescription: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 18,
  },
  workingHoursCardModern: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: PRIMARY_BORDER,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  workingHoursHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  workingHoursIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: PRIMARY_TINT,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: PRIMARY_BORDER,
  },
  workingHoursIcon: {
    fontSize: 18,
  },
  workingHoursHeaderText: {
    flex: 1,
  },
  workingHoursEyebrowModern: {
    fontSize: 11,
    fontWeight: "900",
    color: PRIMARY_COLOR,
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  workingHoursTitleModern: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 4,
  },
  workingHoursDescriptionModern: {
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 16,
  },
  workingHoursDivider: {
    height: 1,
    backgroundColor: PRIMARY_BORDER,
    marginVertical: 10,
  },
  workingHoursTimesGrid: {
    gap: 8,
  },
  workingTimePanel: {
    backgroundColor: PRIMARY_TINT,
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: PRIMARY_BORDER,
  },
  workingTimeLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 6,
  },
  openTimeIcon: {
    fontSize: 16,
    color: PRIMARY_COLOR,
  },
  closeTimeIcon: {
    fontSize: 16,
    color: PRIMARY_COLOR,
  },
  workingTimeLabel: {
    fontSize: 13,
    fontWeight: "900",
    color: "#111827",
  },
  workingTimeControlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "100%",
  },
  timeInputShell: {
    flex: 1,
    minWidth: 108,
    height: 42,
    borderWidth: 1,
    borderColor: PRIMARY_BORDER,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  timeInputIcon: {
    fontSize: 14,
    color: PRIMARY_COLOR,
    marginRight: 4,
  },
  workingTimeInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
    textAlign: "center",
    includeFontPadding: false,
    paddingVertical: 0,
  },
  periodSegmentModern: {
    flexDirection: "row",
    flexShrink: 0,
    backgroundColor: PRIMARY_TINT,
    borderWidth: 1,
    borderColor: PRIMARY_BORDER,
    borderRadius: 12,
    overflow: "hidden",
  },
  periodSegmentButton: {
    minWidth: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  periodSegmentButtonActive: {
    backgroundColor: PRIMARY_COLOR,
  },
  periodSegmentButtonDanger: {
    backgroundColor: PRIMARY_COLOR,
  },
  periodSegmentText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#6B7280",
  },
  periodSegmentTextActive: {
    color: "#FFFFFF",
  },
  workingHoursNoteBox: {
    marginTop: 10,
    backgroundColor: PRIMARY_TINT,
    borderWidth: 1,
    borderColor: PRIMARY_BORDER,
    borderRadius: 12,
    padding: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  noteIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: PRIMARY_COLOR,
    alignItems: "center",
    justifyContent: "center",
  },
  noteIconText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  noteText: {
    flex: 1,
    fontSize: 11,
    color: "#111827",
    lineHeight: 15,
  },
  noteTextBold: {
    fontWeight: "900",
  },
  noteCalendarIcon: {
    fontSize: 16,
    color: PRIMARY_COLOR,
  },
  cleanTimeBox: {
    backgroundColor: PRIMARY_TINT,
    borderWidth: 1,
    borderColor: PRIMARY_BORDER,
    borderRadius: 18,
    padding: 14,
    marginTop: 14,
  },
  cleanTimeLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: PRIMARY_DARK,
    marginBottom: 10,
  },
  cleanTimeRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  cleanTimePartsRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cleanTimePartInput: {
    flex: 1,
    minWidth: 72,
    height: 64,
    borderWidth: 1,
    borderColor: PRIMARY_BORDER,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    includeFontPadding: false,
  },
  cleanTimeColon: {
    fontSize: 28,
    fontWeight: "900",
    color: PRIMARY_COLOR,
    marginHorizontal: 2,
  },
  cleanPeriodToggle: {
    alignSelf: "stretch",
    flexDirection: "column",
    flexShrink: 0,
    backgroundColor: PRIMARY_TINT,
    borderWidth: 1,
    borderColor: PRIMARY_BORDER,
    borderRadius: 14,
    padding: 3,
  },
  cleanPeriodButton: {
    minWidth: 46,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cleanPeriodButtonActive: {
    backgroundColor: PRIMARY_COLOR,
  },
  cleanPeriodText: {
    fontSize: 13,
    fontWeight: "800",
    color: PRIMARY_COLOR,
  },
  cleanPeriodTextActive: {
    color: "#FFFFFF",
  },
  // Court Modal Styles
  courtModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  courtModalKeyboardContainer: {
    width: "100%",
    alignItems: "center",
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
    backgroundColor: PRIMARY_COLOR,
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
  courtModalBodyContent: {
    paddingBottom: 100,
  },
  addCourtSelectedGymLabel: {
    color: PRIMARY_DARK,
  },
  addCourtInputContainer: {
    backgroundColor: PRIMARY_TINT,
    borderColor: PRIMARY_BORDER,
  },
  addCourtSectionTitle: {
    color: PRIMARY_DARK,
  },
  addCourtSectionCard: {
    backgroundColor: "#f9FAFB",
    borderColor: PRIMARY_BORDER,
  },
  addCourtHelperText: {
    color: PRIMARY_COLOR,
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
  addCourtPriceInput: {
    borderColor: PRIMARY_BORDER,
    backgroundColor: "#FFFFFF",
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
    backgroundColor: PRIMARY_COLOR,
    paddingVertical: 12,
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
    backgroundColor: PRIMARY_COLOR,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  discountModalTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
  },
  discountModalBody: {
    padding: 20,
    minHeight: 400,
  },
  saveDiscountButton: {
    flexDirection: "row",
    backgroundColor: PRIMARY_COLOR,
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
  },
  courtSelectionHint: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: -4,
    marginBottom: 10,
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
    backgroundColor: PRIMARY_TINT,
    borderWidth: 1,
    borderColor: PRIMARY_COLOR,
  },
  courtSelectionText: {
    fontSize: 14,
    color: "#374152",
  },
  saveTournamentButton: {
    flexDirection: "row",
    backgroundColor: PRIMARY_COLOR,
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
    borderColor: PRIMARY_COLOR,
    backgroundColor: PRIMARY_TINT,
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
    backgroundColor: "#F9FA",
    gap: 8,
  },
  courtSelectorButtonActive: {
    borderColor: PRIMARY_COLOR,
    backgroundColor: PRIMARY_TINT,
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
    borderColor: PRIMARY_COLOR,
    backgroundColor: PRIMARY_TINT,
  },
  durationButtonText: {
    fontSize: 14,
    color: "#1F2937",
  },
  durationButtonTextActive: {
    color: PRIMARY_COLOR,
    fontWeight: "bold",
  },
  saveTournamentButton: {
    flexDirection: "row",
    backgroundColor: PRIMARY_COLOR,
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    marginBottom: 20,
    gap: 8,
  },
  saveTournamentButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  // Match Management Styles
  matchesSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  matchesSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 8,
  },
  matchItem: {
    backgroundColor: "#F3F4F6",
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  matchTeams: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  matchTeamName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
    flex: 1,
    textAlign: "center",
  },
  matchVS: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "bold",
    marginHorizontal: 8,
  },
  matchStatusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  matchStatusText: {
    fontSize: 12,
    color: "#6B7280",
  },
  matchTopPlayerText: {
    fontSize: 11,
    color: PRIMARY_DARK,
    marginTop: 6,
  },
  matchCompletedText: {
    color: PRIMARY_COLOR,
    fontWeight: "600",
  },
  matchStatusInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  firstMatchHighlight: {
    borderWidth: 2,
    borderColor: PRIMARY_COLOR,
    backgroundColor: PRIMARY_TINT,
  },
  firstMatchBadge: {
    backgroundColor: PRIMARY_COLOR,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 6,
  },
  firstMatchBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#fff",
  },
  autoMatchBadge: {
    backgroundColor: "#E5E7EB",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 4,
  },
  autoMatchBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#6B7280",
  },
  matchCountInfo: {
    backgroundColor: "#FEF3C7",
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  matchCountText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#92400E",
    textAlign: "center",
  },
  enterResultButton: {
    backgroundColor: PRIMARY_COLOR,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  enterResultText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
  },
  leaderboardSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 10,
  },
  leaderboardTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 8,
    textAlign: "center",
  },
  leaderboardHeader: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  leaderboardHeaderText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    textAlign: "center",
  },
  leaderboardRow: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  leaderboardTeamText: {
    fontSize: 13,
    color: "#1F2937",
    textAlign: "center",
  },
  leaderboardStatText: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
  },
  addMatchButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PRIMARY_COLOR,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  addMatchText: {
    color: "#fff",
    fontWeight: "600",
    marginLeft: 4,
    fontSize: 12,
  },
  matchModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  matchModalContent: {
    backgroundColor: "#fff",
    borderRadius: 20,
    width: "95%",
    maxHeight: "80%",
    overflow: "hidden",
  },
  matchModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 18,
    backgroundColor: PRIMARY_COLOR,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  matchModalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
  },
  matchModalBody: {
    padding: 20,
    minHeight: 300,
  },
  selectedTournamentLabel: {
    fontSize: 14,
    color: "#4B5563",
    marginBottom: 16,
    fontWeight: "600",
  },
  teamSelectorContainer: {
    marginBottom: 16,
  },
  teamSelectButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: "#F3F4F6",
  },
  teamSelectButtonActive: {
    backgroundColor: PRIMARY_TINT,
    borderWidth: 1,
    borderColor: PRIMARY_COLOR,
  },
  teamSelectDisabled: {
    opacity: 0.5,
  },
  teamSelectText: {
    fontSize: 14,
    color: "#1F2937",
    marginLeft: 8,
  },
  createMatchButton: {
    flexDirection: "row",
    backgroundColor: PRIMARY_COLOR,
    paddingVertical: 14,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
  },
  createMatchButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
  autoGenerateInfo: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 12,
    marginBottom: 8,
    fontStyle: "italic",
  },
  matchDisplay: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  matchDisplayTeam1: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
    flex: 1,
    textAlign: "center",
  },
  matchDisplayVS: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "bold",
    marginHorizontal: 12,
  },
  matchDisplayTeam2: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
    flex: 1,
    textAlign: "center",
  },
  winnerSelectButton: {
    backgroundColor: PRIMARY_TINT,
    borderWidth: 1,
    borderColor: PRIMARY_COLOR,
  },
  saveResultButton: {
    flexDirection: "row",
    backgroundColor: PRIMARY_COLOR,
    paddingVertical: 14,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
  },
  saveResultButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
  // Group tournament styles
  groupsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  groupsSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 8,
  },
  groupRow: {
    flexDirection: "row",
    gap: 8,
  },
  groupCardSmall: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    padding: 8,
  },
  groupHeaderSmall: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  groupBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 6,
  },
  groupABadge: {
    backgroundColor: PRIMARY_COLOR,
  },
  groupBBadge: {
    backgroundColor: PRIMARY_DARK,
  },
  groupBadgeText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 10,
  },
  groupNameSmall: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1F2937",
    flex: 1,
  },
  groupCountSmall: {
    fontSize: 10,
    color: "#6B7280",
  },
  groupTeamsListSmall: {
    maxHeight: 180,
    overflow: "hidden",
  },
  groupTeamItemSmall: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 4,
  },
  groupTeamRankSmall: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
    width: 18,
  },
  groupTeamNameSmall: {
    fontSize: 11,
    fontWeight: "600",
    color: "#1F2937",
  },
  groupTeamDetailsSmall: {
    flex: 1,
  },
  noTeamsTextSmall: {
    fontSize: 10,
    color: "#9CA3AF",
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 8,
  },
  groupActionButtons: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  generateMatchButtonA: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PRIMARY_COLOR,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  generateMatchButtonB: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PRIMARY_DARK,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  generateMatchButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13,
  },
  expandButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#24a731",
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
    gap: 4,
  },
  expandButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13,
  },
  expandedContent: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  standingsSection: {
    marginBottom: 16,
  },
  standingsTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 8,
  },
  standingsTable: {
    backgroundColor: "#fff",
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  standingsHeader: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  standingsHeaderText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#6B7280",
    textAlign: "center",
  },
  standingsRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  qualifierRow: {
    backgroundColor: PRIMARY_TINT,
  },
  standingsCell: {
    fontSize: 10,
    color: "#1F2937",
    textAlign: "center",
  },
  standingsCellPts: {
    fontSize: 10,
    fontWeight: "bold",
    color: PRIMARY_COLOR,
    textAlign: "center",
  },
  colTeam: {
    flex: 2,
    textAlign: "left",
  },
  colP: { width: 20 },
  colW: { width: 20 },
  colD: { width: 20 },
  colL: { width: 20 },
  colGD: { width: 25 },
  colPts: { width: 25 },
  matchScoreRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  knockoutSection: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: PRIMARY_TINT,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: PRIMARY_BORDER,
  },
  knockoutTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: PRIMARY_DARK,
    marginBottom: 12,
  },
  knockoutMatchItem: {
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: PRIMARY_BORDER,
  },
  knockoutMatchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  knockoutRound: {
    fontSize: 11,
    fontWeight: "600",
    color: PRIMARY_DARK,
  },
  championBadge: {
    backgroundColor: PRIMARY_COLOR,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  championBadgeText: {
    fontSize: 9,
    color: "#fff",
    fontWeight: "600",
  },
  winnerText: {
    fontSize: 11,
    color: PRIMARY_COLOR,
    fontWeight: "600",
    marginTop: 4,
    textAlign: "center",
  },
  startKnockoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PRIMARY_COLOR,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  startKnockoutButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
  championSection: {
    backgroundColor: PRIMARY_TINT,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  championLabel: {
    fontSize: 12,
    color: PRIMARY_DARK,
    marginTop: 6,
  },
  championName: {
    fontSize: 18,
    fontWeight: "bold",
    color: PRIMARY_DARK,
    marginTop: 2,
  },
  topScorerResult: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
  },
  topScorerResultContent: {
    alignItems: "center",
    flexShrink: 1,
  },
  topScorerResultText: {
    fontSize: 13,
    fontWeight: "600",
    color: PRIMARY_DARK,
  },
  topScorerAwardText: {
    color: PRIMARY_DARK,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  rankingSection: {
    marginBottom: 16,
  },
  rankingTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 8,
  },
  rankingItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#F3F4F6",
    borderRadius: 6,
    marginBottom: 4,
  },
  topThreeRanking: {
    backgroundColor: PRIMARY_TINT,
  },
  rankingPosition: {
    fontSize: 14,
    fontWeight: "bold",
    width: 36,
  },
  rankingTeamName: {
    fontSize: 13,
    color: "#1F2937",
    marginLeft: 6,
  },
  scoreInputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 20,
    gap: 16,
  },
  scoreInputContainer: {
    alignItems: "center",
  },
  scoreLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 6,
  },
  scoreInput: {
    width: 60,
    height: 60,
    borderWidth: 2,
    borderColor: PRIMARY_COLOR,
    borderRadius: 12,
    textAlign: "center",
    fontSize: 24,
    fontWeight: "bold",
    color: "#1F2937",
    backgroundColor: "#F3F4F6",
  },
  scoreSeparator: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#6B7280",
  },
  playerGoalsSection: {
    gap: 10,
    marginBottom: 14,
  },
  playerGoalsTeamBlock: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#F9FAFB",
  },
  playerGoalsTeamTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 8,
  },
  playerGoalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 5,
  },
  playerGoalInfo: {
    flex: 1,
  },
  playerGoalName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1F2937",
  },
  playerGoalRole: {
    fontSize: 10,
    color: "#6B7280",
    marginTop: 1,
  },
  playerGoalInput: {
    width: 48,
    height: 38,
    borderWidth: 1,
    borderColor: PRIMARY_BORDER,
    borderRadius: 8,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
    backgroundColor: "#fff",
  },
  topPlayerSelector: {
    gap: 8,
    marginBottom: 14,
  },
  topPlayerOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    backgroundColor: "#F9FAFB",
  },
  topPlayerOptionActive: {
    borderColor: PRIMARY_COLOR,
    backgroundColor: PRIMARY_TINT,
  },
  topPlayerTextGroup: {
    flex: 1,
  },
  topPlayerName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1F2937",
  },
  topPlayerMeta: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 2,
  },
  progressStatusOwner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 8,
    alignSelf: "flex-start",
  },
  progressStatusTextOwner: {
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 6,
  },
  // Knockout Section Styles
  knockoutSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  knockoutTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 12,
  },
  knockoutMatchItem: {
    backgroundColor: "#F3F4F6",
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  knockoutMatchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  knockoutRound: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1F2937",
  },
  championBadge: {
    backgroundColor: PRIMARY_COLOR,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  championBadgeText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#fff",
  },
  startKnockoutButton: {
    backgroundColor: PRIMARY_COLOR,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  startKnockoutButtonText: {
    color: "#fff",
    fontWeight: "600",
    marginLeft: 8,
  },
  winnerText: {
    marginTop: 8,
    fontSize: 12,
    color: PRIMARY_COLOR,
    fontWeight: "bold",
    textAlign: "center",
  },
  rankingSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  rankingTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 8,
    textAlign: "center",
  },
  rankingItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  rankingPosition: {
    fontSize: 16,
    width: 30,
    textAlign: "center",
  },
  rankingTeamName: {
    flex: 1,
    fontSize: 14,
    color: "#1F2937",
    fontWeight: "600",
  },
  rankingTeamContent: {
    flex: 1,
  },
  rankingAwardText: {
    color: PRIMARY_DARK,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  finalRankingTopScorer: {
    alignItems: "center",
    backgroundColor: PRIMARY_TINT,
    borderColor: PRIMARY_BORDER,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});

